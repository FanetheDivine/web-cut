import { z } from 'zod'

/**
 * 约定
 * - 时间单位统一使用毫秒（ms），UI 拖拽/刻度更直观。
 * - 需要喂给 DOM API（video.currentTime 等）时，再换算为秒：sec = ms / 1000。
 * - 本文件只描述“领域模型”，不包含任何 React 组件实现。
 */

/** 资源类型（当前原型只考虑视频/音频；未来可扩展 image 等） */
export type ResourceKind = 'video' | 'audio'

/** 图层类型（= 轨道类型） */
export type TrackKind = 'video' | 'audio' | 'text'

/** Clip 类型 */
export type ClipKind = 'video' | 'audio' | 'text'

/** 主键 id 目前用 string 即可；如需品牌类型可在未来演进 */
export type ResourceId = string
export type TrackId = string
export type ClipId = string

/**
 * 资源元信息（可持久化）
 * - 注意：真实 File/Blob 不可序列化，持久化需要交给 ResourceRepository。
 * - durationMs/width/height 等需要解析媒体才能得出，此处允许为空。
 */
export type ResourceMeta = {
  id: ResourceId
  kind: ResourceKind
  name: string
  mime: string
  size: number
  lastModified: number
  createdAt: number
  durationMs?: number
  width?: number
  height?: number
}

export type TrackBase = {
  id: TrackId
  kind: TrackKind
  name: string
  /** 用于渲染排序（越小越靠下/越先绘制，具体策略由 UI 决定） */
  order: number
  /** 透明度 0..1；对视频/文本有效（音频图层可忽略） */
  opacity: number
  /** 是否静音（仅音频轨道可用；对视频轨道可作为“是否输出音轨”的扩展） */
  muted?: boolean
  /** 是否隐藏（影响预览合成） */
  hidden?: boolean
}

/**
 * Clip 时间模型
 * - startMs：在时间轴上的开始时间
 * - durationMs：在时间轴上占据的时长（同一轨道内 clip 时间段不可重叠）
 */
export type ClipTime = {
  startMs: number
  durationMs: number
}

export type VideoClip = ClipTime & {
  id: ClipId
  kind: 'video'
  trackId: TrackId
  resourceId: ResourceId
  /** 资源内的裁剪起点（例如从源视频第 2 秒开始播放） */
  trimStartMs: number
  /**
   * 资源内的裁剪长度（可选）
   * - 不填表示由 durationMs 推导（常见：不解析源媒体总长时先用 durationMs）
   */
  trimDurationMs?: number
}

export type AudioClip = ClipTime & {
  id: ClipId
  kind: 'audio'
  trackId: TrackId
  resourceId: ResourceId
  trimStartMs: number
  trimDurationMs?: number
  /** 音量 0..1（未来可扩展关键帧/包络线） */
  volume: number
}

export type TextAlign = 'left' | 'center' | 'right'

export type TextClip = ClipTime & {
  id: ClipId
  kind: 'text'
  trackId: TrackId
  text: string
  /** 文字样式（足够描述原型需求；未来可扩展行高/描边/阴影等） */
  style: {
    fontFamily: string
    fontSize: number
    fontWeight: number | 'normal' | 'bold'
    color: string
    align: TextAlign
  }
  /** 画面内位置与变换（以像素为单位，基于合成画布坐标系） */
  transform: {
    x: number
    y: number
    scale: number
    rotateDeg: number
  }
}

export type Clip = VideoClip | AudioClip | TextClip

export type Track = TrackBase & {
  /**
   * 轨道内 clip 列表（同一轨道内不得重叠）
   * - UI 拖拽时可保持任意顺序；渲染/计算时建议按 startMs 排序
   */
  clips: Clip[]
}

export type EditorProject = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  /**
   * 资源库
   * - 仅存 meta；二进制内容由 ResourceRepository 管理
   */
  resources: Record<ResourceId, ResourceMeta>
  tracks: Track[]
  /** 工程级设置（画布尺寸、帧率、背景等） */
  settings: {
    width: number
    height: number
    fps: number
    backgroundColor: string
  }
}

export type EditorUIState = {
  /** 游标时间（播放头） */
  playheadMs: number
  /** 时间轴缩放（像素/毫秒 或 毫秒/像素 由 UI 约定；这里只存一个系数） */
  zoom: number
  /** 当前选中的轨道/片段 */
  selectedTrackId?: TrackId
  selectedClipId?: ClipId
}

/**
 * ---- Zod schemas（用于持久化数据校验/导入恢复） ----
 * 注意：schema 只覆盖“可序列化数据”。File/Blob 必须走资源仓库。
 */

const NonNegativeInt = z.number().int().min(0)
const PositiveInt = z.number().int().min(1)

export const ResourceMetaSchema = z.object({
  id: z.string(),
  kind: z.union([z.literal('video'), z.literal('audio')]),
  name: z.string(),
  mime: z.string(),
  size: NonNegativeInt,
  lastModified: NonNegativeInt,
  createdAt: NonNegativeInt,
  durationMs: NonNegativeInt.optional(),
  width: NonNegativeInt.optional(),
  height: NonNegativeInt.optional(),
})

export const TrackBaseSchema = z.object({
  id: z.string(),
  kind: z.union([z.literal('video'), z.literal('audio'), z.literal('text')]),
  name: z.string(),
  order: z.number(),
  opacity: z.number().min(0).max(1),
  muted: z.boolean().optional(),
  hidden: z.boolean().optional(),
})

const ClipTimeSchema = z.object({
  startMs: NonNegativeInt,
  durationMs: NonNegativeInt,
})

export const VideoClipSchema = ClipTimeSchema.extend({
  id: z.string(),
  kind: z.literal('video'),
  trackId: z.string(),
  resourceId: z.string(),
  trimStartMs: NonNegativeInt,
  trimDurationMs: NonNegativeInt.optional(),
})

export const AudioClipSchema = ClipTimeSchema.extend({
  id: z.string(),
  kind: z.literal('audio'),
  trackId: z.string(),
  resourceId: z.string(),
  trimStartMs: NonNegativeInt,
  trimDurationMs: NonNegativeInt.optional(),
  volume: z.number().min(0).max(1),
})

export const TextClipSchema = ClipTimeSchema.extend({
  id: z.string(),
  kind: z.literal('text'),
  trackId: z.string(),
  text: z.string(),
  style: z.object({
    fontFamily: z.string(),
    fontSize: PositiveInt,
    fontWeight: z.union([z.number(), z.literal('normal'), z.literal('bold')]),
    color: z.string(),
    align: z.union([z.literal('left'), z.literal('center'), z.literal('right')]),
  }),
  transform: z.object({
    x: z.number(),
    y: z.number(),
    scale: z.number(),
    rotateDeg: z.number(),
  }),
})

export const ClipSchema = z.discriminatedUnion('kind', [
  VideoClipSchema,
  AudioClipSchema,
  TextClipSchema,
])

export const TrackSchema = TrackBaseSchema.extend({
  clips: z.array(ClipSchema),
})

export const EditorProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: NonNegativeInt,
  updatedAt: NonNegativeInt,
  resources: z.record(ResourceMetaSchema),
  tracks: z.array(TrackSchema),
  settings: z.object({
    width: PositiveInt,
    height: PositiveInt,
    fps: PositiveInt,
    backgroundColor: z.string(),
  }),
})

export type EditorProjectDTO = z.infer<typeof EditorProjectSchema>
