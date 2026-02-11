import type { FC } from 'react'
import { useMemo, useRef } from 'react'
import { useDraggable, useDroppable } from '@dnd-kit/core'
import { msToPx, pxToMs } from '@/features/editor/components/timelineScale'
import { EditorDndKeys, useEditorStore } from '@/features/editor/store/useEditorStore'
import type { Clip, Track, TrackKind } from '@/features/editor/types'

export type TimelineEditorProps = Style & {
  /**
   * TimelineEditor 需要把“横向滚动容器”暴露给页面层的 DnD handler，
   * 以便在 onDragEnd 时把 drop 的像素位置换算为 startMs。
   */
  onBindScrollContainer?: (el: HTMLDivElement | null) => void
}

type TrackLaneProps = Style & {
  track: Track
  zoom: number
}

const TrackLane: FC<TrackLaneProps> = (props) => {
  const { track, zoom, className, style } = props

  const { setNodeRef, isOver } = useDroppable({
    id: EditorDndKeys.track(track.id),
    data: {
      kind: 'trackLane',
      trackId: track.id,
    },
  })

  return (
    <div
      ref={setNodeRef}
      className={[
        'relative h-12 rounded-md border',
        isOver ? 'border-zinc-500 bg-zinc-900/60' : 'border-zinc-800 bg-zinc-950/20',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      data-track-id={track.id}
    >
      {/* clip 渲染层 */}
      {track.clips.map((c) => (
        <ClipBlock key={c.id} clip={c} zoom={zoom} />
      ))}
    </div>
  )
}

type ClipBlockProps = Style & {
  clip: Clip
  zoom: number
}

const ClipBlock: FC<ClipBlockProps> = (props) => {
  const { clip, zoom, className, style } = props

  const selectClip = useEditorStore((s) => s.selectClip)
  const selectedClipId = useEditorStore((s) => s.ui.selectedClipId)
  const isSelected = selectedClipId === clip.id

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: EditorDndKeys.clip(clip.id),
    data: {
      kind: 'clip',
      clipId: clip.id,
      trackId: clip.trackId,
      clipKind: clip.kind,
    },
  })

  const left = msToPx(clip.startMs, zoom)
  const width = Math.max(8, msToPx(clip.durationMs, zoom))

  const dragStyle: React.CSSProperties = {
    ...style,
    left,
    width,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.6 : 1,
  }

  const label =
    clip.kind === 'text' ? `TEXT: ${clip.text}` : `${clip.kind.toUpperCase()}: ${clip.resourceId}`

  return (
    <div
      ref={setNodeRef}
      className={[
        'absolute top-1/2 -translate-y-1/2 rounded border px-2 py-1 text-[11px] text-zinc-100',
        isSelected ? 'border-zinc-200 bg-zinc-700/60' : 'border-zinc-700 bg-zinc-800/40',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={dragStyle}
      {...listeners}
      {...attributes}
      onClick={(e) => {
        e.stopPropagation()
        selectClip(clip.id)
      }}
      title='拖拽移动（MVP 不支持拉伸 resize）'
    >
      <div className='truncate'>{label}</div>
    </div>
  )
}

const TrackKindLabel: Record<TrackKind, string> = {
  video: '视频',
  audio: '音频',
  text: '文本',
}

/**
 * TimelineEditor（MVP）
 *
 * 能力：
 * - 新增轨道（video/audio/text）
 * - 轨道 lane 可 droppable：支持资源拖入创建 clip、clip 跨轨移动（由页面层 DndContext onDragEnd 处理）
 * - clip 块可 draggable：左右移动改变 startMs、跨轨移动
 * - playhead（游标）可拖动改变 ui.playheadMs
 *
 * 不做：
 * - clip 拉伸 resize（留给后续增强版）
 * - 轨道排序拖拽
 */
export const TimelineEditor: FC<TimelineEditorProps> = (props) => {
  const { onBindScrollContainer, className, style } = props

  const tracks = useEditorStore((s) => [...s.project.tracks].sort((a, b) => a.order - b.order))
  const zoom = useEditorStore((s) => s.ui.zoom)
  const playheadMs = useEditorStore((s) => s.ui.playheadMs)
  const setPlayheadMs = useEditorStore((s) => s.setPlayheadMs)
  const addTrack = useEditorStore((s) => s.addTrack)
  const lastError = useEditorStore((s) => s.lastError)

  const scrollRef = useRef<HTMLDivElement | null>(null)

  const contentWidthPx = useMemo(() => {
    // MVP：用“工程里最远的 clip 末尾”估计宽度（至少 2000px）
    let maxEnd = 0
    tracks.forEach((t) => {
      t.clips.forEach((c) => {
        maxEnd = Math.max(maxEnd, c.startMs + c.durationMs)
      })
    })
    return Math.max(2000, msToPx(maxEnd + 3000, zoom))
  }, [tracks, zoom])

  const playheadLeftPx = msToPx(playheadMs, zoom)

  return (
    <div className={className} style={style}>
      {lastError?.message ? (
        <div className='mb-2 rounded border border-amber-700/50 bg-amber-900/20 px-2 py-1 text-xs text-amber-200'>
          {lastError.message}
        </div>
      ) : null}

      <div className='grid grid-cols-[220px_1fr] gap-3'>
        {/* 左侧：轨道列表 */}
        <div className='min-h-0'>
          <div className='flex items-center justify-between'>
            <div className='text-xs font-semibold text-zinc-200'>轨道</div>
            <div className='flex items-center gap-1'>
              {(['video', 'audio', 'text'] as const).map((k) => (
                <button
                  key={k}
                  className='rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-800'
                  type='button'
                  onClick={() => addTrack(k)}
                  title={`新增${TrackKindLabel[k]}轨道`}
                >
                  +{TrackKindLabel[k]}
                </button>
              ))}
            </div>
          </div>

          <div className='mt-2 grid gap-2'>
            {tracks.length === 0 ? (
              <div className='rounded-md border border-dashed border-zinc-700/70 bg-zinc-950/20 p-2 text-xs text-zinc-500'>
                暂无轨道。请先新增轨道，然后拖拽资源到右侧 lane 创建 clip。
              </div>
            ) : (
              tracks.map((t) => (
                <div
                  key={t.id}
                  className='flex h-12 items-center justify-between rounded-md border border-zinc-800 bg-zinc-950/20 px-2'
                >
                  <div className='min-w-0'>
                    <div className='truncate text-xs text-zinc-100'>{t.name}</div>
                    <div className='text-[11px] text-zinc-400'>{TrackKindLabel[t.kind]}</div>
                  </div>
                  <div className='text-[11px] text-zinc-400'>opacity {t.opacity.toFixed(2)}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* 右侧：时间轴区域 */}
        <div className='min-h-0'>
          <div className='mb-2 flex items-center justify-between'>
            <div className='text-xs font-semibold text-zinc-200'>时间轴</div>
            <div className='text-[11px] text-zinc-400'>
              拖动竖线调整游标；拖动 clip/资源进行编辑
            </div>
          </div>

          <div
            ref={(el) => {
              scrollRef.current = el
              onBindScrollContainer?.(el)
            }}
            className='relative min-h-0 overflow-x-auto overflow-y-hidden rounded-md border border-zinc-800 bg-zinc-950/20'
          >
            {/* 内容层：给一个足够大的宽度 */}
            <div className='relative' style={{ width: contentWidthPx }}>
              {/* 游标：可拖动（用一个透明的拖拽层更好；MVP 先用 mouse move） */}
              <div
                className='absolute top-0 h-full w-px bg-red-500'
                style={{ left: playheadLeftPx }}
                title='playhead'
              />

              {/* 轨道 lanes */}
              <div className='grid gap-2 p-2'>
                {tracks.map((t) => (
                  <div key={t.id} className='relative'>
                    <TrackLane track={t} zoom={zoom} />
                  </div>
                ))}
              </div>

              {/* 游标拖动层：覆盖整个区域监听 */}
              <PlayheadDragLayer
                contentWidthPx={contentWidthPx}
                zoom={zoom}
                onSetPlayheadMs={(ms) => setPlayheadMs(ms)}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

type PlayheadDragLayerProps = {
  contentWidthPx: number
  zoom: number
  onSetPlayheadMs: (ms: number) => void
}

const PlayheadDragLayer: FC<PlayheadDragLayerProps> = (props) => {
  const { contentWidthPx, zoom, onSetPlayheadMs } = props
  const draggingRef = useRef(false)

  const setFromMouseEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const xInViewport = e.clientX - rect.left
    // PlayheadDragLayer 的 parent 是“内容层(relative)”，再往上一层是滚动容器
    const scrollContainer = e.currentTarget.parentElement?.parentElement as
      | HTMLDivElement
      | undefined
    const scrollLeft = scrollContainer?.scrollLeft ?? 0
    const xInContent = xInViewport + scrollLeft
    onSetPlayheadMs(pxToMs(Math.max(0, xInContent), zoom))
  }

  return (
    <div
      className='absolute inset-0'
      style={{ width: contentWidthPx }}
      onMouseDown={(e) => {
        // 只在右侧区域点击/拖动更新 playhead
        draggingRef.current = true
        setFromMouseEvent(e)
      }}
      onMouseMove={(e) => {
        if (!draggingRef.current) return
        setFromMouseEvent(e)
      }}
      onMouseUp={() => {
        draggingRef.current = false
      }}
      onMouseLeave={() => {
        draggingRef.current = false
      }}
      // 不阻止事件：让 DnD 仍然可用（MVP：接受偶发冲突；后续可改 PointerEvents 策略）
    />
  )
}
