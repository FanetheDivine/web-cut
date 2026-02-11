import type { FC } from 'react'
import { useEffect, useMemo, useRef } from 'react'
import { composeFrame } from '@/features/editor/frameComposer'
import { EditorDndKeys, useEditorStore } from '@/features/editor/store/useEditorStore'
import type { ResourceId } from '@/features/editor/types'

const Page: FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  /**
   * 重要：这里用 selector 把 state 与 actions 分开取，避免后续生成组件时产生不必要的重渲染。
   * - state：只读数据（project/ui/repo 等）
   * - actions：可调用的操作（addResources/moveClip 等）
   */
  const project = useEditorStore((s) => s.project)
  const ui = useEditorStore((s) => s.ui)
  const repo = useEditorStore((s) => s.repo)
  const init = useEditorStore((s) => s.init)

  /**
   * TODO(component-generator): PreviewCanvas 需要一个“video 元素池”
   *
   * 为什么需要池：
   * - `composeFrame` 依赖 `HTMLVideoElement` 获取帧（ctx.drawImage(video, ...)）
   * - 频繁 new Video()/改 src 会导致性能与加载抖动，因此要缓存每个 resourceId 对应的 video
   *
   * 约定（未来生成组件时遵守）：
   * - 每个 `resourceId` 对应一个 `HTMLVideoElement`
   * - video.src 来源于 `repo.getObjectUrl(resourceId)`
   * - video.preload = 'auto'
   * - 在 canplay 之后再参与 composeFrame（否则 drawImage 可能是黑帧或抛异常）
   *
   * 当前页面壳不实现池逻辑，只提供一个 Map 占位，避免未来生成代码时无处挂载。
   */
  const videoPoolRef = useRef<Map<ResourceId, HTMLVideoElement>>(new Map())

  const getVideoElement = useMemo(() => {
    return (resourceId: ResourceId) => videoPoolRef.current.get(resourceId) ?? null
  }, [])

  useEffect(() => {
    void init()
  }, [init])

  /**
   * TODO(component-generator): PreviewCanvas 内部需要一个渲染循环策略
   *
   * 最简单（原型可接受）：
   * - 依赖变更时触发一次合成：project 或 playheadMs 变化 -> composeFrame()
   *
   * 更流畅（推荐）：
   * - 播放态：requestAnimationFrame + playhead 递增
   * - 静止态：仅在 playhead/工程变更时重绘
   * - 使用 requestVideoFrameCallback（若可用）减少 seek 与抖动
   *
   * 当前这里做“单次触发”的最小骨架，方便你后续生成组件时直接迁移到 PreviewCanvas。
   */
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // repo/videoPool 未就绪时，composeFrame 会跳过绘制
    void composeFrame({
      project,
      playheadMs: ui.playheadMs,
      canvas,
      getVideoElement,
    })
  }, [getVideoElement, project, ui.playheadMs, repo])

  return (
    <div className='h-full w-full overflow-hidden bg-zinc-950 text-zinc-50'>
      {/* 顶部区域：左 资源库 / 右 预览 */}
      <div className='grid h-[60%] grid-cols-[360px_1fr] gap-3 p-3'>
        {/* ============ 左上：资源库 ============ */}
        <div className='flex h-full min-h-0 flex-col rounded-lg border border-zinc-800 bg-zinc-900/40'>
          <div className='flex items-center justify-between border-b border-zinc-800 px-3 py-2'>
            <div className='text-sm font-semibold'>资源</div>
            <div className='text-xs text-zinc-400'>全局资源库（可复用/可持久化）</div>
          </div>

          {/*
           * TODO(component-generator): ResourceLibraryPanel（资源库面板）
           *
           * UI 位置：左上角
           *
           * 输入（来自 store）：
           * - `project.resources`：Record<ResourceId, ResourceMeta>
           * - `repo`：ResourceRepository（提供 getObjectUrl / delete 等）
           *
           * 交互（调用 store actions）：
           * - “上传视频/音频”按钮：
           *   - 使用 `loadFile({ accept: 'video/*,audio/*', multiple: true })`
           *   - 成功后 `actions.addResources(files)`
           * - 资源删除：
           *   - `actions.deleteResource(resourceId)`
           *
           * 拖拽（未来用于把资源拖到某个轨道生成 clip）：
           * - 使用 dnd-kit，把资源行设为 draggable
           * - draggable.id 约定：`EditorDndKeys.resource(resourceId)`
           * - data 约定：{ kind: 'resource', resourceId, resourceKind: meta.kind }
           *
           * 展示建议：
           * - 按 kind 分组（video/audio）
           * - 显示 name、duration（若已解析）、mime/size
           * - 点击选中不影响时间轴，仅用于“当前要拖入的资源”高亮（可选）
           */}
          <div className='min-h-0 flex-1 p-3'>
            <div className='h-full rounded-md border border-dashed border-zinc-700/70 bg-zinc-950/30 p-3 text-xs text-zinc-400'>
              这里将渲染 ResourceLibraryPanel（留空占位）
              <div className='mt-2 text-zinc-500'>
                DnD id 约定示例：
                <code className='text-zinc-300'>{EditorDndKeys.resource('resourceId')}</code>
              </div>
            </div>
          </div>
        </div>

        {/* ============ 右上：预览画面 ============ */}
        <div className='flex h-full min-h-0 flex-col rounded-lg border border-zinc-800 bg-zinc-900/40'>
          <div className='flex items-center justify-between border-b border-zinc-800 px-3 py-2'>
            <div className='text-sm font-semibold'>预览</div>
            <div className='text-xs text-zinc-400'>canvas 合成当前帧（playheadMs）</div>
          </div>

          {/*
           * TODO(component-generator): PreviewCanvas（右上角预览组件）
           *
           * 输入（来自 store）：
           * - `project.settings.width/height/backgroundColor`
           * - `ui.playheadMs`
           * - `project.tracks` 与各 track 的 opacity/hidden
           *
           * 依赖（来自 repo/videoPool）：
           * - repo.getObjectUrl(resourceId) -> 设置 video.src
           * - videoPool：Map<ResourceId, HTMLVideoElement>
           *
           * 核心逻辑：
           * - 维护一个 <canvas>（本文件已提供 ref 占位）
           * - 在 playhead 或 project 变化时调用 `composeFrame({ project, playheadMs, canvas, getVideoElement })`
           *
           * 注意事项：
           * - 需要处理视频未加载完成时的黑帧：等待 canplay / readyState >= HAVE_CURRENT_DATA
           * - 频繁 seek 可能卡顿：可做节流或仅当 targetTime 与 currentTime 差异超过阈值才 seek（frameComposer 已做 EPS 判断）
           * - 若要支持“位置/缩放/裁剪”，需要在 clip 上扩展 transform，并在 frameComposer 中应用 drawImage 的参数
           */}
          <div className='min-h-0 flex-1 p-3'>
            <div className='flex h-full items-center justify-center rounded-md bg-black'>
              <canvas ref={canvasRef} className='max-h-full max-w-full' />
            </div>
          </div>

          {/* TODO(component-generator): PreviewControls（播放/暂停/快进/回到起点/时间码） */}
          <div className='border-t border-zinc-800 px-3 py-2 text-xs text-zinc-400'>
            这里将渲染 PreviewControls（留空占位）：播放控制会驱动{' '}
            <code className='text-zinc-300'>ui.playheadMs</code>
          </div>
        </div>
      </div>

      {/* 底部区域：时间轴 + 图层（多轨） */}
      <div className='h-[40%] min-h-0 px-3 pb-3'>
        <div className='flex h-full min-h-0 flex-col rounded-lg border border-zinc-800 bg-zinc-900/40'>
          <div className='flex items-center justify-between border-b border-zinc-800 px-3 py-2'>
            <div className='text-sm font-semibold'>时间轴</div>
            <div className='text-xs text-zinc-400'>多轨（视频/音频/文本）+ clip 拖拽</div>
          </div>

          {/*
           * TODO(component-generator): TimelineEditor（底部核心编辑区）
           *
           * 组成建议（可拆成子组件）：
           * - TrackList（左侧纵向）：显示轨道列表、轨道顺序拖拽、增删轨道、透明度/静音/隐藏等
           * - Ruler（顶部横向）：时间刻度（基于 ui.zoom）
           * - TracksCanvas（右侧主要区域）：每条轨道一行，渲染 clip 条块；支持拖拽/拉伸
           *
           * 输入（来自 store）：
           * - `project.tracks`：Track[]（含 kind、opacity、clips）
           * - `ui.playheadMs` 与 `ui.zoom`
           * - `ui.selectedClipId/selectedTrackId`
           *
           * 输出（调用 store actions）：
           * - 轨道增删：actions.addTrack(kind) / actions.removeTrack(trackId)
           * - 轨道排序：actions.reorderTracksByIndex(from,to)
           * - 透明度：actions.setTrackOpacity(trackId, opacity)
           * - 新建文本 clip：actions.addTextClip({ trackId, startMs, durationMs, text })
           * - 资源 -> clip：
           *   - 当资源被拖入某条轨道的某个时间点时，调用 actions.addClipFromResource({ resourceId, trackId, startMs, durationMs })
           * - clip 选择：actions.selectClip(clipId)
           * - clip 移动（左右拖动改变起始时间）：actions.moveClip(clipId, nextStartMs)
           * - clip 跨轨移动：actions.moveClipToTrack(clipId, nextTrackId, nextStartMs)
           * - clip 拉伸（改变存在时间/时长）：actions.resizeClip(clipId, nextDurationMs, anchor)
           *
           * DnD 约定（与 ops/store 配合）：
           * - 资源拖拽 id：EditorDndKeys.resource(resourceId)
           * - clip 拖拽 id：EditorDndKeys.clip(clipId)
           * - track 拖拽 id：EditorDndKeys.track(trackId)
           * - droppable data 需要包含：trackId、时间轴坐标 -> startMs 的换算参数（由 zoom 与容器滚动决定）
           *
           * 时间换算（重要，避免后续生成组件时混乱）：
           * - UI 以像素表示时间轴位置：xPx
           * - 需要一个比例：msPerPx 或 pxPerMs（二选一即可，统一约定）
           * - 举例：ms = round(xPx * msPerPx)
           *
           * 同轨不重叠规则（核心业务规则已在 ops 中实现）：
           * - 同一轨道内 clip 的区间 [startMs, startMs+durationMs) 不允许重叠
           * - move/resize/cross-track 都会触发校验，若冲突会抛 EditorOpError(code='clip_overlap')
           *
           * 视觉建议（参考截图）：
           * - clip 块可显示缩略图（视频）/波形（音频）/文字预览（文本）
           * - clip 左右边缘拉伸手柄（resize）
           * - 游标（playhead）为一条竖线，拖动游标更新 ui.playheadMs 并触发预览重绘
           */}
          <div className='min-h-0 flex-1 p-3'>
            <div className='h-full rounded-md border border-dashed border-zinc-700/70 bg-zinc-950/30 p-3 text-xs text-zinc-400'>
              这里将渲染 TimelineEditor（留空占位）
              <div className='mt-2 text-zinc-500'>
                clip DnD id 约定示例：
                <code className='text-zinc-300'>{EditorDndKeys.clip('clipId')}</code>
              </div>
            </div>
          </div>

          {/* TODO(component-generator): TimelineStatusBar（显示当前时间码、缩放、对齐吸附开关等） */}
          <div className='border-t border-zinc-800 px-3 py-2 text-xs text-zinc-400'>
            playheadMs: <code className='text-zinc-200'>{ui.playheadMs}</code> / zoom:{' '}
            <code className='text-zinc-200'>{ui.zoom}</code>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Page
