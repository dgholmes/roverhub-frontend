import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { fitPoints, type FitPoint } from './fitPoints'
import type { MissionWaypoint } from '@/types'
import type { MapZone } from '@/types/maps'

/**
 * The extent worth showing in the editor: a surveyed floor's bounds when there
 * is one, else the boundary the canvas draws, plus every step. `null` when
 * there is none of those, and the caller then leaves the view alone.
 *
 * ⚠️ It used to substitute the mock perimeter from src/mocks for a missing
 * extent, whatever the canvas drew. See fitPoints.ts.
 */
export function routeBounds(
  waypoints: MissionWaypoint[], extent?: L.LatLngBoundsLiteral, zones?: readonly MapZone[],
): L.LatLngBounds | null {
  const points = fitPoints(waypoints, extent as readonly FitPoint[] | undefined, zones)
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
export function FitToRoute({ waypoints, fitKey, padding, extent, zones }: {
  waypoints: MissionWaypoint[]
  /** Fit again when this changes: a different mission, map or floor. */
  fitKey: string
  /** What to fit besides the route: a surveyed floor's bounds. Read when fitting. */
  extent?: L.LatLngBoundsLiteral
  /** The zones the caller draws, whose geofence is fitted when there is no
   * `extent`. Read when fitting, not a refit trigger. */
  zones?: readonly MapZone[]
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
  const drawn = useRef(zones)
  drawn.current = zones

  useEffect(() => {
    touched.current = false
    const fit = () => {
      map.invalidateSize({ animate: false })
      const p = pad.current
      const bounds = routeBounds(latest.current, ext.current, drawn.current)
      // An empty mission on an unsurveyed site with nothing drawn: nothing to
      // frame. Leave the view at the container's own bounds.
      if (!bounds) return
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
