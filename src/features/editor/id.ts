/**
 * 简单 id 生成器
 * - 原型阶段直接使用 `crypto.randomUUID()`（浏览器环境）即可
 * - 若未来需要稳定/短 id，可替换实现，但保持返回 string
 */
export const createId = (prefix: string) => {
  const uuid =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random()}`
  return `${prefix}_${uuid}`
}
