import { createId } from '@/features/editor/id'
import { EditorOpError } from '@/features/editor/ops/errors'
import { getTrack, touchProject } from '@/features/editor/ops/projectOps'
import type { EditorProject, Track, TrackId, TrackKind } from '@/features/editor/types'

export const addTrack = (
  project: EditorProject,
  kind: TrackKind,
  patch?: Partial<Pick<Track, 'name' | 'opacity'>>,
) => {
  const next: EditorProject = {
    ...project,
    tracks: [...project.tracks],
  }
  const order = next.tracks.length
  const track: Track = {
    id: createId('trk'),
    kind,
    name: patch?.name ?? `${kind.toUpperCase()} Track`,
    order,
    opacity: patch?.opacity ?? 1,
    clips: [],
  }
  next.tracks.push(track)
  return touchProject(next)
}

export const removeTrack = (project: EditorProject, trackId: TrackId) => {
  // 不允许删除后“静默丢失 clip”，这里直接删轨并丢弃 clip（原型阶段）
  // TODO(可扩展): 未来可改为：删除时把 clip 移到回收站/或弹确认框
  const existed = project.tracks.some((t) => t.id === trackId)
  if (!existed)
    throw new EditorOpError('track_not_found', `找不到轨道 trackId=${trackId}`, { trackId })
  const next = { ...project, tracks: project.tracks.filter((t) => t.id !== trackId) }
  // 重置 order 保证稳定
  next.tracks = next.tracks.map((t, idx) => ({ ...t, order: idx }))
  return touchProject(next)
}

export const setTrackOpacity = (project: EditorProject, trackId: TrackId, opacity: number) => {
  if (Number.isNaN(opacity) || opacity < 0 || opacity > 1) {
    throw new EditorOpError('invalid_time', `非法 opacity=${opacity}`, { opacity })
  }
  const next = {
    ...project,
    tracks: project.tracks.map((t) => (t.id === trackId ? { ...t, opacity } : t)),
  }
  // validate track existence
  getTrack(next, trackId)
  return touchProject(next)
}

export const reorderTracksByIndex = (
  project: EditorProject,
  fromIndex: number,
  toIndex: number,
) => {
  const tracks = [...project.tracks]
  if (fromIndex < 0 || fromIndex >= tracks.length || toIndex < 0 || toIndex >= tracks.length) {
    throw new EditorOpError('track_not_found', `非法轨道索引 from=${fromIndex} to=${toIndex}`, {
      fromIndex,
      toIndex,
    })
  }
  const [moved] = tracks.splice(fromIndex, 1)
  tracks.splice(toIndex, 0, moved)
  const next = { ...project, tracks: tracks.map((t, idx) => ({ ...t, order: idx })) }
  return touchProject(next)
}
