import { useSyncExternalStore } from 'react'

/**
 * The run page's cursor: seconds since the run started. Held outside React
 * state on purpose -- a timeline drag or the video's timeupdate moves it many
 * times a second, and putting it in RunPage's state re-rendered the whole page
 * (figure, lanes, table, event list) each time. Only the few components that
 * draw the cursor subscribe, and each picks out the one thing it needs.
 *
 * `from` says who moved it, so the video can follow every move but its own.
 */
export type CursorSource = 'user' | 'video' | 'play'

export interface RunCursor {
  get(): number
  set(t: number, from?: CursorSource): void
  subscribe(fn: (from: CursorSource) => void): () => void
}

export function createRunCursor(initial = 0): RunCursor {
  let value = initial
  const subs = new Set<(from: CursorSource) => void>()
  return {
    get: () => value,
    set(t, from = 'user') {
      if (!Number.isFinite(t) || t === value) return
      value = t
      for (const fn of subs) fn(from)
    },
    subscribe(fn) {
      subs.add(fn)
      return () => { subs.delete(fn) }
    },
  }
}

/** Re-renders only when `select(t)` changes (compared with Object.is), so pick
 * a primitive: an index, a rounded number, or `t` itself where every move
 * matters. */
export function useCursor<T extends string | number | boolean | null>(cursor: RunCursor, select: (t: number) => T): T {
  return useSyncExternalStore(cursor.subscribe, () => select(cursor.get()), () => select(cursor.get()))
}
