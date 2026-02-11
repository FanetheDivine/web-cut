import { createId } from '@/features/editor/id'
import { EditorOpError } from '@/features/editor/ops/errors'
import type {
  Clip,
  ClipId,
  ClipKind,
  EditorProject,
  ResourceKind,
  Track,
  TrackId,
  TrackKind,
} from '@/features/editor/types'

export const createEmptyProject = (
  patch?: Partial<Pick<EditorProject, 'name' | 'settings'>>,
): EditorProject => {
  const now = Date.now()
  return {
    id: createId('proj'),
    name: patch?.name ?? 'Untitled',
    createdAt: now,
    updatedAt: now,
    resources: {},
    tracks: [],
    settings: {
      width: patch?.settings?.width ?? 1280,
      height: patch?.settings?.height ?? 720,
      fps: patch?.settings?.fps ?? 30,
      backgroundColor: patch?.settings?.backgroundColor ?? '#000000',
    },
  }
}

export const touchProject = (project: EditorProject): EditorProject => ({
  ...project,
  updatedAt: Date.now(),
})

export const getTrack = (project: EditorProject, trackId: TrackId): Track => {
  const track = project.tracks.find((t) => t.id === trackId)
  if (!track)
    throw new EditorOpError('track_not_found', `找不到轨道 trackId=${trackId}`, { trackId })
  return track
}

export const getClip = (project: EditorProject, clipId: ClipId): Clip => {
  for (const t of project.tracks) {
    const found = t.clips.find((c) => c.id === clipId)
    if (found) return found
  }
  throw new EditorOpError('clip_not_found', `找不到片段 clipId=${clipId}`, { clipId })
}

export const getTrackOfClip = (project: EditorProject, clipId: ClipId): Track => {
  for (const t of project.tracks) {
    if (t.clips.some((c) => c.id === clipId)) return t
  }
  throw new EditorOpError('clip_not_found', `找不到片段 clipId=${clipId}`, { clipId })
}

export const assertTrackAcceptsClipKind = (trackKind: TrackKind, clipKind: ClipKind) => {
  const ok =
    (trackKind === 'video' && clipKind === 'video') ||
    (trackKind === 'audio' && clipKind === 'audio') ||
    (trackKind === 'text' && clipKind === 'text')
  if (!ok) {
    throw new EditorOpError(
      'track_kind_mismatch',
      `轨道类型不匹配 trackKind=${trackKind} clipKind=${clipKind}`,
      {
        trackKind,
        clipKind,
      },
    )
  }
}

export const assertResourceKindMatchesClipKind = (
  resourceKind: ResourceKind,
  clipKind: ClipKind,
) => {
  const ok =
    (resourceKind === 'video' && clipKind === 'video') ||
    (resourceKind === 'audio' && clipKind === 'audio')
  if (!ok) {
    throw new EditorOpError(
      'resource_kind_mismatch',
      `资源类型不匹配 resourceKind=${resourceKind} clipKind=${clipKind}`,
      { resourceKind, clipKind },
    )
  }
}
