/**
 * 时间轴缩放工具
 *
 * 约定
 * - store 的 `ui.zoom` 是一个无量纲系数，默认 1
 * - 基准比例：BASE_PX_PER_SECOND（每秒多少像素）
 * - pxPerMs = BASE_PX_PER_SECOND / 1000 * zoom
 *
 * 说明
 * - 这里不把“秒/帧”等概念写死到 UI，组件只要使用 ms 即可
 * - 如果未来你希望 zoom 表示 “每像素多少毫秒(msPerPx)”，可以在这里统一转换
 */

const BASE_PX_PER_SECOND = 80

export const getPxPerMs = (zoom: number) => {
  const z = zoom > 0 ? zoom : 1
  return (BASE_PX_PER_SECOND / 1000) * z
}

export const msToPx = (ms: number, zoom: number) => ms * getPxPerMs(zoom)

export const pxToMs = (px: number, zoom: number) => {
  const pxPerMs = getPxPerMs(zoom)
  return pxPerMs <= 0 ? 0 : Math.round(px / pxPerMs)
}

export const formatTimecodeMs = (ms: number) => {
  const totalMs = Math.max(0, Math.round(ms))
  const totalSec = Math.floor(totalMs / 1000)
  const s = totalSec % 60
  const m = Math.floor(totalSec / 60) % 60
  const h = Math.floor(totalSec / 3600)
  const msRest = totalMs % 1000
  const pad2 = (n: number) => String(n).padStart(2, '0')
  const pad3 = (n: number) => String(n).padStart(3, '0')
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}.${pad3(msRest)}`
}
