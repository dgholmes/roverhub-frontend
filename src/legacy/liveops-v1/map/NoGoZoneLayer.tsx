import { Polygon, Tooltip } from 'react-leaflet'
import { color } from '@/design-system/tokens'
import { toLatLng } from '@/legacy/liveops-v1/liveops/mapCoords'
import { noGoZones } from '@/legacy/liveops-v1/mocks/mockGeoZones'

export function NoGoZoneLayer() {
  return (
    <>
      {noGoZones.map((zone) => (
        <Polygon
          key={zone.id}
          positions={zone.points.map((p) => toLatLng(p.x_m, p.y_m))}
          pathOptions={{ color: color.red, weight: 1.5, fillColor: color.red, fillOpacity: 0.12 }}
        >
          <Tooltip sticky>{zone.label}</Tooltip>
        </Polygon>
      ))}
    </>
  )
}
