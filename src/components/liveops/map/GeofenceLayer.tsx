import { memo } from 'react'
import { Polygon } from 'react-leaflet'
import { color } from '@/design-system/tokens'
import { toLatLng } from '@/liveops/mapCoords'
import { geofence } from '@/mocks/mockGeoZones'

// Static: nothing it draws changes per telemetry frame (see GridLayer).
export const GeofenceLayer = memo(function GeofenceLayer() {
  return (
    <Polygon
      positions={geofence.map((p) => toLatLng(p.x_m, p.y_m))}
      pathOptions={{ color: color.t3, weight: 1.5, fillColor: color.mapZone, fillOpacity: 0.5, dashArray: '6 4' }}
      interactive={false}
    />
  )
})
