import { CircleMarker, Polyline, Tooltip } from 'react-leaflet'
import { color } from '@/design-system/tokens'
import { toLatLng } from '@/liveops/mapCoords'
import type { MissionWaypoint } from '@/types'

export function EditableRouteLayer({
  waypoints, selectedId, onSelect, flagged = {},
}: {
  waypoints: MissionWaypoint[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** Waypoints with a problem, coloured by the worst one. */
  flagged?: Record<string, 'error' | 'warning'>
}) {
  const points = waypoints.map((wp) => toLatLng(wp.x_m, wp.y_m))

  return (
    <>
      {points.length > 1 && (
        <Polyline positions={points} pathOptions={{ color: color.accent, weight: 2, opacity: 0.6, dashArray: '4 6' }} />
      )}
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
            <Tooltip direction="top" offset={[0, -8]} permanent={selected}>{`${i + 1}. ${wp.label}`}</Tooltip>
          </CircleMarker>
        )
      })}
    </>
  )
}
