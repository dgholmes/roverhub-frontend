/** Keyboard shortcuts for the capture rail. Kept out of the component so they
 * can be tested in node (no DOM in this project's Vitest).
 *
 * P takes a photo. R is reserved for Record and becomes live with it. Neither
 * collides with teleop, which owns W/A/S/D/Q/E and Space. */
export type CaptureAction = 'photo' | 'record'

export function captureActionFor(e: {
  key: string
  repeat?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  /** Tag name of the event target, e.g. 'INPUT'. */
  targetTag?: string
  targetEditable?: boolean
}): CaptureAction | null {
  // Holding P must not fire a burst of photos.
  if (e.repeat) return null
  // Never claim a browser or OS chord (Ctrl+P is Print).
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  // Typing a "p" into a field is not a request for a photo.
  const tag = e.targetTag?.toUpperCase()
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.targetEditable) return null
  const key = e.key.toLowerCase()
  if (key === 'p') return 'photo'
  if (key === 'r') return 'record'
  return null
}
