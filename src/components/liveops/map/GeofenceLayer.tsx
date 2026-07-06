import { Polygon } from 'react-leaflet'
import { color } from '@/design-system/tokens'
import { toLatLng } from '@/liveops/mapCoords'
import { geofence } from '@/mocks/mockGeoZones'

export function GeofenceLayer() {
  return (
    <Polygon
      positions={geofence.map((p) => toLatLng(p.x_m, p.y_m))}
      pathOptions={{ color: color.accent, weight: 1.5, fillColor: color.accent, fillOpacity: 0.03, dashArray: '6 4' }}
      interactive={false}
    />
  )
}
