import { Marker, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import { color } from '@/design-system/tokens'
import { toLatLng } from '@/legacy/liveops-v1/liveops/mapCoords'
import { annotations } from '@/legacy/liveops-v1/mocks/mockGeoZones'

const pinIcon = L.divIcon({
  className: '',
  iconSize: [16, 16],
  iconAnchor: [8, 16],
  html: `<div style="width:0;height:0;border-left:8px solid transparent;border-right:8px solid transparent;
    border-top:16px solid ${color.amber};filter:drop-shadow(0 0 3px rgba(255,159,10,0.6));"></div>`,
})

/** Operator-placed field annotations (e.g. hazard notes). Read-only pins for
 * Phase 1 — authoring UI is future scope. */
export function AnnotationLayer() {
  return (
    <>
      {annotations.map((a) => (
        <Marker key={a.id} position={toLatLng(a.x_m, a.y_m)} icon={pinIcon}>
          <Tooltip>{a.note}</Tooltip>
        </Marker>
      ))}
    </>
  )
}
