import { Crosshair, Maximize } from 'lucide-react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { color, glass, radius } from '@/design-system/tokens'
import { toLatLng } from '@/liveops/mapCoords'
import type { Mission, RobotState } from '@/types'

const ctrlBtnStyle: React.CSSProperties = {
  ...glass.overlay,
  width: 30, height: 30, borderRadius: radius.sm,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: color.t2, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.09)',
}

/** Map is never obscured by panels without operator action (docs/05-ui-ux.md
 * §18.6) — these controls are the operator action that moves the viewport. */
export function MapControls({
  robot, mission, bounds,
}: {
  robot: RobotState
  mission?: Mission
  bounds: L.LatLngBoundsLiteral
}) {
  const map = useMap()

  return (
    // top offset clears HeroView's REC indicator, which occupies the same
    // top-right corner when the map is the hero view (docs request: sensor
    // overlays stay on top regardless of which view — camera or map — is dominant)
    <div style={{ position: 'absolute', top: 56, right: 12, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button
        title="Center on robot"
        aria-label="Center on robot"
        onClick={() => map.panTo(toLatLng(robot.position.x_m, robot.position.y_m))}
        style={ctrlBtnStyle}
      >
        <Crosshair size={14} strokeWidth={1.8} />
      </button>
      <button
        title="Fit mission"
        aria-label="Fit mission route"
        onClick={() => {
          if (!mission) return map.fitBounds(bounds, { padding: [20, 20] })
          const pts = mission.waypoints.map((wp) => toLatLng(wp.x_m, wp.y_m))
          map.fitBounds(L.latLngBounds(pts), { padding: [40, 40] })
        }}
        style={ctrlBtnStyle}
      >
        <Maximize size={14} strokeWidth={1.8} />
      </button>
    </div>
  )
}
