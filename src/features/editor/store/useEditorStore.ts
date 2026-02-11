import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import { ensureIdbObjectStore } from '@/features/editor/indexedDb'
import {
  addAudioClipFromResource,
  addTextClip,
  addTrack,
  addVideoClipFromResource,
  moveClipInTrack,
  moveClipToTrack,
  removeClip,
  removeTrack,
  reorderTracksByIndex,
  resizeClip,
  setTrackOpacity,
  updateTextClip,
} from '@/features/editor/ops'
import type { ResizeAnchor } from '@/features/editor/ops'
import { createEmptyProject } from '@/features/editor/ops/projectOps'
import { createProjectStorage } from '@/features/editor/projectStorage'
import { createResourceRepository } from '@/features/editor/resourceRepository'
import type { ResourceRepository } from '@/features/editor/resourceRepository'
import type {
  ClipId,
  EditorProject,
  EditorUIState,
  ResourceId,
  TrackId,
  TrackKind,
} from '@/features/editor/types'

/**
 * 全局编辑器 store（Zustand）
 *
 * 设计目标
 * - UI 只做“视图 + 交互收集”，业务规则尽量收敛在 ops（纯函数）与 store actions。
 * - 未来生成组件代码时，可以把下面的 action 当作“组件需要调用的 API 列表”。
 *
 * 注意
 * - 原型阶段直接在 action 内调用 ProjectStorage.save；生产级可做节流/批量/版本迁移。
 */

export type EditorState = {
  project: EditorProject
  ui: EditorUIState
  repo: ResourceRepository | null
  /**
   * 预览帧渲染器（由 PreviewCanvas 注册）
   * - 用于在 setPlayheadMs 时“立刻触发渲染”，避免 useEffect 带来的后发先至问题
   * - 注意：这是运行时字段，不参与持久化
   */
  frameRenderer?: (playheadMs: number) => void
  /** 最近一次错误（UI 可选择展示 toast） */
  lastError?: { message: string; code?: string; details?: Record<string, unknown> }
}

export type EditorActions = {
  init: () => Promise<void>
  persist: () => Promise<void>

  setPlayheadMs: (ms: number) => void
  registerFrameRenderer: (renderer: (playheadMs: number) => void) => void
  unregisterFrameRenderer: () => void
  setZoom: (zoom: number) => void
  selectClip: (clipId?: ClipId) => void
  selectTrack: (trackId?: TrackId) => void

  addResources: (files: File[]) => Promise<void>
  deleteResource: (resourceId: ResourceId) => Promise<void>

  addTrack: (kind: TrackKind) => void
  removeTrack: (trackId: TrackId) => void
  reorderTracksByIndex: (fromIndex: number, toIndex: number) => void
  setTrackOpacity: (trackId: TrackId, opacity: number) => void

  addClipFromResource: (input: {
    resourceId: ResourceId
    trackId: TrackId
    startMs: number
    durationMs: number
  }) => void
  addTextClip: (input: {
    trackId: TrackId
    startMs: number
    durationMs: number
    text?: string
  }) => void
  removeClip: (clipId: ClipId) => void
  moveClip: (clipId: ClipId, nextStartMs: number) => void
  moveClipToTrack: (clipId: ClipId, nextTrackId: TrackId, nextStartMs: number) => void
  resizeClip: (clipId: ClipId, nextDurationMs: number, anchor: ResizeAnchor) => void
  updateTextClip: (
    clipId: ClipId,
    patch: Partial<{
      text: string
      startMs: number
      durationMs: number
      style: Partial<{
        fontFamily: string
        fontSize: number
        fontWeight: number | 'normal' | 'bold'
        color: string
        align: 'left' | 'center' | 'right'
      }>
      transform: Partial<{ x: number; y: number; scale: number; rotateDeg: number }>
    }>,
  ) => void
}

type UpdateTextClipPatch = Parameters<typeof updateTextClip>[2]

const storage = createProjectStorage()

const reportError = (setState: (fn: (s: EditorState) => void) => void, e: unknown) => {
  const err = e instanceof Error ? e : new Error(String(e))
  // 尽量把 ops 的错误信息带出来（若存在 code/details）
  const anyErr = e as { code?: unknown; details?: unknown }
  setState((s) => {
    s.lastError = {
      message: err.message,
      code: typeof anyErr?.code === 'string' ? anyErr.code : undefined,
      details:
        typeof anyErr?.details === 'object'
          ? (anyErr.details as Record<string, unknown>)
          : undefined,
    }
  })
}

export const useEditorStore = create<EditorState & EditorActions>()(
  immer((set, get) => ({
    project: createEmptyProject({ name: 'WebCut' }),
    ui: {
      playheadMs: 0,
      zoom: 1,
    },
    repo: null,
    frameRenderer: undefined,
    lastError: undefined,

    init: async () => {
      /**
       * 关键：先确保所需的 object store 都存在，再做任何 createStore/get/set。
       *
       * 否则会出现：
       * - ProjectStorage 先打开了 dbName='web-cut' 的连接（读 project）
       * - 后续 ResourceRepository 发现缺少 storeName='resource-repo'，尝试升级 version+1
       * - 由于同页面已有旧连接未关闭，升级触发 `onblocked` -> “indexedDB upgrade blocked”
       */
      await ensureIdbObjectStore('web-cut', 'resource-repo')
      await ensureIdbObjectStore('web-cut', 'project')

      // 初始化 repo（可扩展：注入不同实现）
      const repo = createResourceRepository()

      const persisted = await storage.load()
      set((s) => {
        s.repo = repo
        if (persisted) {
          s.project = persisted
          // 游标不持久化，默认归零
          s.ui.playheadMs = 0
          s.ui.zoom = 1
        }
      })
    },

    persist: async () => {
      await storage.save(get().project)
    },

    setPlayheadMs: (ms) => {
      const next = Math.max(0, ms)
      set((s) => {
        s.ui.playheadMs = next
      })
      // 立刻渲染：避免依赖 useEffect 在 commit 后触发导致顺序错乱
      get().frameRenderer?.(next)
    },

    registerFrameRenderer: (renderer) => {
      set((s) => {
        s.frameRenderer = renderer
      })
      // 注册后立刻渲染一次当前帧，保证首屏不空
      const ms = get().ui.playheadMs
      renderer(ms)
    },

    unregisterFrameRenderer: () => {
      set((s) => {
        s.frameRenderer = undefined
      })
    },

    setZoom: (zoom) => {
      set((s) => {
        s.ui.zoom = zoom <= 0 ? 1 : zoom
      })
    },

    selectClip: (clipId) => {
      set((s) => {
        s.ui.selectedClipId = clipId
      })
    },

    selectTrack: (trackId) => {
      set((s) => {
        s.ui.selectedTrackId = trackId
      })
    },

    addResources: async (files) => {
      const repo = get().repo
      if (!repo) return

      try {
        const metas = await Promise.all(files.map((f) => repo.put(f)))
        set((s) => {
          metas.forEach((m) => {
            s.project.resources[m.id] = m
          })
          s.project.updatedAt = Date.now()
        })
        await storage.save(get().project)
      } catch (e) {
        reportError(set, e)
      }
    },

    deleteResource: async (resourceId) => {
      const repo = get().repo
      if (!repo) return

      try {
        await repo.delete(resourceId)
        set((s) => {
          delete s.project.resources[resourceId]
          s.project.updatedAt = Date.now()
        })
        await storage.save(get().project)
      } catch (e) {
        reportError(set, e)
      }
    },

    addTrack: (kind) => {
      try {
        const next = addTrack(get().project, kind)
        set((s) => {
          s.project = next
        })
        void storage.save(get().project)
      } catch (e) {
        reportError(set, e)
      }
    },

    removeTrack: (trackId) => {
      try {
        const next = removeTrack(get().project, trackId)
        set((s) => {
          s.project = next
        })
        void storage.save(get().project)
      } catch (e) {
        reportError(set, e)
      }
    },

    reorderTracksByIndex: (fromIndex, toIndex) => {
      try {
        const next = reorderTracksByIndex(get().project, fromIndex, toIndex)
        set((s) => {
          s.project = next
        })
        void storage.save(get().project)
      } catch (e) {
        reportError(set, e)
      }
    },

    setTrackOpacity: (trackId, opacity) => {
      try {
        const next = setTrackOpacity(get().project, trackId, opacity)
        set((s) => {
          s.project = next
        })
        void storage.save(get().project)
      } catch (e) {
        reportError(set, e)
      }
    },

    addClipFromResource: ({ resourceId, trackId, startMs, durationMs }) => {
      const project = get().project
      const res = project.resources[resourceId]
      if (!res) {
        reportError(set, new Error(`找不到资源 resourceId=${resourceId}`))
        return
      }
      try {
        const next =
          res.kind === 'video'
            ? addVideoClipFromResource(project, {
                resourceId,
                trackId,
                startMs,
                durationMs,
                trimStartMs: 0,
              })
            : addAudioClipFromResource(project, {
                resourceId,
                trackId,
                startMs,
                durationMs,
                trimStartMs: 0,
                volume: 1,
              })
        set((s) => {
          s.project = next
        })
        void storage.save(get().project)
      } catch (e) {
        reportError(set, e)
      }
    },

    addTextClip: ({ trackId, startMs, durationMs, text }) => {
      try {
        const next = addTextClip(get().project, {
          trackId,
          startMs,
          durationMs,
          text: text ?? 'Hello',
          style: {
            fontFamily: 'sans-serif',
            fontSize: 64,
            fontWeight: 'bold',
            color: '#ffffff',
            align: 'center',
          },
          transform: {
            x: 100,
            y: 100,
            scale: 1,
            rotateDeg: 0,
          },
        })
        set((s) => {
          s.project = next
        })
        void storage.save(get().project)
      } catch (e) {
        reportError(set, e)
      }
    },

    removeClip: (clipId) => {
      try {
        const next = removeClip(get().project, clipId)
        set((s) => {
          s.project = next
        })
        void storage.save(get().project)
      } catch (e) {
        reportError(set, e)
      }
    },

    moveClip: (clipId, nextStartMs) => {
      try {
        const next = moveClipInTrack(get().project, clipId, nextStartMs)
        set((s) => {
          s.project = next
        })
        void storage.save(get().project)
      } catch (e) {
        reportError(set, e)
      }
    },

    moveClipToTrack: (clipId, nextTrackId, nextStartMs) => {
      try {
        const next = moveClipToTrack(get().project, clipId, nextTrackId, nextStartMs)
        set((s) => {
          s.project = next
        })
        void storage.save(get().project)
      } catch (e) {
        reportError(set, e)
      }
    },

    resizeClip: (clipId, nextDurationMs, anchor) => {
      try {
        const next = resizeClip(get().project, clipId, nextDurationMs, anchor)
        set((s) => {
          s.project = next
        })
        void storage.save(get().project)
      } catch (e) {
        reportError(set, e)
      }
    },

    updateTextClip: (clipId, patch) => {
      try {
        const next = updateTextClip(get().project, clipId, patch as UpdateTextClipPatch)
        set((s) => {
          s.project = next
        })
        void storage.save(get().project)
      } catch (e) {
        reportError(set, e)
      }
    },
  })),
)

/**
 * 未来组件生成器可直接复用的“约定性 key”
 * - 用于 DOM 上的 data-* / dnd-kit 的 draggable id 等
 */
export const EditorDndKeys = {
  track: (trackId: TrackId) => `track:${trackId}`,
  clip: (clipId: ClipId) => `clip:${clipId}`,
  clipResizeStart: (clipId: ClipId) => `clipResizeStart:${clipId}`,
  clipResizeEnd: (clipId: ClipId) => `clipResizeEnd:${clipId}`,
  resource: (resourceId: ResourceId) => `resource:${resourceId}`,
  project: () => `project`,
}
