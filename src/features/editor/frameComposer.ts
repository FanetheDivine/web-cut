import type { EditorProject, Track, TextClip, VideoClip } from '@/features/editor/types'

/**
 * 帧合成（原型骨架）
 *
 * 目标
 * - 根据 project + playheadMs 渲染“当前帧画面”到 canvas。
 * - 当前只实现：视频轨道的帧绘制与轨道透明度叠加。
 *
 * 关键约束（需要 UI 配合）
 * - 需要 UI 层提供一个“video 元素池”，并实现 `getVideoElement(resourceId)`：
 *   - 每个资源 id 至少对应一个 `HTMLVideoElement`
 *   - video.src 必须指向可用的 URL（通常来自 `ResourceRepository.getObjectUrl`）
 *   - video 必须设置 `crossOrigin`（如需）并处理加载失败
 * - 本模块不负责创建/管理 video 元素，避免把 DOM 生命周期耦合到领域层。
 *
 * TODO(可扩展)
 * - 文本轨道：ctx.fillText / 更复杂排版
 * - 多视频叠加：位置/缩放/裁剪/混合模式
 * - 音频混音：WebAudio graph
 * - 性能：requestVideoFrameCallback、离屏 canvas、缓存 seek、代理文件等
 */

export type ComposeFrameArgs = {
  project: EditorProject
  playheadMs: number
  canvas: HTMLCanvasElement
  /**
   * 是否在合成前清空画布
   * - 默认为 false：不清空之前内容（会产生“累积绘制”的效果）
   * - 若要每帧重绘（常见预览模式），请显式传 true
   */
  clear?: boolean
  /**
   * UI 层提供：根据 resourceId 返回视频元素
   * - 若资源还未准备好（未加载/未创建），可以返回 null
   */
  getVideoElement: (resourceId: string) => HTMLVideoElement | null
}

type ActiveVideo = {
  track: Track
  clip: VideoClip
  sourceTimeMs: number
}

type ActiveText = {
  track: Track
  clip: TextClip
}

const findActiveTextClips = (project: EditorProject, playheadMs: number): ActiveText[] => {
  const actives: ActiveText[] = []
  const sortedTracks = [...project.tracks].sort((a, b) => a.order - b.order)

  for (const track of sortedTracks) {
    if (track.hidden) continue
    if (track.kind !== 'text') continue

    for (const clip of track.clips) {
      if (clip.kind !== 'text') continue
      const start = clip.startMs
      const end = clip.startMs + clip.durationMs
      if (playheadMs < start || playheadMs >= end) continue
      actives.push({ track, clip })
    }
  }

  return actives
}

const findActiveVideoClips = (project: EditorProject, playheadMs: number): ActiveVideo[] => {
  const actives: ActiveVideo[] = []
  const sortedTracks = [...project.tracks].sort((a, b) => a.order - b.order)

  for (const track of sortedTracks) {
    if (track.hidden) continue
    if (track.kind !== 'video') continue

    for (const clip of track.clips) {
      if (clip.kind !== 'video') continue
      const start = clip.startMs
      const end = clip.startMs + clip.durationMs
      if (playheadMs < start || playheadMs >= end) continue

      const offsetMs = playheadMs - clip.startMs
      const sourceTimeMs = clip.trimStartMs + offsetMs
      actives.push({ track, clip, sourceTimeMs })
    }
  }

  return actives
}

const drawTextClip = (ctx: CanvasRenderingContext2D, clip: TextClip) => {
  const { fontFamily, fontSize, fontWeight, color, align } = clip.style
  const { x, y, scale, rotateDeg } = clip.transform

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate((rotateDeg * Math.PI) / 180)
  ctx.scale(scale, scale)

  ctx.fillStyle = color
  ctx.textAlign = align
  // 你在 UI 里填写的是“左上角位置”，因此基线使用 top 更符合直觉
  ctx.textBaseline = 'top'
  ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`

  // 按 align 决定 x 的含义：
  // - left：x 是左上角 x
  // - center/right：x 是文本锚点位置（基于 textAlign）
  ctx.fillText(clip.text, 0, 0)
  ctx.restore()
}

const seekVideoTo = async (video: HTMLVideoElement, timeSec: number) => {
  // 某些浏览器对频繁 seek 很敏感，未来可以做“阈值内不 seek”的优化
  if (!Number.isFinite(timeSec) || timeSec < 0) return

  // 已经足够接近则跳过（避免抖动）
  const EPS = 1 / 60
  if (Math.abs(video.currentTime - timeSec) < EPS) return

  await new Promise<void>((resolve, reject) => {
    const onSeeked = () => {
      cleanup()
      resolve()
    }
    const onError = () => {
      cleanup()
      reject(new Error('video seek error'))
    }
    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked)
      video.removeEventListener('error', onError)
    }
    video.addEventListener('seeked', onSeeked, { once: true })
    video.addEventListener('error', onError, { once: true })
    video.currentTime = timeSec
  })
}

export const composeFrame = async (args: ComposeFrameArgs) => {
  const { project, playheadMs, canvas, clear = false, getVideoElement } = args

  // 保证 canvas 尺寸与工程一致（UI 也可以在外部维护，这里做兜底）
  if (canvas.width !== project.settings.width) canvas.width = project.settings.width
  if (canvas.height !== project.settings.height) canvas.height = project.settings.height

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  if (clear) {
    // 清屏（每帧重绘模式）
    ctx.save()
    ctx.globalAlpha = 1
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = project.settings.backgroundColor
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.restore()
  }

  /**
   * 叠加顺序：按 track.order 从小到大绘制
   * - 视频：drawImage
   * - 文本：fillText（支持 transform）
   * - 音频：不参与画面合成
   */
  const sortedTracks = [...project.tracks].sort((a, b) => a.order - b.order)

  for (const track of sortedTracks) {
    if (track.hidden) continue
    const alpha = Math.max(0, Math.min(1, track.opacity))

    if (track.kind === 'video') {
      const actives = findActiveVideoClips(project, playheadMs).filter(
        (x) => x.track.id === track.id,
      )
      for (const active of actives) {
        const video = getVideoElement(active.clip.resourceId)
        if (!video) continue

        const timeSec = active.sourceTimeMs / 1000
        await seekVideoTo(video, timeSec)

        ctx.save()
        ctx.globalAlpha = alpha
        // 原型：直接铺满画布；未来可支持 clip.transform / aspect-fit 等
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        ctx.restore()
      }
    }

    if (track.kind === 'text') {
      const actives = findActiveTextClips(project, playheadMs).filter(
        (x) => x.track.id === track.id,
      )
      for (const active of actives) {
        ctx.save()
        ctx.globalAlpha = alpha
        drawTextClip(ctx, active.clip)
        ctx.restore()
      }
    }
  }

  // TODO: 音频轨道不参与画面合成，但会影响最终导出（WebAudio / 导出合成）
}
