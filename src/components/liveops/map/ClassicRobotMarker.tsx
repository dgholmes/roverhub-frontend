import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Marker, Popup, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import { color } from '@/design-system/tokens'
import { markerRotationDeg, toLatLng } from '@/liveops/mapCoords'
import { stateVisualFor } from '@/liveops/stateDisplay'
import type { RobotState } from '@/types'

/**
 * The original robot marker: a fixed-size circle with an arrow, the same
 * size at every zoom. Brought back as a choice beside RobotMarker's
 * true-scale body, because it has its own charm (user, 2026-11-25) --
 * LiveOps › map › Layers › Robot marker picks between them
 * (liveops/robotMarkerPref).
 *
 * Restored as it was before RobotMarker replaced it, with one thing left
 * out: the true-scale rectangle (the old RobotBodyLayer) that appeared
 * around it once zoomed in. That pairing -- a circle inside an unrelated box
 * -- was what made the old marker confusing, and the body marker is now the
 * way to see the robot at its real size.
 *
 * Always carries the `estimated` badge (dead-reckoning only in MVP,
 * docs/05-ui-ux.md §7.1) and switches to dashed/faded styling when
 * telemetry freshness is stale or missing (§7.2). Non-selected robots
 * (LVO-006) are smaller and dimmer, and clicking one takes focus.
 */
export function ClassicRobotMarker({ robot, selected, onSelect }: { robot: RobotState; selected: boolean; onSelect?: () => void }) {
  const { t } = useTranslation()
  const stale = robot.position.freshness !== 'live'
  const estimatedTitle = t('liveops.position.estimated')
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
            transform:rotate(${markerRotationDeg(robot.position.heading_deg)}deg);">
            <div style="width:0;height:0;margin-top:${selected ? -7 : -4}px;
              border-left:${selected ? 5 : 3}px solid transparent;border-right:${selected ? 5 : 3}px solid transparent;
              border-bottom:${selected ? 10 : 6}px solid ${v.color};"></div>
          </div>
          ${selected ? `<div title="${estimatedTitle}" style="position:absolute;top:-3px;right:-3px;width:9px;height:9px;
            border-radius:50%;background:${color.amber};border:1.5px solid ${color.bg};"></div>` : ''}
        </div>
      `,
    })
  }, [robot.position.heading_deg, v.color, stale, selected, estimatedTitle])

  return (
    <Marker
      position={toLatLng(robot.position.x_m, robot.position.y_m)}
      icon={icon}
      eventHandlers={selected ? undefined : { click: () => onSelect?.() }}
    >
      {selected ? (
        <Popup>
          <strong>{robot.name}</strong><br />
          {v.label} · {stale ? t('liveops.map.stalePosition') : t('liveops.map.estimatedPosition')}
        </Popup>
      ) : (
        <Tooltip>
          <strong>{robot.name}</strong> · {v.label}
        </Tooltip>
      )}
    </Marker>
  )
}
