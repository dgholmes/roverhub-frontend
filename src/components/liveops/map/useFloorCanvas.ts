import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { LatLngBoundsLiteral } from 'leaflet'
import { paintFloor } from '@/scene3d/paintFloor'
import { resolveScenePalette } from '@/scene3d/palette'
import type { ScenePalette, SceneGrid } from '@/scene3d/types'

/** The <html> attributes the scene palette depends on: the theme picks the
 * colours, the accent tints the walkable cells. */
const THEME_ATTRIBUTES = ['data-theme', 'data-accent']

/** Image pixels per grid cell. Painted cell for cell and then scaled up without
 * smoothing, so the browser's own (smoothed) scaling at any zoom keeps each
 * cell square and its edges sharp. One pixel per cell, pixelated, came out
 * uneven at Leaflet's fractional zooms (user, 2026-11-12: "the quality of the
 * current map is terrible"). */
export const FLOOR_UPSCALE = 4
/** Cells kept around the surveyed content when the image is cropped to it. */
const CROP_MARGIN = 4

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

/** The cells to paint: the grid's surveyed content plus a margin, clamped to
 * the grid. A survey's grid is mostly empty around the building, and cropping
 * to it is what lets the image be painted large. Exported for tests. */
export function cropCells(grid: SceneGrid): { minX: number; minY: number; maxX: number; maxY: number } {
  const c = grid.content
  return {
    minX: Math.max(0, c.minX - CROP_MARGIN), minY: Math.max(0, c.minY - CROP_MARGIN),
    maxX: Math.min(grid.w - 1, c.maxX + CROP_MARGIN), maxY: Math.min(grid.h - 1, c.maxY + CROP_MARGIN),
  }
}

/** The map metres a crop covers, as overlay bounds ([y, x] corners). */
export function cropBounds(grid: SceneGrid, crop: ReturnType<typeof cropCells>): LatLngBoundsLiteral {
  const [x0, y0] = grid.origin
  return [
    [y0 + crop.minY * grid.res, x0 + crop.minX * grid.res],
    [y0 + (crop.maxY + 1) * grid.res, x0 + (crop.maxX + 1) * grid.res],
  ]
}

export interface PaintedFloor {
  url: string
  bounds: LatLngBoundsLiteral
}

/**
 * Paint the floor grid, crop it to the surveyed content and scale it up
 * FLOOR_UPSCALE times without smoothing, and hand it back as an object URL the
 * caller owns and must revoke, with the bounds it covers. Null when nothing
 * could be painted: no 2D context (jsdom, a lost context) or an encoder that
 * gave no blob. The PNG is encoded off the main thread by `toBlob`.
 */
export function paintFloorToUrl(
  grid: SceneGrid, palette: ScenePalette, showWalkable = true,
): Promise<PaintedFloor | null> {
  if (typeof document === 'undefined') return Promise.resolve(null)
  const cells = document.createElement('canvas')
  if (!cells.getContext('2d')) return Promise.resolve(null)
  paintFloor(grid, palette, cells, { showWalkable })
  const crop = cropCells(grid)
  const cw = crop.maxX - crop.minX + 1, ch = crop.maxY - crop.minY + 1
  const big = document.createElement('canvas')
  big.width = cw * FLOOR_UPSCALE
  big.height = ch * FLOOR_UPSCALE
  const ctx = big.getContext('2d')
  if (!ctx) return Promise.resolve(null)
  ctx.imageSmoothingEnabled = false
  // The painted canvas is north-up: cell row j is pixel row h-1-j.
  ctx.drawImage(cells, crop.minX, grid.h - 1 - crop.maxY, cw, ch, 0, 0, big.width, big.height)
  const bounds = cropBounds(grid, crop)
  return new Promise((resolve) => {
    try {
      big.toBlob((blob) => resolve(blob ? { url: URL.createObjectURL(blob), bounds } : null), 'image/png')
    } catch {
      resolve(null)
    }
  })
}

/**
 * The floor grid painted in the scene's colours, as an image URL and bounds
 * for a Leaflet overlay; null until it is painted, and whenever it cannot be.
 *
 * Painted once per grid, theme and walkable tint, never per render: MapCanvas
 * re-renders on every telemetry frame, and a new URL would make Leaflet reload
 * the image each time. On a theme change the old image stays up until the new
 * one is ready, so the floor never blinks out; on a new grid the old one is not
 * shown, since it is another floor's. Each URL is revoked when it is replaced
 * or the caller unmounts.
 */
export function usePaintedFloorUrl(grid: SceneGrid | null, showWalkable = true): PaintedFloor | null {
  const theme = useThemeStamp()
  const [painted, setPainted] = useState<{ grid: SceneGrid; floor: PaintedFloor } | null>(null)
  const held = useRef<string | null>(null)

  useEffect(() => {
    if (!grid) return
    let current = true
    // Resolved here, after the attribute changed, so the computed style is the new theme's.
    void paintFloorToUrl(grid, resolveScenePalette(), showWalkable).then((floor) => {
      if (!current) {
        if (floor) URL.revokeObjectURL(floor.url)
        return
      }
      const previous = held.current
      held.current = floor?.url ?? null
      setPainted(floor ? { grid, floor } : null)
      if (previous) URL.revokeObjectURL(previous)
    })
    return () => { current = false }
  }, [grid, theme, showWalkable])

  useEffect(() => () => {
    if (held.current) URL.revokeObjectURL(held.current)
    held.current = null
  }, [])

  return painted && painted.grid === grid ? painted.floor : null
}
