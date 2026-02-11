import { createStore, get, set } from 'idb-keyval'
import { EditorProjectSchema } from '@/features/editor/types'
import type { EditorProject, EditorProjectDTO } from '@/features/editor/types'

/**
 * 工程数据持久化（JSON）
 *
 * 说明
 * - 这里只保存可序列化的 project（tracks/clips/resource meta 等）
 * - 资源二进制（Blob/File）不在此处保存，交给 `ResourceRepository`
 *
 * 可扩展点（留给后续）
 * - 多工程：key 里带 projectId
 * - 版本迁移：保存 schemaVersion，加载时做 migrate
 * - 压缩：LZ-string 等（注意性能与容量权衡）
 */

const ProjectKey = 'project'

export type ProjectStorage = {
  load: () => Promise<EditorProject | null>
  save: (project: EditorProject) => Promise<void>
}

export const createProjectStorage = (config?: {
  dbName?: string
  storeName?: string
  key?: string
}): ProjectStorage => {
  const { dbName = 'web-cut', storeName = 'project', key = ProjectKey } = config ?? {}
  const store = createStore(dbName, storeName)

  return {
    load: async () => {
      const raw = await get<unknown>(key, store)
      if (!raw) return null
      const parsed = EditorProjectSchema.safeParse(raw)
      if (!parsed.success) {
        // 数据损坏/版本不匹配：这里直接返回空，让上层创建默认工程
        // TODO(可扩展): 未来可做迁移/备份/提示用户
        return null
      }
      return parsed.data as EditorProjectDTO as EditorProject
    },
    save: async (project) => {
      await set(key, project, store)
    },
  }
}
