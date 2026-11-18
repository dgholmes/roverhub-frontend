import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { fitPoints, type FitPoint } from './fitPoints'
import type { MissionWaypoint } from '@/types'

/**
 * The extent worth showing in the editor: a surveyed floor's bounds when there
 * is one, plus every step. `null` when there is neither, and the caller then
 * leaves the view alone.
 *
 * ⚠️ It used to substitute the mock site's perimeter for a missing extent.
 * See fitPoints.ts for why that is gone.
 */
export function routeBounds(
  waypoints: MissionWaypoint[], extent?: L.LatLngBoundsLiteral,
): L.LatLngBounds | null {
  const points = fitPoints(waypoints, extent as readonly FitPoint[] | undefined)
  return points.length === 0 ? null : L.latLngBounds(points as L.LatLngExpression[])
}

/**
 * Fits the editor map to the site and route, so the route fills the pane
 * rather than sitting small in the middle of the fixed MAP_BOUNDS envelope.
 *
 * It fits on open, and again when the pane changes size, until the operator
 * pans or zooms; after that the view is theirs, and adding a step never moves
 * it. Like LiveOps' FitToSite, it is keyed on identity (`fitKey`, the
 * mission), not on the waypoint list.
 */
export function FitToRoute({ waypoints, fitKey, padding, extent }: {
  waypoints: MissionWaypoint[]
  /** Fit again when this changes: a different mission, map or floor. */
  fitKey: string
  /** What to fit besides the route: a surveyed floor's bounds. Read when fitting. */
  extent?: L.LatLngBoundsLiteral
  /** Pixels kept clear [top-left, bottom-right], for panels floating over the map. */
  padding?: { topLeft: [number, number]; bottomRight: [number, number] }
}) {
  const map = useMap()
  const touched = useRef(false)
  const latest = useRef(waypoints)
  latest.current = waypoints
  const pad = useRef(padding)
  pad.current = padding
  const ext = useRef(extent)
  ext.current = extent

  useEffect(() => {
    touched.current = false
    const fit = () => {
      map.invalidateSize({ animate: false })
      const bounds = routeBounds(latest.current, ext.current)
      // An empty mission on an unsurveyed site: nothing to frame. Leave the
      // view at the container's own bounds rather than framing a guess.
      if (!bounds) return
      const p = pad.current
      map.fitBounds(bounds, p
        ? { paddingTopLeft: p.topLeft, paddingBottomRight: p.bottomRight, animate: false }
        : { padding: [24, 24], animate: false })
    }
    fit()
    // Only a drag or a wheel/pinch zoom by the operator counts; our own
    // fitBounds also fires zoomstart, so listen to the DOM-originated events.
    const mark = () => { touched.current = true }
    map.on('dragstart', mark)
    const el = map.getContainer()
    el.addEventListener('wheel', mark, { passive: true })
    el.addEventListener('touchstart', mark, { passive: true })
    const ro = new ResizeObserver(() => { if (!touched.current) fit() })
    ro.observe(el)
    return () => {
      map.off('dragstart', mark)
      el.removeEventListener('wheel', mark)
      el.removeEventListener('touchstart', mark)
      ro.disconnect()
    }
  }, [map, fitKey])
  return null
}
