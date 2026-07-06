import { useMemo } from 'react'
import { Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { color } from '@/design-system/tokens'
import { toLatLng } from '@/legacy/liveops-v1/liveops/mapCoords'
import { STATE_DISPLAY } from '@/legacy/liveops-v1/liveops/stateDisplay'
import type { RobotState } from '@/legacy/liveops-v1/types'

/**
 * Robot position marker. Always carries the `estimated` badge (dead-reckoning
 * only in MVP, docs/05-ui-ux.md §7.1) and switches to dashed/faded styling
 * when telemetry freshness is stale or missing (§7.2).
 */
export function RobotMarker({ robot }: { robot: RobotState }) {
  const stale = robot.position.freshness !== 'live'
  const v = STATE_DISPLAY[robot.abstract_state]

  const icon = useMemo(() => {
    const size = 28
    const borderStyle = stale ? 'dashed' : 'solid'
    const opacity = stale ? 0.55 : 1
    return L.divIcon({
      className: '',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      html: `
        <div style="position:relative;width:${size}px;height:${size}px;opacity:${opacity};">
          <div style="position:absolute;inset:0;border-radius:50%;background:${color.card};
            border:2px ${borderStyle} ${v.color};box-shadow:0 0 8px ${v.color}66;"></div>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
            transform:rotate(${robot.position.heading_deg}deg);">
            <div style="width:0;height:0;margin-top:-7px;
              border-left:5px solid transparent;border-right:5px solid transparent;
              border-bottom:10px solid ${v.color};"></div>
          </div>
          <div title="estimated" style="position:absolute;top:-3px;right:-3px;width:9px;height:9px;
            border-radius:50%;background:${color.amber};border:1.5px solid ${color.bg};"></div>
        </div>
      `,
    })
  }, [robot.position.heading_deg, v.color, stale])

  return (
    <Marker position={toLatLng(robot.position.x_m, robot.position.y_m)} icon={icon}>
      <Popup>
        <strong>{robot.name}</strong><br />
        {v.label} · {stale ? 'stale position' : 'estimated position'}
      </Popup>
    </Marker>
  )
}
