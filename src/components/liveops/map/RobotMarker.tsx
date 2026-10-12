import { useMemo } from 'react'
import { Marker, Popup, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import { color } from '@/design-system/tokens'
import { toLatLng } from '@/liveops/mapCoords'
import { stateVisualFor } from '@/liveops/stateDisplay'
import type { RobotState } from '@/types'

/**
 * Robot position marker. Always carries the `estimated` badge (dead-reckoning
 * only in MVP, docs/05-ui-ux.md §7.1) and switches to dashed/faded styling
 * when telemetry freshness is stale or missing (§7.2).
 *
 * Shows every site robot on the map, not just the selected one (LVO-006) —
 * `selected` shrinks and dims non-selected markers so the currently-focused
 * robot stays visually dominant, and `onSelect` lets clicking another robot's
 * marker switch focus to it (same selection the rail/selector already share).
 */
export function RobotMarker({ robot, selected, onSelect }: { robot: RobotState; selected: boolean; onSelect?: () => void }) {
  const stale = robot.position.freshness !== 'live'
  const v = stateVisualFor(robot.abstract_state, robot.sdk_state)

  const icon = useMemo(() => {
    const size = selected ? 28 : 16
    const borderStyle = stale ? 'dashed' : 'solid'
    const opacity = stale ? 0.55 : selected ? 1 : 0.7
    return L.divIcon({
      className: '',
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
      html: `
        <div style="position:relative;width:${size}px;height:${size}px;opacity:${opacity};cursor:${selected ? 'default' : 'pointer'};">
          <div style="position:absolute;inset:0;border-radius:50%;background:${color.card};
            border:2px ${borderStyle} ${v.color};${selected ? 'box-shadow:var(--rh-shadow-md);' : ''}"></div>
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
            transform:rotate(${robot.position.heading_deg}deg);">
            <div style="width:0;height:0;margin-top:${selected ? -7 : -4}px;
              border-left:${selected ? 5 : 3}px solid transparent;border-right:${selected ? 5 : 3}px solid transparent;
              border-bottom:${selected ? 10 : 6}px solid ${v.color};"></div>
          </div>
          ${selected ? `<div title="estimated" style="position:absolute;top:-3px;right:-3px;width:9px;height:9px;
            border-radius:50%;background:${color.amber};border:1.5px solid ${color.bg};"></div>` : ''}
        </div>
      `,
    })
  }, [robot.position.heading_deg, v.color, stale, selected])

  return (
    <Marker
      position={toLatLng(robot.position.x_m, robot.position.y_m)}
      icon={icon}
      eventHandlers={selected ? undefined : { click: () => onSelect?.() }}
    >
      {selected ? (
        <Popup>
          <strong>{robot.name}</strong><br />
          {v.label} · {stale ? 'stale position' : 'estimated position'}
        </Popup>
      ) : (
        <Tooltip>
          <strong>{robot.name}</strong> · {v.label}
        </Tooltip>
      )}
    </Marker>
  )
}
