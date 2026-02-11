import type { FC } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/utils'
import { formatTimecodeMs } from '@/features/editor/components/timelineScale'
import { composeFrame } from '@/features/editor/frameComposer'
import { useEditorStore } from '@/features/editor/store/useEditorStore'
import type { ResourceId } from '@/features/editor/types'

export type PreviewCanvasProps = Style

type VideoPool = Map<ResourceId, HTMLVideoElement>

const waitCanPlay = (video: HTMLVideoElement) =>
  new Promise<void>((resolve, reject) => {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      resolve()
      return
    }
    const onCanPlay = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('video load error'))
    }
    const cleanup = () => {
      video.removeEventListener('canplay', onCanPlay)
      video.removeEventListener('error', onError)
    }
    video.addEventListener('canplay', onCanPlay, { once: true })
    video.addEventListener('error', onError, { once: true })
  })

const getActiveVideoResourceIds = (
  project: ReturnType<typeof useEditorStore.getState>['project'],
  playheadMs: number,
) => {
  const ids = new Set<ResourceId>()
  for (const track of project.tracks) {
    if (track.hidden) continue
    if (track.kind !== 'video') continue
    for (const clip of track.clips) {
      if (clip.kind !== 'video') continue
      const start = clip.startMs
      const end = clip.startMs + clip.durationMs
      if (playheadMs >= start && playheadMs < end) ids.add(clip.resourceId)
    }
  }
  return [...ids]
}

/**
 * PreviewCanvas（MVP）
 *
 * 能力：
 * - 维护一个 `<canvas>`，根据 store.project + ui.playheadMs 合成当前帧
 * - 内部维护 `videoPool`（每个 resourceId 对应一个 HTMLVideoElement）
 * - 提供最小播放控制：play/pause，播放时用 rAF 增加 playheadMs
 *
 * 说明：
 * - 这里不做音频播放/混音，只做画面预览
 * - video 元素默认 muted，避免预览时外放音频
 */
export const PreviewCanvas: FC<PreviewCanvasProps> = (props) => {
  const { className, style } = props

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const videoPoolRef = useRef<VideoPool>(new Map())
  const readySetRef = useRef<Set<ResourceId>>(new Set())

  const project = useEditorStore((s) => s.project)
  const playheadMs = useEditorStore((s) => s.ui.playheadMs)
  const repo = useEditorStore((s) => s.repo)
  const setPlayheadMs = useEditorStore((s) => s.setPlayheadMs)

  const [isPlaying, setIsPlaying] = useState(false)

  const getVideoElement = useMemo(() => {
    return (resourceId: ResourceId) => {
      if (!readySetRef.current.has(resourceId)) return null
      return videoPoolRef.current.get(resourceId) ?? null
    }
  }, [])

  // 确保活跃资源的 video 元素已创建并 ready（canplay）
  useEffect(() => {
    if (!repo) return

    const activeIds = getActiveVideoResourceIds(project, playheadMs)
    let cancelled = false

    const run = async () => {
      for (const id of activeIds) {
        if (cancelled) return
        if (videoPoolRef.current.has(id) && readySetRef.current.has(id)) continue

        const url = await repo.getObjectUrl(id)
        if (!url) continue
        if (cancelled) return

        let video = videoPoolRef.current.get(id)
        if (!video) {
          video = document.createElement('video')
          video.muted = true
          video.playsInline = true
          video.preload = 'auto'
          video.crossOrigin = 'anonymous'
          videoPoolRef.current.set(id, video)
        }

        if (video.src !== url) {
          readySetRef.current.delete(id)
          video.src = url
          video.load()
        }

        try {
          await waitCanPlay(video)
          readySetRef.current.add(id)
        } catch {
          // 忽略加载失败：composeFrame 会跳过该 video
        }
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [project, playheadMs, repo])

  // 合成当前帧
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    void composeFrame({ project, playheadMs, canvas, getVideoElement })
  }, [getVideoElement, playheadMs, project])

  // 播放循环：驱动 playheadMs
  useEffect(() => {
    if (!isPlaying) return
    let raf = 0
    let last = performance.now()

    const tick = (now: number) => {
      const dt = now - last
      last = now
      // 简单推进：按真实 dt 增加 playhead（未来可加“停止在工程末尾”等逻辑）
      const current = useEditorStore.getState().ui.playheadMs
      setPlayheadMs(current + dt)
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [isPlaying, setPlayheadMs])

  return (
    <div className={cn('flex h-full min-h-0 flex-col overflow-hidden', className)} style={style}>
      <div className='flex items-center justify-between gap-2'>
        <div className='text-xs text-zinc-300'>Time: {formatTimecodeMs(playheadMs)}</div>
        <div className='flex items-center gap-2'>
          <button
            className='rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800'
            type='button'
            onClick={() => setIsPlaying((v) => !v)}
          >
            {isPlaying ? '暂停' : '播放'}
          </button>
          <button
            className='rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-200 hover:bg-zinc-800'
            type='button'
            onClick={() => setPlayheadMs(0)}
          >
            回到起点
          </button>
        </div>
      </div>

      <div className='mt-3 flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-md bg-black p-2'>
        <canvas ref={canvasRef} className='h-auto max-h-full w-auto max-w-full' />
      </div>
    </div>
  )
}
