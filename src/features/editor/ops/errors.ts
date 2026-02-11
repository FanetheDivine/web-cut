export type EditorOpErrorCode =
  | 'track_not_found'
  | 'clip_not_found'
  | 'invalid_time'
  | 'clip_overlap'
  | 'track_kind_mismatch'
  | 'resource_kind_mismatch'

export class EditorOpError extends Error {
  public readonly code: EditorOpErrorCode
  public readonly details?: Record<string, unknown>

  constructor(code: EditorOpErrorCode, message: string, details?: Record<string, unknown>) {
    super(message)
    this.code = code
    this.details = details
  }
}
