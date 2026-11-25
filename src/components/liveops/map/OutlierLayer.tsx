import { memo, useEffect, useMemo, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { color } from '@/design-system/tokens'
import { GRID_WALKABLE, type SceneData } from '@/scene3d/types'

/** Its own pane: above the overlay pane's zones, route and robot body (400),
 * below the live scan (450) and the markers (600), and never in the way of a
 * tap — these are points of interest, not things to click. */
const OUTLIER_PANE = 'rh-outliers'
const OUTLIER_PANE_Z = '440'
const DOT_RADIUS_PX = 2.5

/** How far outside the walkable region a point has to be before it is a stray
 * rather than the floor beside a wall. */
export const OUTLIER_MARGIN_M = 2

/** The most dots drawn at once. The cloud sample runs to ~200k points and the
 * canvas renderer would survive that, but a map that has gone wrong can turn
 * most of it into strays, and an amber fog over the floorplan tells the
 * operator less than a few hundred dots do. The cloud is shuffled when it is
 * built (`SceneCloud.xyh`), so a prefix is a uniform sample of it. */
export const MAX_OUTLIER_DOTS = 2000

/**
 * The cloud points that fell well outside the walkable region, as flat `x, y`
 * pairs in map metres — two floats per point, in cloud order.
 *
 * Why these matter: a survey's grid rectangle is stretched by points the grid
 * builder later dropped, and the operator sees the result as a building pushed
 * into one corner of a mostly black pane. The strays that stretched the active
 * map are gone from every stored file, but the ones a *fresh* survey keeps are
 * still in its cloud, and this is what shows them.
 *
 * The test is deliberately **conservative**: it reports a point only when no
 * walkable cell can be within `marginM` of it, never the other way round, so
 * nothing honest gets painted amber. It works on a coarse summary of the grid
 * — one flag per `marginM`-sized block of cells, set when any cell in the block
 * is walkable — and asks whether the point's own block or any of its eight
 * neighbours holds one. A block is `marginM` across, so an empty 3x3
 * neighbourhood puts every walkable cell at least `marginM` away; the cost is
 * that a stray between one and three margins out reads as near enough. That
 * buys O(cells + points) instead of a distance transform or a per-point scan,
 * which matters because this runs over a 200k-point cloud.
 *
 * A grid with no walkable cells at all — a map with no planning grid — has no
 * region for a point to be outside of, so nothing is a stray. Without that
 * guard such a map would paint its entire cloud amber.
 */
export function outlierPoints(data: SceneData, marginM: number = OUTLIER_MARGIN_M): Float32Array {
  const cloud = data.cloud
  if (!cloud || cloud.count <= 0) return new Float32Array(0)

  const { w, h, res, origin, bits } = data.grid
  if (w <= 0 || h <= 0) return new Float32Array(0)

  // Block size in cells, at least one, so a margin under one cell still works.
  const block = Math.max(1, Math.ceil(marginM / res))
  const bw = Math.ceil(w / block)
  const bh = Math.ceil(h / block)
  const near = new Uint8Array(bw * bh)
  let walkable = 0
  for (let y = 0; y < h; y++) {
    const by = Math.floor(y / block) * bw
    const row = y * w
    for (let x = 0; x < w; x++) {
      if ((bits[row + x] & GRID_WALKABLE) !== 0) {
        near[by + Math.floor(x / block)] = 1
        walkable++
      }
    }
  }
  if (walkable === 0) return new Float32Array(0)

  const out = new Float32Array(cloud.count * 2)
  let n = 0
  for (let i = 0; i < cloud.count; i++) {
    const x = cloud.xyh[i * 3]
    const y = cloud.xyh[i * 3 + 1]
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue
    const bx = Math.floor((x - origin[0]) / res / block)
    const by = Math.floor((y - origin[1]) / res / block)
    let close = false
    for (let dy = -1; dy <= 1 && !close; dy++) {
      const ny = by + dy
      if (ny < 0 || ny >= bh) continue
      for (let dx = -1; dx <= 1; dx++) {
        const nx = bx + dx
        if (nx < 0 || nx >= bw) continue
        if (near[ny * bw + nx] === 1) { close = true; break }
      }
    }
    if (close) continue
    out[n * 2] = x
    out[n * 2 + 1] = y
    n++
  }
  // A copy, not a view: a view would hold the whole cloud-sized buffer alive
  // to carry the handful of points that survived it.
  return out.slice(0, n * 2)
}

/**
 * The strays, in amber, over the map.
 *
 * Built like ScanLayer, for the same reasons: its own pane so it sits above the
 * zones and below the markers, a canvas renderer because a couple of thousand
 * SVG circles would not be free, no pointer events, and everything taken away
 * again on unmount.
 *
 * On a map whose strays were already dropped this draws nothing, and on a clean
 * survey it will draw nothing either. That is the honest answer and the layer
 * does not dress it up — an empty amber layer means there is nothing out there,
 * which is what the operator wanted to know.
 *
 * Memoized, and the search memoized inside it on `data`: MapCanvas re-renders
 * on every telemetry frame and the scene data does not change with one.
 */
export const OutlierLayer = memo(function OutlierLayer({ data, marginM = OUTLIER_MARGIN_M }: {
  data: SceneData
  /** How far outside the walkable region counts as a stray. */
  marginM?: number
}) {
  const map = useMap()
  const points = useMemo(() => outlierPoints(data, marginM), [data, marginM])
  const layer = useRef<{ group: L.LayerGroup; renderer: L.Canvas; pane: HTMLElement } | null>(null)

  useEffect(() => {
    const pane = map.getPane(OUTLIER_PANE) ?? map.createPane(OUTLIER_PANE)
    pane.style.zIndex = OUTLIER_PANE_Z
    pane.style.pointerEvents = 'none'
    const renderer = L.canvas({ pane: OUTLIER_PANE })
    const group = L.layerGroup().addTo(map)
    layer.current = { group, renderer, pane }
    return () => {
      group.remove()
      renderer.remove()
      layer.current = null
    }
  }, [map])

  useEffect(() => {
    const l = layer.current
    if (!l) return
    l.group.clearLayers()
    const drawn = Math.min(points.length / 2, MAX_OUTLIER_DOTS)
    for (let i = 0; i < drawn; i++) {
      // Leaflet takes [y, x]; the cloud is x, y.
      L.circleMarker([points[i * 2 + 1], points[i * 2]], {
        renderer: l.renderer, pane: OUTLIER_PANE, radius: DOT_RADIUS_PX, stroke: false,
        fillColor: color.amber, fillOpacity: 0.85, interactive: false,
      }).addTo(l.group)
    }
  }, [points])

  return null
})
