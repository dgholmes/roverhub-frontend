import { CircleMarker, Polyline, Tooltip } from 'react-leaflet'
import { color } from '@/design-system/tokens'
import { toLatLng } from '@/liveops/mapCoords'
import type { Mission } from '@/types'

export function RouteLayer({ mission }: { mission: Mission }) {
  const points = mission.waypoints.map((wp) => toLatLng(wp.x_m, wp.y_m))
  const doneCount = mission.waypoints.filter((wp) => wp.status === 'done').length
  const completed = points.slice(0, doneCount + 1)
  const remaining = points.slice(doneCount)

  return (
    <>
      {completed.length > 1 && (
        <Polyline positions={completed} pathOptions={{ color: color.accent, weight: 2, opacity: 0.9 }} />
      )}
      {remaining.length > 1 && (
        <Polyline positions={remaining} pathOptions={{ color: color.accent, weight: 2, opacity: 0.3, dashArray: '4 6' }} />
      )}
      {mission.waypoints.map((wp, i) => (
        <CircleMarker
          key={wp.id}
          center={toLatLng(wp.x_m, wp.y_m)}
          radius={wp.status === 'active' ? 6 : 4}
          pathOptions={{
            color: wp.status === 'pending' ? color.t3 : color.accent,
            weight: wp.status === 'active' ? 2 : 1,
            fillColor: color.accent,
            fillOpacity: wp.status === 'pending' ? 0.15 : 0.9,
          }}
        >
          <Tooltip direction="top" offset={[0, -6]}>{`${i + 1}. ${wp.label}`}</Tooltip>
        </CircleMarker>
      ))}
    </>
  )
}
