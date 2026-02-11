import { rangesOverlap, toRange } from '@/features/editor/ops/time'
import type { Clip, ClipId, Track } from '@/features/editor/types'

/**
 * 同轨 clip 时间挤占（不重叠约束的“无异常”实现）
 *
 * 需求：同一轨道内 clip 的时间段不能重叠，但当用户添加/移动/调整 clip 时，
 * 不要抛异常，而是“挤占”其他 clip 的时间，让它们顺延到不冲突的位置。
 *
 * 规则（当前实现，原型可接受）：
 * - 将 `priorityClipId` 对应的 clip 视为优先（保持它的 startMs/durationMs 不变）
 * - 与优先 clip 重叠的其它 clip 会被顺延到优先 clip 结束之后，并保持各自 durationMs
 * - 最后再做一次从左到右的顺延扫描，确保整体不重叠（可能推动原本在右侧的 clip）
 *
 * 注意：
 * - 这不是“剪裁/压缩 duration”，而是“推挤 startMs”；更符合拖拽编辑器的直觉
 * - 如果未来需要 ripple 规则（只推右侧、不动左侧），可以在这里集中修改
 */
export const squeezeTrackClips = (track: Track, priorityClipId: ClipId): Track => {
  const cloned: Clip[] = track.clips.map((c) => ({ ...c }))
  const priority = cloned.find((c) => c.id === priorityClipId)
  if (!priority) return track

  const pRange = toRange(priority.startMs, priority.durationMs)
  const pEnd = priority.startMs + priority.durationMs

  const before: Clip[] = []
  const overlap: Clip[] = []
  const after: Clip[] = []

  for (const c of cloned) {
    if (c.id === priorityClipId) continue
    const cRange = toRange(c.startMs, c.durationMs)
    const isOverlap = rangesOverlap(cRange, pRange)
    if (isOverlap) {
      overlap.push(c)
      continue
    }
    if (c.startMs + c.durationMs <= priority.startMs) before.push(c)
    else after.push(c)
  }

  // 与 priority 重叠的 clip 全部被“挤到” priority 之后，保持它们之间的相对先后（按原 startMs）
  overlap.sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id))
  let cursor = pEnd
  for (const c of overlap) {
    c.startMs = cursor
    cursor = c.startMs + c.durationMs
  }

  // 合并后做一遍全局顺延，避免 overlap 推挤造成的二次冲突
  const combined = [...before, priority, ...overlap, ...after].sort(
    (a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id),
  )

  let scanCursor = 0
  for (const c of combined) {
    if (c.id === priorityClipId) {
      // priority 保持不变，推进 cursor
      scanCursor = Math.max(scanCursor, c.startMs) + c.durationMs
      continue
    }
    if (c.startMs < scanCursor) c.startMs = scanCursor
    scanCursor = c.startMs + c.durationMs
  }

  return { ...track, clips: combined }
}
