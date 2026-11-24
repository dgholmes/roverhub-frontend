import { useEffect, useState } from 'react'
import { layoutFor, shouldUseTouchShell, type Orientation, type TouchLayout } from './touchShell'

/**
 * Which shell this browser gets, and the layout axes inside it.
 *
 * All of the decision logic lives in `touchShell.ts` as pure functions; this
 * module is only the browser plumbing — the media query, the viewport size and
 * the two listeners that re-evaluate them.
 *
 * ⚠️ Every `window` / `matchMedia` access is guarded. Vitest runs with
 * `environment: 'node'`, so importing this module (directly, or transitively
 * from a component under test) must not throw, and the hook must return a
 * sane desktop answer when there is no DOM at all.
 */

export const TOUCH_POINTER_QUERY = '(pointer: coarse)'

export interface TouchShellState extends TouchLayout {
  /** True when the touch console should be rendered instead of the desktop one. */
  touch: boolean
  orientation: Orientation
  big: boolean
}

/** The answer with no DOM: desktop, landscape, big. Used in the node test
 * environment and during SSR — never a touch shell by default, because the
 * desktop console is the one that has been in operators' hands all along. */
const NO_DOM: TouchShellState = { touch: false, orientation: 'landscape', big: true }

function matchCoarsePointer(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia(TOUCH_POINTER_QUERY).matches
  } catch {
    // An engine without `(pointer: coarse)` support throws on the query rather
    // than reporting a non-match. Treat that as a fine pointer.
    return false
  }
}

/** Read the current shell state straight from the browser. Exported so a
 * caller can get the same answer outside a React render if it ever needs to. */
export function readTouchShell(): TouchShellState {
  if (typeof window === 'undefined') return NO_DOM
  const layout = layoutFor({ width: window.innerWidth, height: window.innerHeight })
  return {
    touch: shouldUseTouchShell({
      coarsePointer: matchCoarsePointer(),
      search: window.location.search,
    }),
    ...layout,
  }
}

function same(a: TouchShellState, b: TouchShellState): boolean {
  return a.touch === b.touch && a.orientation === b.orientation && a.big === b.big
}

export function useTouchShell(): TouchShellState {
  const [state, setState] = useState<TouchShellState>(readTouchShell)

  useEffect(() => {
    if (typeof window === 'undefined') return
    // Keep the object identity when nothing changed: `resize` fires many times
    // during an orientation animation, and a new object each time would
    // remount the drive sticks mid-drive for no reason.
    const sync = () =>
      setState((prev) => {
        const next = readTouchShell()
        return same(prev, next) ? prev : next
      })
    sync()

    const media =
      typeof window.matchMedia === 'function' ? window.matchMedia(TOUCH_POINTER_QUERY) : null
    // Safari before 14 has only the deprecated addListener/removeListener pair.
    if (media?.addEventListener) media.addEventListener('change', sync)
    else media?.addListener?.(sync)

    window.addEventListener('orientationchange', sync)
    window.addEventListener('resize', sync)
    return () => {
      if (media?.removeEventListener) media.removeEventListener('change', sync)
      else media?.removeListener?.(sync)
      window.removeEventListener('orientationchange', sync)
      window.removeEventListener('resize', sync)
    }
  }, [])

  return state
}
