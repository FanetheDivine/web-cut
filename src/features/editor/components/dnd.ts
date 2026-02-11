import { EditorDndKeys } from '@/features/editor/store/useEditorStore'

export type EditorDraggable =
  | { kind: 'resource'; resourceId: string }
  | { kind: 'clip'; clipId: string }
  | { kind: 'track'; trackId: string }

export const parseEditorDraggableId = (id: unknown): EditorDraggable | null => {
  const raw = typeof id === 'string' ? id : ''

  if (raw.startsWith('resource:')) {
    return { kind: 'resource', resourceId: raw.slice('resource:'.length) }
  }
  if (raw.startsWith('clip:')) {
    return { kind: 'clip', clipId: raw.slice('clip:'.length) }
  }
  if (raw.startsWith('track:')) {
    return { kind: 'track', trackId: raw.slice('track:'.length) }
  }

  // 保底：若后续改了前缀，这里也能尽早发现（返回 null）
  void EditorDndKeys
  return null
}
