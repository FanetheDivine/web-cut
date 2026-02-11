# WebCut Editor（领域层/工具函数）文档

本文档描述当前仓库中“Web 视频剪辑编辑器”的**领域层骨架**（类型、全局 store、工具函数、资源仓库、帧合成），用于：

- 你后续基于 `src/pages/page.tsx` 的注释生成 UI 组件时，能够直接对接这些 API。
- 明确时间模型、拖拽约定、非重叠规则、持久化边界，避免生成组件时出现行为不一致。

> 约束：此阶段**不实现实际 UI 组件**；组件位置在 `src/pages/page.tsx` 以 TODO 注释形式预留。

---

## 目录与文件速览

核心代码都在 `src/features/editor/`：

- `src/features/editor/types.ts`
  - 领域模型 TypeScript 类型（Project/Track/Clip/ResourceMeta/UIState）
  - 对应的 Zod schema（用于持久化/导入校验）
- `src/features/editor/resourceRepository.ts`
  - `ResourceRepository`：资源二进制（Blob/File）存储 + objectURL 缓存
- `src/features/editor/projectStorage.ts`
  - `ProjectStorage`：工程 JSON（可序列化数据）存储/读取（含 Zod 校验）
- `src/features/editor/ops/*`
  - 纯函数业务规则：轨道/片段增删改、移动/跨轨、非重叠校验等
- `src/features/editor/frameComposer.ts`
  - `composeFrame`：根据游标合成当前帧到 `<canvas>`（原型实现只处理视频轨道绘制）
- `src/features/editor/store/useEditorStore.ts`
  - Zustand store：对外 actions API（给 UI 调用）

页面壳（只含插槽与注释）：

- `src/pages/page.tsx`

---

## 时间单位与区间约定（非常重要）

- **统一时间单位：毫秒（ms）**
  - `startMs`：片段在时间轴上的开始时间
  - `durationMs`：片段在时间轴上占据的时长
  - `playheadMs`：时间轴游标位置（当前帧）
- **区间规则：半开区间 \([startMs, startMs + durationMs)\)**
  - 允许 `end == start` 表示空区间（当前 ops 内部会把最小时长限制为 1ms）
  - “不重叠”判断严格按半开区间：边界相接允许（例如 A 结束时刻 == B 开始时刻）
- DOM API 换算：
  - `HTMLVideoElement.currentTime` 以秒计：`timeSec = ms / 1000`

---

## 核心类型（领域模型）

定义位置：`src/features/editor/types.ts`

### Resource（资源）

当前项目把资源拆为两层：

- **ResourceMeta（可序列化）**：工程里只存 meta
- **Blob/File（二进制）**：由 `ResourceRepository` 管理（IndexedDB + 缓存）

资源类型：

- `ResourceKind = 'video' | 'audio'`

### Track（图层/轨道）

轨道类型：

- `TrackKind = 'video' | 'audio' | 'text'`

轨道核心字段：

- `order`：用于渲染/叠加顺序（越小越先绘制/越靠下，具体策略由 UI 决定）
- `opacity`：0..1（对视频/文本有效；音频轨可忽略或复用做“轨道音量”扩展）
- `clips: Clip[]`：同轨道内**不得重叠**

### Clip（片段）

片段类型：

- `ClipKind = 'video' | 'audio' | 'text'`

所有 clip 共有：

- `trackId`
- `startMs`
- `durationMs`

媒体 clip（视频/音频）额外包含：

- `resourceId`
- `trimStartMs`：资源内裁剪起点（从源媒体的哪个位置开始播放）
- `trimDurationMs?`：资源内裁剪长度（可选）

文本 clip（TextClip）额外包含：

- `text`
- `style`：字体/字号/颜色/对齐等
- `transform`：位置/缩放/旋转（基于画布坐标系，像素单位）

---

## 资源仓库（上传/缓存/持久化）

定义位置：`src/features/editor/resourceRepository.ts`

### 为什么需要 ResourceRepository

工程（project）需要可序列化（用于保存/恢复），但 `File/Blob` 不可直接 JSON 序列化，因此：

- 工程只存 `ResourceMeta`（id/name/mime/duration 等）
- 二进制内容存到 IndexedDB，由 repo 管理

### 接口（简化版）

`ResourceRepository` 核心方法：

- `put(file): Promise<ResourceMeta>`
  - 写入 blob + meta，并返回 meta（包含 `id`）
- `getBlob(id): Promise<Blob | null>`
- `getMeta(id): Promise<ResourceMeta | null>`
- `listMeta(): Promise<ResourceMeta[]>`
- `delete(id): Promise<void>`
- `getObjectUrl(id): Promise<string | null>`
  - 为 `<video src>`/`<audio src>` 提供 objectURL，并内部缓存
- `revokeObjectUrl(id): void`

### 当前实现（原型说明）

当前 repo 默认实现：

- 使用 `idb-keyval` 存 blob/meta
- 使用一个 `index` key 保存 meta 列表
- 使用内存 `Map<ResourceId,string>` 缓存 objectURL，并在 delete/clear 时 revoke

> 注意：IndexedDB 有容量上限且浏览器策略不同，生产级需要更完善的存储/回收/代理文件方案。

---

## 工程持久化（ProjectStorage）

定义位置：`src/features/editor/projectStorage.ts`

- `load(): Promise<EditorProject | null>`
  - 读取 JSON 并用 `EditorProjectSchema.safeParse` 校验
  - 校验失败返回 `null`（让上层创建默认工程）
- `save(project): Promise<void>`

持久化边界：

- **只保存可序列化数据**：tracks、clips、resource meta、settings
- **不保存二进制资源**：二进制由 `ResourceRepository` 负责

---

## 业务规则（ops：纯函数）

定义位置：`src/features/editor/ops/*`

### 设计原则

- ops 只做**纯函数**（输入 project，返回 next project）
- 不直接依赖 React、DOM、Zustand
- 所有“关键规则”集中在 ops：避免 UI 生成后出现不同组件各写一套逻辑

### 非重叠规则

同一轨道内 clip 区间 \([startMs, startMs+durationMs)\) 不允许重叠。

相关方法：

- `canPlaceClipInTrack(trackClips, nextClip, ignoreClipId?)`
- `assertNoOverlap(trackClips, nextClip, ignoreClipId?)`

### 轨道操作

`src/features/editor/ops/trackOps.ts`：

- `addTrack(project, kind, patch?)`
- `removeTrack(project, trackId)`
- `reorderTracksByIndex(project, fromIndex, toIndex)`
- `setTrackOpacity(project, trackId, opacity)`

### 片段操作

`src/features/editor/ops/clipOps.ts`：

- `addVideoClipFromResource(project, input)`
- `addAudioClipFromResource(project, input)`
- `addTextClip(project, input)`
- `removeClip(project, clipId)`
- `moveClipInTrack(project, clipId, nextStartMs)`
- `moveClipToTrack(project, clipId, nextTrackId, nextStartMs)`
- `resizeClip(project, clipId, nextDurationMs, anchor)`
- `updateTextClip(project, clipId, patch)`

### 错误与错误码

定义位置：`src/features/editor/ops/errors.ts`

- `EditorOpError`：包含 `code` 与可选 `details`
- `EditorOpErrorCode`（示例）：
  - `clip_overlap`：同轨 clip 重叠
  - `track_not_found` / `clip_not_found`
  - `track_kind_mismatch` / `resource_kind_mismatch`
  - `invalid_time`

UI 生成建议：

- 捕获 `EditorOpError`，根据 `code` 给出更友好的提示（例如重叠时提示“请移动到空白区域”）。

---

## 帧合成（Preview：canvas）

定义位置：`src/features/editor/frameComposer.ts`

### composeFrame

```ts
composeFrame({
  project,
  playheadMs,
  canvas,
  getVideoElement,
})
```

当前能力（原型）：

- 找到所有在 `playheadMs` 时刻激活的视频 clip
- 对每个激活视频 clip：
  - 计算 sourceTime：`trimStartMs + (playheadMs - clip.startMs)`
  - seek 到对应时间（秒）
  - 用 `ctx.drawImage(video, 0, 0, width, height)` 绘制
  - 应用轨道 `opacity` 叠加

### UI 需要配合的部分（必须实现）

`getVideoElement(resourceId)` 由 UI 提供，通常通过一个 `videoPool: Map<ResourceId, HTMLVideoElement>` 来实现：

- 每个资源 id 对应一个 `<video>`
- `video.src` 来自 `repo.getObjectUrl(resourceId)`
- `video.preload = 'auto'`
- 建议等待 `canplay`/`readyState >= HAVE_CURRENT_DATA` 后再参与渲染

TODO（扩展）：

- 文本轨：在 composer 中绘制 `TextClip`（fillText 或更复杂排版）
- 位置/缩放/裁剪：为 clip 增加 transform，并在 drawImage 使用 9 参数版本
- 音频混音：用 WebAudio graph（此处不在画面合成中处理）

---

## 全局状态（Zustand store）

定义位置：`src/features/editor/store/useEditorStore.ts`

### state

- `project: EditorProject`
- `ui: EditorUIState`
  - `playheadMs`
  - `zoom`
  - `selectedTrackId?` / `selectedClipId?`
- `repo: ResourceRepository | null`
- `lastError?`：最近一次错误（UI 可 toast）

### actions（UI 应主要调用这一层）

初始化/持久化：

- `init()`: 初始化 repo，并尝试从 `ProjectStorage` 加载 project
- `persist()`: 保存当前 project（原型：直接存；未来可节流）

游标/缩放/选择：

- `setPlayheadMs(ms)`
- `setZoom(zoom)`
- `selectClip(clipId?)`
- `selectTrack(trackId?)`

资源：

- `addResources(files)`
- `deleteResource(resourceId)`

轨道：

- `addTrack(kind)`
- `removeTrack(trackId)`
- `reorderTracksByIndex(from,to)`
- `setTrackOpacity(trackId, opacity)`

片段：

- `addClipFromResource({ resourceId, trackId, startMs, durationMs })`
  - store 内会根据资源 kind 自动选择 video/audio clip
- `addTextClip({ trackId, startMs, durationMs, text? })`
- `removeClip(clipId)`
- `moveClip(clipId, nextStartMs)`
- `moveClipToTrack(clipId, nextTrackId, nextStartMs)`
- `resizeClip(clipId, nextDurationMs, anchor)`
- `updateTextClip(clipId, patch)`

---

## DnD 约定（组件生成必须遵守）

定义位置：`src/features/editor/store/useEditorStore.ts`

`EditorDndKeys`：

- `track(trackId) -> "track:<id>"`
- `clip(clipId) -> "clip:<id>"`
- `resource(resourceId) -> "resource:<id>"`
- `project() -> "project"`

建议 data 约定：

- resource draggable data：
  - `{ kind: 'resource', resourceId, resourceKind }`
- clip draggable data：
  - `{ kind: 'clip', clipId, trackId, clipKind }`
- track draggable data：
  - `{ kind: 'track', trackId }`
- droppable（轨道行）data：
  - `{ trackId, msPerPx, scrollLeftPx }`（用于把鼠标 x 换算成 startMs）

---

## 页面壳与组件插槽

文件：`src/pages/page.tsx`

目前页面壳分为三块：

- 左上：`ResourceLibraryPanel` 插槽（资源列表、上传、资源拖拽）
- 右上：`PreviewCanvas` 插槽（canvas 当前帧渲染 + 播放控制）
- 底部：`TimelineEditor` 插槽（多轨时间轴、clip 拖拽/拉伸、游标拖动）

生成组件时请优先遵循 `page.tsx` 内的 TODO 注释（里面已经列出输入/输出/交互/DnD/时间换算的具体要求）。
