import { CircleMarker, Marker, Polyline, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import { dist } from '@/missions/geometry'
import { color } from '@/design-system/tokens'
import { toLatLng } from '@/liveops/mapCoords'
import type { MissionWaypoint } from '@/types'

/** A small label at the middle of each leg giving its length, so the map
 * answers "how far apart are these" without hovering. */
function legLabel(metres: number): L.DivIcon {
  const text = metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`
  return L.divIcon({
    className: 'rh-leg-label',
    html: `<span>${text}</span>`,
    iconSize: [0, 0],
  })
}

export function EditableRouteLayer({
  waypoints, selectedId, onSelect, flagged = {}, notes = {},
}: {
  waypoints: MissionWaypoint[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** Waypoints with a problem, coloured by the worst one. */
  flagged?: Record<string, 'error' | 'warning'>
  /** A line of explanation under a waypoint's name, by waypoint id. */
  notes?: Record<string, string>
}) {
  const points = waypoints.map((wp) => toLatLng(wp.x_m, wp.y_m))

  return (
    <>
      {points.length > 1 && (
        <Polyline positions={points} pathOptions={{ color: color.accent, weight: 2, opacity: 0.6, dashArray: '4 6' }} />
      )}
      {waypoints.slice(1).map((wp, i) => {
        const prev = waypoints[i]
        const m = dist(prev, wp)
        if (m < 2) return null
        return (
          <Marker
            key={`leg-${prev.waypoint_id}-${wp.waypoint_id}`}
            position={toLatLng((prev.x_m + wp.x_m) / 2, (prev.y_m + wp.y_m) / 2)}
            icon={legLabel(m)} interactive={false} keyboard={false}
          />
        )
      })}
      {waypoints.map((wp, i) => {
        const selected = wp.waypoint_id === selectedId
        const flag = flagged[wp.waypoint_id]
        const ring = flag === 'error' ? color.red : flag === 'warning' ? color.amber : selected ? color.accent : color.t2
        return (
          <CircleMarker
            key={wp.waypoint_id}
            center={toLatLng(wp.x_m, wp.y_m)}
            radius={selected ? 8 : 6}
            eventHandlers={{ click: (e) => { e.originalEvent.stopPropagation(); onSelect(wp.waypoint_id) } }}
            pathOptions={{
              color: ring,
              weight: selected || flag ? 2 : 1,
              fillColor: selected ? color.accent : color.card,
              fillOpacity: 0.9,
            }}
          >
            <Tooltip direction="top" offset={[0, -8]} permanent={selected}>
              {`${i + 1}. ${wp.label}`}
              {notes[wp.waypoint_id] && <><br />{notes[wp.waypoint_id]}</>}
            </Tooltip>
          </CircleMarker>
        )
      })}
    </>
  )
}
