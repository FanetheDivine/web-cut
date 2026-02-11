import { createStore, del, get, set } from 'idb-keyval'
import { createId } from '@/features/editor/id'
import type { ResourceId, ResourceKind, ResourceMeta } from '@/features/editor/types'

/**
 * 资源仓库（资源上传/缓存/持久化的可扩展接口）
 *
 * 设计目标
 * - UI 只关心 resourceId 与 meta；二进制 File/Blob 的生命周期由 repo 管理。
 * - 允许未来替换为：更复杂的 IndexedDB schema、服务端对象存储、Worker 解析媒体信息等。
 *
 * 重要提示（原型限制）
 * - 浏览器对 IndexedDB/Blob 存储有容量上限，且不同浏览器策略不同。
 * - 生产级剪辑通常需要：分片/转码/代理文件、持久化索引、媒体信息解析、垃圾回收策略等。
 */

export type PutResourceInput = File | Blob

export type ResourceRepository = {
  /** 写入资源（二进制与 meta）并返回资源 id */
  put: (
    file: PutResourceInput,
    meta?: Partial<Pick<ResourceMeta, 'name' | 'lastModified'>>,
  ) => Promise<ResourceMeta>
  /** 获取二进制内容 */
  getBlob: (id: ResourceId) => Promise<Blob | null>
  /** 获取 meta */
  getMeta: (id: ResourceId) => Promise<ResourceMeta | null>
  /** 列出全部 meta */
  listMeta: () => Promise<ResourceMeta[]>
  /** 删除资源（包含 objectURL 缓存） */
  delete: (id: ResourceId) => Promise<void>
  /** 清空仓库（危险操作，原型调试用） */
  clearAll: () => Promise<void>
  /**
   * 获取可用于 `<video src>`/`<audio src>` 的 objectURL
   * - 会基于 blob 创建 URL 并缓存；调用方不需要关心 revoke
   * - 但当资源删除/清空时会自动 revoke
   */
  getObjectUrl: (id: ResourceId) => Promise<string | null>
  /** 主动回收某个资源的 objectURL（可选） */
  revokeObjectUrl: (id: ResourceId) => void
}

type RepoKeys = {
  metaKey: (id: ResourceId) => string
  blobKey: (id: ResourceId) => string
  indexKey: string
}

const DefaultKeys: RepoKeys = {
  metaKey: (id) => `meta:${id}`,
  blobKey: (id) => `blob:${id}`,
  indexKey: 'index',
}

const detectResourceKind = (mime: string): ResourceKind => {
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  throw new Error(`不支持的资源类型 mime=${mime}`)
}

const inferName = (file: PutResourceInput, fallback: string) => {
  // File 才有 name；Blob 没有
  if (file instanceof File && file.name) return file.name
  return fallback
}

/**
 * 创建一个基于 IndexedDB 的资源仓库
 *
 * @param config - 可扩展配置（dbName/storeName 便于多工程隔离）
 * @remarks
 * - 使用 `idb-keyval` 是为了原型简单；未来可替换为自定义 adapter
 * - 这里把 index 简化为一个 meta 数组；生产级建议用游标/索引提升性能
 */
export const createResourceRepository = (config?: {
  dbName?: string
  storeName?: string
  keys?: Partial<RepoKeys>
}): ResourceRepository => {
  const { dbName = 'web-cut', storeName = 'resource-repo', keys: keysPatch } = config ?? {}
  const keys: RepoKeys = { ...DefaultKeys, ...(keysPatch ?? {}) }

  const store = createStore(dbName, storeName)
  const objectUrlCache = new Map<ResourceId, string>()

  const readIndex = async () => {
    const index = await get<ResourceMeta[]>(keys.indexKey, store)
    return Array.isArray(index) ? index : []
  }

  const writeIndex = async (next: ResourceMeta[]) => {
    await set(keys.indexKey, next, store)
  }

  const upsertIndex = async (meta: ResourceMeta) => {
    const index = await readIndex()
    const next = index.filter((x) => x.id !== meta.id)
    next.push(meta)
    await writeIndex(next)
  }

  const removeFromIndex = async (id: ResourceId) => {
    const index = await readIndex()
    await writeIndex(index.filter((x) => x.id !== id))
  }

  const revokeObjectUrl = (id: ResourceId) => {
    const url = objectUrlCache.get(id)
    if (url) {
      URL.revokeObjectURL(url)
      objectUrlCache.delete(id)
    }
  }

  return {
    put: async (file, patch) => {
      const mime = file.type || 'application/octet-stream'
      const kind = detectResourceKind(mime)
      const id = createId('res')
      const createdAt = Date.now()
      const name = patch?.name ?? inferName(file, id)
      const lastModified =
        patch?.lastModified ?? (file instanceof File ? file.lastModified : createdAt)
      const size = 'size' in file ? file.size : 0

      const meta: ResourceMeta = {
        id,
        kind,
        name,
        mime,
        size,
        lastModified,
        createdAt,
      }

      await set(keys.blobKey(id), file, store)
      await set(keys.metaKey(id), meta, store)
      await upsertIndex(meta)

      return meta
    },

    getBlob: async (id) => {
      const blob = await get<Blob>(keys.blobKey(id), store)
      return blob ?? null
    },

    getMeta: async (id) => {
      const meta = await get<ResourceMeta>(keys.metaKey(id), store)
      return meta ?? null
    },

    listMeta: async () => {
      const index = await readIndex()
      // createdAt 升序，UI 也可自行排序；这里只给一个稳定默认值
      return [...index].sort((a, b) => a.createdAt - b.createdAt)
    },

    delete: async (id) => {
      revokeObjectUrl(id)
      await del(keys.blobKey(id), store)
      await del(keys.metaKey(id), store)
      await removeFromIndex(id)
    },

    clearAll: async () => {
      // 原型实现：只根据 index 清理；若 index 丢失会遗留孤儿 key
      // TODO(可扩展): 未来可维护更严格的键空间或用更复杂 schema 避免孤儿数据
      const index = await readIndex()
      await Promise.all(
        index.flatMap((m) => [del(keys.blobKey(m.id), store), del(keys.metaKey(m.id), store)]),
      )
      index.forEach((m) => revokeObjectUrl(m.id))
      await writeIndex([])
    },

    getObjectUrl: async (id) => {
      const cached = objectUrlCache.get(id)
      if (cached) return cached

      const blob = await get<Blob>(keys.blobKey(id), store)
      if (!blob) return null

      const url = URL.createObjectURL(blob)
      objectUrlCache.set(id, url)
      return url
    },

    revokeObjectUrl,
  }
}
