import { useSyncExternalStore } from 'react'

/**
 * Which robot marker the LiveOps maps draw, as this browser last chose.
 *
 * - `body` -- the robot at its true size, a rounded body with a beam from
 *   the nose (RobotMarker). The default.
 * - `classic` -- the original fixed-size circle with an arrow
 *   (ClassicRobotMarker). Kept because it has its own charm, not as a
 *   fallback (user, 2026-11-25).
 *
 * ⚠️ One store for the whole page, not a useState per map: the main map and
 * its inset are separate MapCanvas instances, and a switch flipped in one
 * must redraw the other at once rather than on the next reload.
 *
 * A per-viewer convenience: every read and write is wrapped, and a browser
 * that refuses storage simply gets the default each time.
 */
export type RobotMarkerStyle = 'body' | 'classic'

export const DEFAULT_ROBOT_MARKER: RobotMarkerStyle = 'body'
export const ROBOT_MARKER_KEY = 'rh.liveops.robotMarker'

function read(): RobotMarkerStyle {
  try {
    return localStorage.getItem(ROBOT_MARKER_KEY) === 'classic' ? 'classic' : DEFAULT_ROBOT_MARKER
  } catch {
    return DEFAULT_ROBOT_MARKER
  }
}

let current: RobotMarkerStyle | null = null
const listeners = new Set<() => void>()

export function getRobotMarkerStyle(): RobotMarkerStyle {
  if (current === null) current = read()
  return current
}

export function setRobotMarkerStyle(style: RobotMarkerStyle): void {
  current = style
  try { localStorage.setItem(ROBOT_MARKER_KEY, style) } catch { /* convenience only */ }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Forget the cached choice, so the next read goes back to storage. Tests only. */
export function resetRobotMarkerStyleForTests(): void {
  current = null
}

export function useRobotMarkerStyle(): [RobotMarkerStyle, (style: RobotMarkerStyle) => void] {
  const style = useSyncExternalStore(subscribe, getRobotMarkerStyle, () => DEFAULT_ROBOT_MARKER)
  return [style, setRobotMarkerStyle]
}
