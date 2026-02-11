import { createId } from '@/features/editor/id'
import { EditorOpError } from '@/features/editor/ops/errors'
import {
  assertResourceKindMatchesClipKind,
  assertTrackAcceptsClipKind,
  getClip,
  getTrack,
  getTrackOfClip,
  touchProject,
} from '@/features/editor/ops/projectOps'
import { clampNonNegative, rangesOverlap, toRange } from '@/features/editor/ops/time'
import type {
  AudioClip,
  Clip,
  ClipId,
  ClipKind,
  EditorProject,
  TextClip,
  TrackId,
  VideoClip,
} from '@/features/editor/types'

export type ResizeAnchor = 'start' | 'end'

const MIN_DURATION_MS = 1

export const canPlaceClipInTrack = (trackClips: Clip[], next: Clip, ignoreClipId?: ClipId) => {
  const nextRange = toRange(next.startMs, next.durationMs)
  return trackClips
    .filter((c) => (ignoreClipId ? c.id !== ignoreClipId : true))
    .every((c) => !rangesOverlap(toRange(c.startMs, c.durationMs), nextRange))
}

export const assertNoOverlap = (trackClips: Clip[], next: Clip, ignoreClipId?: ClipId) => {
  if (!canPlaceClipInTrack(trackClips, next, ignoreClipId)) {
    throw new EditorOpError('clip_overlap', `同一轨道内 clip 时间段不能重叠`, {
      trackId: next.trackId,
      clipId: next.id,
      startMs: next.startMs,
      durationMs: next.durationMs,
    })
  }
}

export const addVideoClipFromResource = (
  project: EditorProject,
  input: Omit<VideoClip, 'id' | 'kind'>,
) => {
  const track = getTrack(project, input.trackId)
  assertTrackAcceptsClipKind(track.kind, 'video')
  const res = project.resources[input.resourceId]
  if (!res)
    throw new EditorOpError(
      'resource_kind_mismatch',
      `找不到资源 resourceId=${input.resourceId}`,
      input,
    )
  assertResourceKindMatchesClipKind(res.kind, 'video')

  const clip: VideoClip = { ...input, id: createId('clip'), kind: 'video' }
  if (clip.startMs < 0 || clip.durationMs < MIN_DURATION_MS || clip.trimStartMs < 0) {
    throw new EditorOpError('invalid_time', `非法时间参数`, clip)
  }
  assertNoOverlap(track.clips, clip)

  const next: EditorProject = {
    ...project,
    tracks: project.tracks.map((t) =>
      t.id === track.id ? { ...t, clips: [...t.clips, clip] } : t,
    ),
  }
  return touchProject(next)
}

export const addAudioClipFromResource = (
  project: EditorProject,
  input: Omit<AudioClip, 'id' | 'kind'>,
) => {
  const track = getTrack(project, input.trackId)
  assertTrackAcceptsClipKind(track.kind, 'audio')
  const res = project.resources[input.resourceId]
  if (!res)
    throw new EditorOpError(
      'resource_kind_mismatch',
      `找不到资源 resourceId=${input.resourceId}`,
      input,
    )
  assertResourceKindMatchesClipKind(res.kind, 'audio')

  const clip: AudioClip = { ...input, id: createId('clip'), kind: 'audio' }
  if (clip.startMs < 0 || clip.durationMs < MIN_DURATION_MS || clip.trimStartMs < 0) {
    throw new EditorOpError('invalid_time', `非法时间参数`, clip)
  }
  assertNoOverlap(track.clips, clip)

  const next: EditorProject = {
    ...project,
    tracks: project.tracks.map((t) =>
      t.id === track.id ? { ...t, clips: [...t.clips, clip] } : t,
    ),
  }
  return touchProject(next)
}

export const addTextClip = (project: EditorProject, input: Omit<TextClip, 'id' | 'kind'>) => {
  const track = getTrack(project, input.trackId)
  assertTrackAcceptsClipKind(track.kind, 'text')

  const clip: TextClip = { ...input, id: createId('clip'), kind: 'text' }
  if (clip.startMs < 0 || clip.durationMs < MIN_DURATION_MS) {
    throw new EditorOpError('invalid_time', `非法时间参数`, clip)
  }
  assertNoOverlap(track.clips, clip)

  const next: EditorProject = {
    ...project,
    tracks: project.tracks.map((t) =>
      t.id === track.id ? { ...t, clips: [...t.clips, clip] } : t,
    ),
  }
  return touchProject(next)
}

export const moveClipInTrack = (project: EditorProject, clipId: ClipId, nextStartMs: number) => {
  const clip = getClip(project, clipId)
  const track = getTrack(project, clip.trackId)

  const moved: Clip = { ...clip, startMs: clampNonNegative(nextStartMs) }
  assertNoOverlap(track.clips, moved, clipId)

  const next: EditorProject = {
    ...project,
    tracks: project.tracks.map((t) =>
      t.id !== track.id ? t : { ...t, clips: t.clips.map((c) => (c.id === clipId ? moved : c)) },
    ),
  }
  return touchProject(next)
}

export const moveClipToTrack = (
  project: EditorProject,
  clipId: ClipId,
  nextTrackId: TrackId,
  nextStartMs: number,
) => {
  const clip = getClip(project, clipId)
  const fromTrack = getTrack(project, clip.trackId)
  const toTrack = getTrack(project, nextTrackId)
  assertTrackAcceptsClipKind(toTrack.kind, clip.kind as ClipKind)

  const moved: Clip = { ...clip, trackId: nextTrackId, startMs: clampNonNegative(nextStartMs) }
  assertNoOverlap(toTrack.clips, moved)

  const next: EditorProject = {
    ...project,
    tracks: project.tracks.map((t) => {
      if (t.id === fromTrack.id) return { ...t, clips: t.clips.filter((c) => c.id !== clipId) }
      if (t.id === toTrack.id) return { ...t, clips: [...t.clips, moved] }
      return t
    }),
  }
  return touchProject(next)
}

export const resizeClip = (
  project: EditorProject,
  clipId: ClipId,
  nextDurationMs: number,
  anchor: ResizeAnchor,
) => {
  const clip = getClip(project, clipId)
  const track = getTrack(project, clip.trackId)

  const durationMs = Math.max(MIN_DURATION_MS, nextDurationMs)
  const resized: Clip =
    anchor === 'end'
      ? { ...clip, durationMs }
      : {
          ...clip,
          // anchor=start 表示拖动左边界：end 不变，start 改变
          startMs: clampNonNegative(clip.startMs + clip.durationMs - durationMs),
          durationMs,
        }

  assertNoOverlap(track.clips, resized, clipId)

  const next: EditorProject = {
    ...project,
    tracks: project.tracks.map((t) =>
      t.id !== track.id ? t : { ...t, clips: t.clips.map((c) => (c.id === clipId ? resized : c)) },
    ),
  }
  return touchProject(next)
}

export const updateTextClip = (
  project: EditorProject,
  clipId: ClipId,
  patch: Partial<Omit<TextClip, 'id' | 'kind'>>,
) => {
  const clip = getClip(project, clipId)
  if (clip.kind !== 'text') {
    throw new EditorOpError('track_kind_mismatch', `仅 text clip 支持 updateTextClip`, {
      clipId,
      kind: clip.kind,
    })
  }
  const track = getTrack(project, clip.trackId)

  const nextClip: TextClip = {
    ...clip,
    ...patch,
    style: { ...clip.style, ...(patch.style ?? {}) },
    transform: { ...clip.transform, ...(patch.transform ?? {}) },
  }
  assertNoOverlap(track.clips, nextClip, clipId)

  const next: EditorProject = {
    ...project,
    tracks: project.tracks.map((t) =>
      t.id !== track.id ? t : { ...t, clips: t.clips.map((c) => (c.id === clipId ? nextClip : c)) },
    ),
  }
  return touchProject(next)
}

export const removeClip = (project: EditorProject, clipId: ClipId) => {
  const track = getTrackOfClip(project, clipId)
  const next: EditorProject = {
    ...project,
    tracks: project.tracks.map((t) =>
      t.id === track.id ? { ...t, clips: t.clips.filter((c) => c.id !== clipId) } : t,
    ),
  }
  return touchProject(next)
}
