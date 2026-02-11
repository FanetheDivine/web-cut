import type { FC } from 'react'
import { useMemo, useRef, useState } from 'react'
import { Form, Input, InputNumber, Modal, Select } from 'antd'
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

  const resizeStart = useDraggable({
    id: EditorDndKeys.clipResizeStart(clip.id),
    data: { kind: 'clipResizeStart', clipId: clip.id, trackId: clip.trackId },
  })
  const resizeEnd = useDraggable({
    id: EditorDndKeys.clipResizeEnd(clip.id),
    data: { kind: 'clipResizeEnd', clipId: clip.id, trackId: clip.trackId },
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
        'absolute top-1/2 -translate-y-1/2 rounded border text-[11px] text-zinc-100',
        isSelected ? 'border-zinc-200 bg-zinc-700/60' : 'border-zinc-700 bg-zinc-800/40',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={dragStyle}
      data-editor-clip='true'
      onClick={(e) => {
        e.stopPropagation()
        selectClip(clip.id)
      }}
      title='拖拽中间区域移动；拖拽左右把手调整开始/时长'
    >
      {/* 左侧把手：修改 startMs + durationMs（end 固定） */}
      <div
        ref={resizeStart.setNodeRef}
        className='absolute inset-y-0 left-0 w-2 cursor-ew-resize rounded-l bg-zinc-200/10 hover:bg-zinc-200/20'
        style={{
          transform: resizeStart.transform
            ? `translate3d(${resizeStart.transform.x}px, ${resizeStart.transform.y}px, 0)`
            : undefined,
          opacity: resizeStart.isDragging ? 0.6 : 1,
        }}
        {...resizeStart.listeners}
        {...resizeStart.attributes}
        onMouseDown={(e) => e.stopPropagation()}
        title='拖拽调整开始时间（左边界）'
      />

      {/* 中间区域：整体拖拽，只改 startMs */}
      <div className='px-2 py-1' {...listeners} {...attributes}>
        <div className='truncate'>{label}</div>
      </div>

      {/* 右侧把手：修改 durationMs（end 改变） */}
      <div
        ref={resizeEnd.setNodeRef}
        className='absolute inset-y-0 right-0 w-2 cursor-ew-resize rounded-r bg-zinc-200/10 hover:bg-zinc-200/20'
        style={{
          transform: resizeEnd.transform
            ? `translate3d(${resizeEnd.transform.x}px, ${resizeEnd.transform.y}px, 0)`
            : undefined,
          opacity: resizeEnd.isDragging ? 0.6 : 1,
        }}
        {...resizeEnd.listeners}
        {...resizeEnd.attributes}
        onMouseDown={(e) => e.stopPropagation()}
        title='拖拽调整时长（右边界）'
      />
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
  const _tracks = useEditorStore((s) => s.project.tracks)
  const tracks = useMemo(() => {
    return [..._tracks].sort((a, b) => a.order - b.order)
  }, [_tracks])
  const zoom = useEditorStore((s) => s.ui.zoom)
  const playheadMs = useEditorStore((s) => s.ui.playheadMs)
  const setPlayheadMs = useEditorStore((s) => s.setPlayheadMs)
  const addTrack = useEditorStore((s) => s.addTrack)
  const addTextClip = useEditorStore((s) => s.addTextClip)
  const setTrackName = useEditorStore((s) => s.setTrackName)
  const setTrackOpacity = useEditorStore((s) => s.setTrackOpacity)
  const lastError = useEditorStore((s) => s.lastError)

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const playheadDraggingRef = useRef(false)

  const [isTextClipModalOpen, setIsTextClipModalOpen] = useState(false)
  const [textClipTrackId, setTextClipTrackId] = useState<string | null>(null)
  const [isTextClipSubmitting, setIsTextClipSubmitting] = useState(false)
  const [textClipForm] = Form.useForm<{
    text: string
    durationMs: number
    fontFamily: string
    fontSize: number
    fontWeight: 'normal' | 'bold' | number
    color: string
    x: number
    y: number
  }>()

  const openTextClipModal = (trackId: string) => {
    setTextClipTrackId(trackId)
    setIsTextClipModalOpen(true)
    textClipForm.setFieldsValue({
      text: 'Hello',
      durationMs: 2000,
      fontFamily: 'sans-serif',
      fontSize: 48,
      fontWeight: 'bold',
      color: '#ffffff',
      x: 0,
      y: 0,
    })
  }

  const setPlayheadFromMouseEvent = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = scrollRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const xInViewport = e.clientX - rect.left
    const xInContent = xInViewport + container.scrollLeft
    setPlayheadMs(pxToMs(Math.max(0, xInContent), zoom))
  }

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
    <>
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
                    className='flex h-14 items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-950/20 px-2'
                  >
                    <div className='min-w-0 flex-1'>
                      <input
                        className='w-full rounded border border-zinc-800 bg-zinc-950/40 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-zinc-600'
                        value={t.name}
                        onChange={(e) => setTrackName(t.id, e.target.value)}
                        placeholder='轨道名称'
                      />
                      <div className='mt-1 text-[11px] text-zinc-400'>{TrackKindLabel[t.kind]}</div>
                    </div>

                    <div className='flex items-center gap-2'>
                      <div className='flex items-center gap-1'>
                        <div className='text-[11px] text-zinc-500'>opacity</div>
                        <input
                          className='w-14 rounded border border-zinc-800 bg-zinc-950/40 px-1 py-1 text-right text-[11px] text-zinc-100 outline-none focus:border-zinc-600'
                          value={t.opacity.toFixed(2)}
                          onChange={(e) => {
                            const v = Number(e.target.value)
                            if (Number.isNaN(v)) return
                            setTrackOpacity(t.id, Math.max(0, Math.min(1, v)))
                          }}
                          inputMode='decimal'
                        />
                      </div>

                      {t.kind === 'text' ? (
                        <button
                          className='rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-800'
                          type='button'
                          title='创建文本 clip'
                          onClick={() => {
                            openTextClipModal(t.id)
                          }}
                        >
                          +
                        </button>
                      ) : null}
                    </div>
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
              onMouseDown={(e) => {
                // 点击 clip/把手不应影响 playhead（红线）
                const target = e.target as HTMLElement
                if (target.closest('[data-editor-clip="true"]')) return
                playheadDraggingRef.current = true
                setPlayheadFromMouseEvent(e)
              }}
              onMouseMove={(e) => {
                if (!playheadDraggingRef.current) return
                setPlayheadFromMouseEvent(e)
              }}
              onMouseUp={() => {
                playheadDraggingRef.current = false
              }}
              onMouseLeave={() => {
                playheadDraggingRef.current = false
              }}
            >
              {/* 内容层：给一个足够大的宽度 */}
              <div className='relative' style={{ width: contentWidthPx }}>
                {/* 游标：可拖动（用一个透明的拖拽层更好；MVP 先用 mouse move） */}
                <div
                  className='pointer-events-none absolute top-0 h-full w-px bg-red-500'
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
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal
        title='创建文本 Clip'
        open={isTextClipModalOpen}
        okText='创建'
        cancelText='取消'
        confirmLoading={isTextClipSubmitting}
        maskClosable={!isTextClipSubmitting}
        closable={!isTextClipSubmitting}
        keyboard={!isTextClipSubmitting}
        onCancel={() => {
          if (isTextClipSubmitting) return
          setIsTextClipModalOpen(false)
          setTextClipTrackId(null)
        }}
        onOk={async () => {
          if (!textClipTrackId) return
          try {
            setIsTextClipSubmitting(true)
            const v = await textClipForm.validateFields()
            addTextClip({
              trackId: textClipTrackId,
              startMs: playheadMs,
              durationMs: v.durationMs,
              text: v.text,
              style: {
                fontFamily: v.fontFamily,
                fontSize: v.fontSize,
                fontWeight: v.fontWeight,
                color: v.color,
                align: 'left',
              },
              transform: {
                x: v.x,
                y: v.y,
                scale: 1,
                rotateDeg: 0,
              },
            })
            setIsTextClipModalOpen(false)
            setTextClipTrackId(null)
          } finally {
            setIsTextClipSubmitting(false)
          }
        }}
      >
        <Form form={textClipForm} layout='vertical'>
          <Form.Item
            name='text'
            label='文本内容'
            rules={[{ required: true, message: '请输入文本内容' }]}
          >
            <Input placeholder='例如：Hello' />
          </Form.Item>

          <div className='grid grid-cols-2 gap-3'>
            <Form.Item
              name='durationMs'
              label='时长（ms）'
              rules={[{ required: true, message: '请输入时长' }]}
            >
              <InputNumber className='w-full' min={1} step={100} />
            </Form.Item>

            <Form.Item
              name='fontFamily'
              label='字体'
              rules={[{ required: true, message: '请输入字体' }]}
            >
              <Input placeholder='例如：sans-serif' />
            </Form.Item>

            <Form.Item
              name='fontSize'
              label='字号'
              rules={[{ required: true, message: '请输入字号' }]}
            >
              <InputNumber className='w-full' min={1} step={1} />
            </Form.Item>

            <Form.Item
              name='fontWeight'
              label='字重'
              rules={[{ required: true, message: '请选择字重' }]}
            >
              <Select
                options={[
                  { label: 'normal', value: 'normal' },
                  { label: 'bold', value: 'bold' },
                  { label: '600', value: 600 },
                  { label: '700', value: 700 },
                ]}
              />
            </Form.Item>

            <Form.Item
              name='color'
              label='颜色'
              rules={[{ required: true, message: '请输入颜色' }]}
            >
              <Input placeholder='#ffffff' />
            </Form.Item>

            <div className='col-span-2 grid grid-cols-2 gap-3'>
              <Form.Item
                name='x'
                label='左上角 X'
                rules={[{ required: true, message: '请输入 X' }]}
              >
                <InputNumber className='w-full' step={1} />
              </Form.Item>
              <Form.Item
                name='y'
                label='左上角 Y'
                rules={[{ required: true, message: '请输入 Y' }]}
              >
                <InputNumber className='w-full' step={1} />
              </Form.Item>
            </div>
          </div>
        </Form>
      </Modal>
    </>
  )
}
