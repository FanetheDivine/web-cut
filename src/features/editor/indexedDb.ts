/**
 * IndexedDB object store 修复/升级工具
 *
 * 背景
 * - `idb-keyval` 的 `createStore(dbName, storeName)` 内部会用固定 version（通常为 1）打开 DB。
 * - 如果用户浏览器里已经存在同名 DB，但版本 >1 且缺少该 storeName，则不会触发 upgrade，后续 transaction 会直接抛：
 *   "Failed to execute 'transaction' ... object stores was not found."
 *
 * 这个工具做的事：
 * - 打开 DB（不指定 version），观察当前版本与 objectStoreNames
 * - 若缺少 storeName，则用 version+1 触发升级，在 onupgradeneeded 中创建该 store
 */

export const ensureIdbObjectStore = async (dbName: string, storeName: string) => {
  if (typeof indexedDB === 'undefined') return

  const openDb = (version?: number) =>
    new Promise<IDBDatabase>((resolve, reject) => {
      const req = version ? indexedDB.open(dbName, version) : indexedDB.open(dbName)
      req.onerror = () => reject(req.error ?? new Error('indexedDB open error'))
      req.onblocked = () => {
        // 不能强行解除 blocked，交给调用方重试或提示用户关闭其他 tab
        // 这里先拒绝，让上层捕获并展示错误
        reject(new Error('indexedDB upgrade blocked'))
      }
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(storeName)) {
          db.createObjectStore(storeName)
        }
      }
      req.onsuccess = () => resolve(req.result)
    })

  const db = await openDb()
  const hasStore = db.objectStoreNames.contains(storeName)
  const currentVersion = db.version
  db.close()

  if (hasStore) return

  // 用 version+1 强制触发升级并创建缺失 store
  const upgraded = await openDb(currentVersion + 1)
  upgraded.close()
}
