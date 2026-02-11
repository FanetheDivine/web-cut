export { EditorOpError } from './errors'
export type { EditorOpErrorCode } from './errors'
export { createEmptyProject } from './projectOps'
export {
  addTrack,
  removeTrack,
  reorderTracksByIndex,
  setTrackName,
  setTrackOpacity,
} from './trackOps'
export {
  addAudioClipFromResource,
  addTextClip,
  addVideoClipFromResource,
  moveClipInTrack,
  moveClipToTrack,
  removeClip,
  resizeClip,
  updateTextClip,
} from './clipOps'
export type { ResizeAnchor } from './clipOps'
