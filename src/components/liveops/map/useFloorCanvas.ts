import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { paintFloor } from '@/scene3d/paintFloor'
import { resolveScenePalette } from '@/scene3d/palette'
import type { ScenePalette, SceneGrid } from '@/scene3d/types'

/** The <html> attributes the scene palette depends on: the theme picks the
 * colours, the accent tints the walkable cells. */
const THEME_ATTRIBUTES = ['data-theme', 'data-accent']

function subscribeTheme(onChange: () => void): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return () => {}
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: THEME_ATTRIBUTES })
  return () => observer.disconnect()
}

function themeSnapshot(): string {
  const root = document.documentElement
  return THEME_ATTRIBUTES.map((a) => root.getAttribute(a) ?? '').join('|')
}

/** Changes whenever the theme or accent on <html> does (theme.ts sets both).
 * Watched the way CloudViewer3D watches it, with a MutationObserver. */
export function useThemeStamp(): string {
  return useSyncExternalStore(subscribeTheme, themeSnapshot, () => '')
}

/**
 * Paint the floor grid into a fresh canvas and hand it back as an object URL,
 * which the caller owns and must revoke. Null when nothing could be painted: no
 * 2D context (jsdom, a lost context) or an encoder that gave no blob. The
 * PNG is encoded off the main thread by `toBlob`, unlike `toDataURL`, which
 * would block for tens of milliseconds on a full floor.
 */
export function paintFloorToUrl(grid: SceneGrid, palette: ScenePalette): Promise<string | null> {
  if (typeof document === 'undefined') return Promise.resolve(null)
  const canvas = document.createElement('canvas')
  if (!canvas.getContext('2d')) return Promise.resolve(null)
  paintFloor(grid, palette, canvas)
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null), 'image/png')
    } catch {
      resolve(null)
    }
  })
}

/**
 * The floor grid painted in the scene's colours, as an image URL for a Leaflet
 * overlay; null until it is painted, and whenever it cannot be.
 *
 * Painted once per grid and theme, never per render: MapCanvas re-renders on
 * every telemetry frame, and a new URL would make Leaflet reload the image each
 * time. On a theme change the old image stays up until the new one is ready, so
 * the floor never blinks out; on a new grid the old one is not shown, since it
 * is another floor's. Each URL is revoked when it is replaced or the caller
 * unmounts.
 */
export function usePaintedFloorUrl(grid: SceneGrid | null): string | null {
  const theme = useThemeStamp()
  const [painted, setPainted] = useState<{ grid: SceneGrid; url: string } | null>(null)
  const held = useRef<string | null>(null)

  useEffect(() => {
    if (!grid) return
    let current = true
    // Resolved here, after the attribute changed, so the computed style is the new theme's.
    void paintFloorToUrl(grid, resolveScenePalette()).then((url) => {
      if (!current) {
        if (url) URL.revokeObjectURL(url)
        return
      }
      const previous = held.current
      held.current = url
      setPainted(url ? { grid, url } : null)
      if (previous) URL.revokeObjectURL(previous)
    })
    return () => { current = false }
  }, [grid, theme])

  useEffect(() => () => {
    if (held.current) URL.revokeObjectURL(held.current)
    held.current = null
  }, [])

  return painted && painted.grid === grid ? painted.url : null
}
