import { useMemo } from 'react'
import type { FC } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { loadFile } from '@/utils'
import { EditorDndKeys, useEditorStore } from '@/features/editor/store/useEditorStore'
import type { ResourceId, ResourceMeta } from '@/features/editor/types'

export type ResourceLibraryPanelProps = Style

type ResourceRowProps = Style & {
  meta: ResourceMeta
  onDelete: (id: ResourceId) => void
}

const ResourceRow: FC<ResourceRowProps> = (props) => {
  const { meta, onDelete, className, style } = props

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: EditorDndKeys.resource(meta.id),
    data: {
      kind: 'resource',
      resourceId: meta.id,
      resourceKind: meta.kind,
    },
  })

  const dragStyle: React.CSSProperties = {
    ...style,
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.6 : 1,
    cursor: 'grab',
  }

  return (
    <div
      ref={setNodeRef}
      className={[
        'flex items-center justify-between gap-2 rounded-md border border-zinc-800 bg-zinc-950/30 px-2 py-1 text-xs',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={dragStyle}
      {...listeners}
      {...attributes}
      title='拖拽到时间轴轨道以创建 clip'
    >
      <div className='min-w-0 flex-1'>
        <div className='truncate text-zinc-100'>{meta.name}</div>
        <div className='truncate text-[11px] text-zinc-400'>
          {meta.kind.toUpperCase()} · {meta.mime} · {Math.round(meta.size / 1024)}KB
          {typeof meta.durationMs === 'number' ? ` · ${Math.round(meta.durationMs)}ms` : ''}
        </div>
      </div>
      <button
        className='rounded border border-zinc-700 px-2 py-1 text-[11px] text-zinc-200 hover:bg-zinc-800'
        type='button'
        onClick={(e) => {
          e.stopPropagation()
          onDelete(meta.id)
        }}
      >
        删除
      </button>
    </div>
  )
}

/**
 * ResourceLibraryPanel（资源库面板）
 *
 * 功能（MVP）：
 * - 上传视频/音频 -> store.addResources
 * - 展示资源列表（按 kind 分组）
 * - 资源行可拖拽（dnd-kit），拖到 TimelineEditor 的轨道 lane 创建 clip
 */
export const ResourceLibraryPanel: FC<ResourceLibraryPanelProps> = (props) => {
  const { className, style } = props

  const resources = useEditorStore((s) => s.project.resources)
  const addResources = useEditorStore((s) => s.addResources)
  const deleteResource = useEditorStore((s) => s.deleteResource)

  const list = useMemo(
    () => Object.values(resources).sort((a, b) => a.createdAt - b.createdAt),
    [resources],
  )
  const videoList = list.filter((x) => x.kind === 'video')
  const audioList = list.filter((x) => x.kind === 'audio')

  return (
    <div className={className} style={style}>
      <div className='flex items-center gap-2'>
        <button
          className='rounded border border-zinc-700 bg-zinc-950/40 px-2 py-1 text-xs text-zinc-100 hover:bg-zinc-800'
          type='button'
          onClick={async () => {
            const files = await loadFile({ accept: 'video/*,audio/*', multiple: true })
            await addResources(files)
          }}
        >
          上传
        </button>
        <div className='text-xs text-zinc-400'>拖拽资源到下方轨道以创建 clip</div>
      </div>

      <div className='mt-3 grid gap-2'>
        <div className='text-xs font-semibold text-zinc-200'>视频</div>
        <div className='grid gap-2'>
          {videoList.length === 0 ? (
            <div className='rounded-md border border-dashed border-zinc-700/70 bg-zinc-950/20 p-2 text-xs text-zinc-500'>
              暂无视频资源
            </div>
          ) : (
            videoList.map((m) => <ResourceRow key={m.id} meta={m} onDelete={deleteResource} />)
          )}
        </div>

        <div className='mt-2 text-xs font-semibold text-zinc-200'>音频</div>
        <div className='grid gap-2'>
          {audioList.length === 0 ? (
            <div className='rounded-md border border-dashed border-zinc-700/70 bg-zinc-950/20 p-2 text-xs text-zinc-500'>
              暂无音频资源
            </div>
          ) : (
            audioList.map((m) => <ResourceRow key={m.id} meta={m} onDelete={deleteResource} />)
          )}
        </div>
      </div>
    </div>
  )
}
