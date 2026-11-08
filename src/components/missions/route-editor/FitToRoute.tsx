import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { toLatLng } from '@/liveops/mapCoords'
import { geofence } from '@/mocks/mockGeoZones'
import type { MissionWaypoint } from '@/types'

/** The extent worth showing in the editor: the site's extent plus every step.
 * The site's extent is a surveyed floor's bounds when there is one, else the
 * mock site boundary. */
export function routeBounds(waypoints: MissionWaypoint[], extent?: L.LatLngBoundsLiteral): L.LatLngBounds {
  return L.latLngBounds([
    ...(extent ?? geofence.map((p) => toLatLng(p.x_m, p.y_m))) as L.LatLngExpression[],
    ...waypoints.map((wp) => toLatLng(wp.x_m, wp.y_m)),
  ] as L.LatLngExpression[])
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
      const p = pad.current
      map.fitBounds(routeBounds(latest.current, ext.current), p
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
