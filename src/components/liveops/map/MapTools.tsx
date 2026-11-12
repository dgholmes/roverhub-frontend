import { memo, useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { SlidersHorizontal } from 'lucide-react'
import { color, glass, radius } from '@/design-system/tokens'

/** Below either, the map is a small pane (Split view's map beside the camera)
 * and shows only itself: no tools, no captions. */
export const COMPACT_WIDTH = 640
export const COMPACT_HEIGHT = 420

export function isCompact(width: number, height: number): boolean {
  return width < COMPACT_WIDTH || height < COMPACT_HEIGHT
}

/** Whether the element is a small pane, re-measured as it resizes. Starts
 * compact until measured, so nothing flashes over a small map first. */
export function useCompact(ref: React.RefObject<HTMLElement | null>): boolean {
  const [compact, setCompact] = useState(true)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setCompact(isCompact(el.clientWidth, el.clientHeight))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return compact
}

/** Per browser: whether the operator keeps the map's tools open. */
export const MAP_TOOLS_KEY = 'rh.liveops.mapTools'

function readToolsPref(): boolean {
  try { return globalThis.localStorage?.getItem(MAP_TOOLS_KEY) === 'open' } catch { return false }
}

/** Closed until opened, then remembered (a per-viewer convenience: storage
 * that cannot be read or written just means closed). */
export function useMapToolsPref(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(readToolsPref)
  const set = useCallback((next: boolean) => {
    setOpen(next)
    try { globalThis.localStorage?.setItem(MAP_TOOLS_KEY, next ? 'open' : 'closed') } catch { /* closed next time */ }
  }, [])
  return [open, set]
}

/**
 * The one button a large map shows by default, in MapControls' corner: opens
 * Go to point / Set position, the view switch, the zoom and layer controls and
 * the captions, and puts them away again. Memoized with a stable `onToggle`:
 * MapCanvas re-renders on every telemetry frame.
 */
export const MapToolsToggle = memo(function MapToolsToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t } = useTranslation()
  const label = open ? t('liveops.map.hideTools') : t('liveops.map.showTools')
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={open}
      onClick={onToggle}
      style={{
        ...glass.overlay, border: 'none', boxShadow: 'var(--rh-shadow-sm)',
        position: 'absolute', bottom: 60, right: 12, zIndex: 1000,
        width: 32, height: 32, borderRadius: radius.sm + 1, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: open ? color.selected : glass.overlay.background,
        color: open ? color.accent : color.t1,
      }}
    >
      <SlidersHorizontal size={16} strokeWidth={1.75} />
    </button>
  )
})
