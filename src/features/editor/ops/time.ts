export const clampNonNegative = (ms: number) => (ms < 0 ? 0 : ms)

/**
 * 半开区间 [start, end)
 * - end == start 表示空区间（允许 duration==0 的场景由上层决定）
 */
export const toRange = (startMs: number, durationMs: number) => {
  const start = startMs
  const end = startMs + durationMs
  return { start, end }
}

export const rangesOverlap = (
  a: { start: number; end: number },
  b: { start: number; end: number },
) => {
  // 不重叠条件：a.end <= b.start 或 b.end <= a.start
  return !(a.end <= b.start || b.end <= a.start)
}
