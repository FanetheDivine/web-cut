export { EditorOpError } from './errors'
export type { EditorOpErrorCode } from './errors'
export { createEmptyProject } from './projectOps'
export { addTrack, removeTrack, reorderTracksByIndex, setTrackOpacity } from './trackOps'
export {
  addAudioClipFromResource,
  addTextClip,
  addVideoClipFromResource,
  assertNoOverlap,
  canPlaceClipInTrack,
  moveClipInTrack,
  moveClipToTrack,
  removeClip,
  resizeClip,
  updateTextClip,
} from './clipOps'
export type { ResizeAnchor } from './clipOps'
