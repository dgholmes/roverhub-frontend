import { useCallback, useState } from 'react'

/**
 * View memory: the per-viewer choices a reload should not throw away -- which
 * camera is the main one, how the map is zoomed, which LiveOps layout is up.
 *
 * Where view state lives, as of 2026-11-26 (a reload landed the operator on
 * an offline rover-pi instead of the rover-jetson they had chosen, and they
 * took it for a lost connection):
 * - **The address** holds what a link should carry: the site and workspace,
 *   the robot (`?robot=`), and the page or tab inside a workspace (Fleet's
 *   robot, a Data tab, a Map tab, the mission editor). See `app/routes.tsx`.
 * - **This module** (localStorage) holds the viewer's own conveniences, keyed
 *   by site and robot where they depend on them.
 *
 * Every key starts with `rh.view.`. Values are JSON and validated on the way
 * back in, so a value from an older build, or one hand-edited, reads as
 * nothing and the caller's default applies. Every read and write is wrapped:
 * a private window or blocked storage only means nothing is remembered.
 */
export const VIEW_MEMORY_PREFIX = 'rh.view.'

/** `rh.view.{part}.{part}...`. Parts are used as they are: site and robot ids
 * contain no dots that matter, and a key only has to be stable. */
export function viewKey(...parts: string[]): string {
  return VIEW_MEMORY_PREFIX + parts.join('.')
}

/** The value remembered under `key`, or null when there is none, it does not
 * pass `valid`, or storage is unavailable. */
export function recall<T>(key: string, valid: (v: unknown) => v is T): T | null {
  try {
    const raw = globalThis.localStorage?.getItem(key)
    if (raw == null) return null
    const value: unknown = JSON.parse(raw)
    return valid(value) ? value : null
  } catch {
    return null
  }
}

/** Remember `value` under `key`. Never throws. */
export function remember(key: string, value: unknown): void {
  try { globalThis.localStorage?.setItem(key, JSON.stringify(value)) } catch { /* convenience only */ }
}

/**
 * `useState` that is remembered under `key`. A different key (another robot,
 * another site) reads that key's value, or `fallback`, on the render that
 * changes it. A null key keeps the value in memory only -- for a component
 * with no robot yet.
 */
export function useRemembered<T>(
  key: string | null,
  fallback: T,
  valid: (v: unknown) => v is T,
): [T, (value: T) => void] {
  const read = (k: string | null): T => (k === null ? fallback : recall(k, valid) ?? fallback)
  const [state, setState] = useState<{ key: string | null; value: T }>(() => ({ key, value: read(key) }))
  // Caught during render, like useMapFollow's robot change, so the first frame
  // drawn for the new key already shows its value.
  const current = state.key === key ? state : { key, value: read(key) }
  if (state.key !== key) setState(current)
  const set = useCallback((value: T) => {
    if (key !== null) remember(key, value)
    setState({ key, value })
  }, [key])
  return [current.value, set]
}
