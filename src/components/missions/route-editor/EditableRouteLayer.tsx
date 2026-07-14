import { CircleMarker, Polyline, Tooltip } from 'react-leaflet'
import { color } from '@/design-system/tokens'
import { toLatLng } from '@/liveops/mapCoords'
import type { MissionWaypoint } from '@/types'

export function EditableRouteLayer({
  waypoints, selectedId, onSelect,
}: {
  waypoints: MissionWaypoint[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const points = waypoints.map((wp) => toLatLng(wp.x_m, wp.y_m))

  return (
    <>
      {points.length > 1 && (
        <Polyline positions={points} pathOptions={{ color: color.accent, weight: 2, opacity: 0.6, dashArray: '4 6' }} />
      )}
      {waypoints.map((wp, i) => {
        const selected = wp.id === selectedId
        return (
          <CircleMarker
            key={wp.id}
            center={toLatLng(wp.x_m, wp.y_m)}
            radius={selected ? 8 : 6}
            eventHandlers={{ click: (e) => { e.originalEvent.stopPropagation(); onSelect(wp.id) } }}
            pathOptions={{
              color: selected ? color.accent : color.t2,
              weight: selected ? 2 : 1,
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
