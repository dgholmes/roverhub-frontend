/** Number keys for the camera bar, as FlightHub's number keys pick a lens.
 * Pure, like captureHotkeys.ts, so it can be tested in node.
 *
 * 1 is RGB and 2 is Depth. Neither collides with teleop (W/A/S/D/Q/E, Space,
 * the game-mode key) or the capture rail (P, R). */
export type CameraHotkeyMode = 'rgb' | 'depth'

export const CAMERA_KEYS: Record<CameraHotkeyMode, string> = { rgb: '1', depth: '2' }

export function cameraModeFor(e: {
  key: string
  repeat?: boolean
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
  targetTag?: string
  targetEditable?: boolean
}): CameraHotkeyMode | null {
  if (e.repeat) return null
  // Alt+1 / Ctrl+1 switch browser tabs.
  if (e.ctrlKey || e.metaKey || e.altKey) return null
  const tag = e.targetTag?.toUpperCase()
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.targetEditable) return null
  if (e.key === CAMERA_KEYS.rgb) return 'rgb'
  if (e.key === CAMERA_KEYS.depth) return 'depth'
  return null
}
