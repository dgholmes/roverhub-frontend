import { memo, useMemo } from 'react'
import { Marker } from 'react-leaflet'
import L from 'leaflet'
import { color } from '@/design-system/tokens'
import { markerRotationDeg, toLatLng } from '@/liveops/mapCoords'
import type { MapHome } from '@/types/maps'

/** A house on an accent disc, with a tick on its rim pointing the way the robot
 * will face on arrival. Pointer-transparent: the map under it stays tappable. */
function homeIcon(yawRad: number): L.DivIcon {
  const rotate = markerRotationDeg((yawRad * 180) / Math.PI)
  return L.divIcon({
    className: '',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    html: `<div style="position:relative;width:40px;height:40px;pointer-events:none;">
      <div style="position:absolute;inset:0;transform:rotate(${rotate}deg);">
        <div style="position:absolute;left:14px;top:0;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:9px solid ${color.accent};"></div>
      </div>
      <div style="position:absolute;left:9px;top:9px;width:22px;height:22px;border-radius:50%;background:${color.accent};display:flex;align-items:center;justify-content:center;">
        <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" fill="#fff"/></svg>
      </div>
    </div>`,
  })
}

/**
 * Where Return home goes on the floor shown (MapFloor.home, schema 0.0.33):
 * drawn on the Map page and on the LiveOps map. Memoized on the pose, so a
 * telemetry frame does not rebuild its icon.
 */
export const HomeMarker = memo(function HomeMarker({ home }: { home: Pick<MapHome, 'x_m' | 'y_m' | 'yaw_rad'> }) {
  const icon = useMemo(() => homeIcon(home.yaw_rad), [home.yaw_rad])
  return (
    <Marker position={toLatLng(home.x_m, home.y_m)} icon={icon} interactive={false} keyboard={false} />
  )
})
