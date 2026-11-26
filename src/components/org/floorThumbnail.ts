import { useEffect, useRef, useState, type RefObject } from 'react'
import type { LatLngBoundsLiteral } from 'leaflet'
import { paintFloorToUrl, useThemeStamp, type PaintedFloor } from '@/components/liveops/map/useFloorCanvas'
import { resolveScenePalette } from '@/scene3d/palette'
import { loadGrid } from '@/missions/useFloorGrids'
import { buildSceneGrid } from '@/scene3d/sceneData'
import type { SceneGrid } from '@/scene3d/types'

/**
 * The painting core of a small floor thumbnail, shared by Org › Sites'
 * `SiteMapThumbnail` (a site's live map) and the Map page's version list
 * (`MapVersionThumbnail`, an archived version's files). Both read a floor's
 * occupancy grid through `loadGrid` (one decode per key for the session) and
 * paint it with LiveOps' `paintFloorToUrl`: scene palette, cropped to the
 * surveyed content, repainted when the theme changes.
 */

/** What a thumbnail needs of a floor: where its grid lies in the map frame. */
export interface FloorFrame {
  size_cells: [number, number]
  resolution_m: number
  origin_xy_m: [number, number]
}

/** A floor's grid in the map frame, metres: lower-left corner and size. */
export function floorBox(floor: FloorFrame) {
  const [x0, y0] = floor.origin_xy_m
  return { x0, y0, w: floor.size_cells[0] * floor.resolution_m, h: floor.size_cells[1] * floor.resolution_m }
}

/** A box in map metres. */
export interface MetreBox { xLo: number; yLo: number; xHi: number; yHi: number }
/** From Leaflet-style `[[yLo, xLo], [yHi, xHi]]` bounds. */
export const fromBounds = (b: LatLngBoundsLiteral): MetreBox => ({ yLo: b[0][0], xLo: b[0][1], yHi: b[1][0], xHi: b[1][1] })
/** As an SVG viewBox with y flipped, so north is up. */
export const viewBoxOf = (b: MetreBox) => `${b.xLo} ${-b.yHi} ${b.xHi - b.xLo} ${b.yHi - b.yLo}`

/** Where a floor's grid is and the cache key it is decoded under. */
export interface GridRequest { url: string; key: string }

/**
 * A floor's occupancy grid as a SceneGrid. Only the grid: no planning grid
 * and no point cloud, which a thumbnail does not need. `failed` once it cannot
 * be had -- no request (mock mode stores no files), or the fetch failed.
 * While `enabled` is false nothing is fetched and it reads as still waiting:
 * the version list holds a row's grid back until the row is on screen.
 */
export function useThumbnailGrid(req: GridRequest | null, floor: FloorFrame | null, enabled = true): { grid: SceneGrid | null; failed: boolean } {
  const key = req?.key ?? null
  const [loaded, setLoaded] = useState<{ key: string; grid: SceneGrid | null } | null>(null)
  useEffect(() => {
    if (!req || !floor || !enabled) return
    let current = true
    void loadGrid(req.url, req.key).then((pixels) => {
      if (!current) return
      setLoaded({
        key: req.key,
        grid: pixels ? buildSceneGrid(pixels, null, floor.resolution_m, [floor.origin_xy_m[0], floor.origin_xy_m[1]]) : null,
      })
    })
    return () => { current = false }
    // `req` and `floor` are covered by `key`: map, version or update time, and floor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled])
  if (!req) return { grid: null, failed: true }
  if (loaded?.key !== key) return { grid: null, failed: false }
  return { grid: loaded.grid, failed: loaded.grid === null }
}

/**
 * The grid painted by `paintFloorToUrl` (LiveOps' painter: scene palette,
 * cropped to the content plus a few cells), repainted when the theme changes.
 * Like `usePaintedFloorUrl`, but it also says when painting failed (no 2D
 * canvas, no blob), so the thumbnail can fall back instead of waiting. Each
 * object URL is revoked when it is replaced, when the grid goes, and on
 * unmount.
 */
export function usePaintedThumbnail(grid: SceneGrid | null): { floor: PaintedFloor | null; failed: boolean } {
  const theme = useThemeStamp()
  const [state, setState] = useState<{ grid: SceneGrid; floor: PaintedFloor | null } | null>(null)
  const held = useRef<string | null>(null)
  useEffect(() => {
    if (!grid) return
    let current = true
    void paintFloorToUrl(grid, resolveScenePalette(), false).then((floor) => {
      if (!current) {
        if (floor) URL.revokeObjectURL(floor.url)
        return
      }
      const previous = held.current
      held.current = floor?.url ?? null
      setState({ grid, floor })
      if (previous) URL.revokeObjectURL(previous)
    })
    return () => { current = false }
  }, [grid, theme])
  useEffect(() => () => {
    if (held.current) URL.revokeObjectURL(held.current)
    held.current = null
  }, [])
  if (!grid || state?.grid !== grid) return { floor: null, failed: false }
  return { floor: state.floor, failed: state.floor === null }
}

/**
 * True once the element has come within `margin` of the screen, and from then
 * on: a thumbnail that has loaded is not dropped when it scrolls away. Where
 * there is no IntersectionObserver (jsdom, very old browsers) everything counts
 * as on screen, so nothing is ever left unloaded.
 */
export function useSeenOnce(ref: RefObject<Element | null>, margin = '120px'): boolean {
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined')
  useEffect(() => {
    if (seen) return
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        setSeen(true)
        observer.disconnect()
      }
    }, { rootMargin: margin })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, margin, seen])
  return seen
}
