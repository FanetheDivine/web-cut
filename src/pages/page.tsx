import type { FC } from 'react'
import { useEffect, useRef } from 'react'
import { DndContext, type DragEndEvent } from '@dnd-kit/core'
import { PreviewCanvas } from '@/features/editor/components/PreviewCanvas'
import { ResourceLibraryPanel } from '@/features/editor/components/ResourceLibraryPanel'
import { TimelineEditor } from '@/features/editor/components/TimelineEditor'
import { parseEditorDraggableId } from '@/features/editor/components/dnd'
import { pxToMs } from '@/features/editor/components/timelineScale'
import { useEditorStore } from '@/features/editor/store/useEditorStore'

const Page: FC = () => {
  const init = useEditorStore((s) => s.init)
  const zoom = useEditorStore((s) => s.ui.zoom)
  const resources = useEditorStore((s) => s.project.resources)
  const addClipFromResource = useEditorStore((s) => s.addClipFromResource)
  const moveClip = useEditorStore((s) => s.moveClip)
  const moveClipToTrack = useEditorStore((s) => s.moveClipToTrack)
  const resizeClip = useEditorStore((s) => s.resizeClip)

  const timelineScrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    void init()
  }, [init])

  const handleDragEnd = (e: DragEndEvent) => {
    const active = parseEditorDraggableId(e.active.id)
    const over = parseEditorDraggableId(e.over?.id)
    if (!active || !over) return
    if (over.kind !== 'track') return

    const overRect = e.over?.rect
    const activeRect = e.active.rect.current.translated ?? e.active.rect.current.initial
    if (!overRect || !activeRect) return

    const scrollLeft = timelineScrollRef.current?.scrollLeft ?? 0
    const centerX = activeRect.left + activeRect.width / 2
    const xInOver = centerX - overRect.left
    const xInContent = Math.max(0, xInOver + scrollLeft)
    const dropStartMs = pxToMs(xInContent, zoom)

    const deltaMs = pxToMs(e.delta.x, zoom)
    const project = useEditorStore.getState().project
    const findClip = (clipId: string) => {
      for (const t of project.tracks) {
        const c = t.clips.find((x) => x.id === clipId)
        if (c) return c
      }
      return null
    }

    if (active.kind === 'resource') {
      const meta = resources[active.resourceId]
      const durationMs = Math.max(1, meta?.durationMs ?? 3000)
      addClipFromResource({
        resourceId: active.resourceId,
        trackId: over.trackId,
        startMs: dropStartMs,
        durationMs,
      })
      return
    }

    if (active.kind === 'clip') {
      const clip = findClip(active.clipId)
      if (!clip) return
      const nextStartMs = clip.startMs + deltaMs

      const activeData = e.active.data.current as { trackId?: string } | undefined
      const fromTrackId = activeData?.trackId
      if (fromTrackId && fromTrackId === over.trackId) {
        moveClip(active.clipId, nextStartMs)
      } else {
        moveClipToTrack(active.clipId, over.trackId, nextStartMs)
      }
      return
    }

    if (active.kind === 'clipResizeStart') {
      const clip = findClip(active.clipId)
      if (!clip) return
      // 左把手：end 固定 -> duration = duration - delta
      const nextDurationMs = clip.durationMs - deltaMs
      resizeClip(active.clipId, nextDurationMs, 'start')
      return
    }

    if (active.kind === 'clipResizeEnd') {
      const clip = findClip(active.clipId)
      if (!clip) return
      // 右把手：start 固定 -> duration = duration + delta
      const nextDurationMs = clip.durationMs + deltaMs
      resizeClip(active.clipId, nextDurationMs, 'end')
    }
  }

  return (
    <div className='h-full w-full overflow-hidden bg-zinc-950 text-zinc-50'>
      <DndContext onDragEnd={handleDragEnd}>
        <div className='grid h-[60%] grid-cols-[360px_1fr] gap-3 p-3'>
          <div className='flex h-full min-h-0 flex-col rounded-lg border border-zinc-800 bg-zinc-900/40'>
            <div className='flex items-center justify-between border-b border-zinc-800 px-3 py-2'>
              <div className='text-sm font-semibold'>资源</div>
              <div className='text-xs text-zinc-400'>全局资源库（可复用/可持久化）</div>
            </div>
            <div className='min-h-0 flex-1 p-3'>
              <ResourceLibraryPanel />
            </div>
          </div>

          <div className='flex h-full min-h-0 flex-col rounded-lg border border-zinc-800 bg-zinc-900/40'>
            <div className='flex items-center justify-between border-b border-zinc-800 px-3 py-2'>
              <div className='text-sm font-semibold'>预览</div>
              <div className='text-xs text-zinc-400'>canvas 合成当前帧（playheadMs）</div>
            </div>
            <div className='min-h-0 flex-1 overflow-hidden p-3'>
              <PreviewCanvas />
            </div>
          </div>
        </div>

        <div className='h-[40%] min-h-0 px-3 pb-3'>
          <div className='flex h-full min-h-0 flex-col rounded-lg border border-zinc-800 bg-zinc-900/40'>
            <div className='flex items-center justify-between border-b border-zinc-800 px-3 py-2'>
              <div className='text-sm font-semibold'>时间轴</div>
              <div className='text-xs text-zinc-400'>拖拽资源/clip；拖动红线游标</div>
            </div>
            <div className='min-h-0 flex-1 p-3'>
              <TimelineEditor
                onBindScrollContainer={(el) => {
                  timelineScrollRef.current = el
                }}
              />
            </div>
          </div>
        </div>
      </DndContext>
    </div>
  )
}

export default Page
