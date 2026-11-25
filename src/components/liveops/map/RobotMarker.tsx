import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Marker, Popup, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import { bodyRotationDeg, toLatLng } from '@/liveops/mapCoords'
import {
  BEAM_SPREAD_DEG, MIN_BODY_PX, beamCornerPx, beamGradientBox, beamPath, beamReachPx, bodySizePx,
  haloRadiusPx, markerExtentPx, roundedBodyPath,
} from '@/liveops/robotMarkerShape'
import { stateVisualFor } from '@/liveops/stateDisplay'
import type { RobotState } from '@/types'

/** How short the body may be drawn for a robot that is not the selected one.
 * Smaller than MIN_BODY_PX, because these are context, not the thing being
 * driven -- but still a target worth clicking, and no smaller than the
 * classic marker's 16 px for the same robots. */
const OTHER_MIN_BODY_PX = 18

/**
 * Pixels per map metre at the current zoom. CRS.Simple takes metres straight
 * as [y, x], so the distance between (0,0) and (0,1) on screen is the scale.
 *
 * Re-read on `zoom` rather than `zoomend`, so the body grows with the zoom
 * animation instead of snapping at the end of it.
 */
function usePixelsPerMetre(): number {
  const map = useMap()
  const read = () => {
    if (!map?.latLngToLayerPoint) return 0
    const a = map.latLngToLayerPoint([0, 0]), b = map.latLngToLayerPoint([0, 1])
    return Math.abs(b.x - a.x)
  }
  const [ppm, setPpm] = useState(read)
  useEffect(() => {
    const update = () => setPpm(read)
    update()
    map.on?.('zoom', update)
    map.on?.('zoomend', update)
    map.on?.('viewreset', update)
    return () => {
      map.off?.('zoom', update)
      map.off?.('zoomend', update)
      map.off?.('viewreset', update)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map])
  return ppm
}

/**
 * The robot on the map: **one** shape, at the true size of the robot.
 *
 * ⚠️ This used to be three things standing for one robot -- a fixed 28 px
 * circle with an arrow, a true-scale rectangle drawn by a separate
 * RobotBodyLayer, and an amber dot in the circle's corner. Past about
 * 43 px/m the rectangle overtook the circle, so at the default fit the
 * operator was shown a circle inside an unrelated box and a dot nothing
 * explained (user, 2026-11-25). RobotBodyLayer is gone; this is the whole
 * robot.
 *
 * - The body is the real 0.65 x 0.35 m footprint, rounded, drawn in pixels
 *   from the current zoom so it keeps true scale. That is what answers "will
 *   it fit through there" against the walkable layer. It stops shrinking at
 *   MIN_BODY_PX, below which a true-scale robot is a speck on a whole-floor
 *   view.
 * - A soft beam shows which way the front is pointed. It starts at the nose,
 *   not the centre, so no part of it is drawn over the body, and its corners
 *   are slightly rounded. **It is not a measurement** -- not lidar range, not
 *   a camera's field of view.
 * - The amber "estimated" dot is gone. It was always on, so it said nothing.
 *   In its place an uncertainty halo appears **only** when the position is
 *   not live, and then means exactly what it shows.
 *
 * Non-selected robots (LVO-006 shows every site robot) get a smaller, dimmer
 * body with no beam, and stay clickable to take focus.
 */
export function RobotMarker({ robot, selected, onSelect }: { robot: RobotState; selected: boolean; onSelect?: () => void }) {
  const { t } = useTranslation()
  const ppm = usePixelsPerMetre()
  const stale = robot.position.freshness !== 'live'
  const v = stateVisualFor(robot.abstract_state, robot.sdk_state)
  const heading = robot.position.heading_deg

  const icon = useMemo(() => {
    const { lengthPx, widthPx } = bodySizePx(ppm, selected ? MIN_BODY_PX : OTHER_MIN_BODY_PX)
    const beamPx = selected ? beamReachPx(lengthPx) : 0
    const haloPx = stale ? haloRadiusPx(lengthPx) : 0
    const extent = markerExtentPx({ lengthPx, beamPx, haloPx })
    const box = extent * 2
    const rot = bodyRotationDeg(Number.isFinite(heading) ? heading : 0)
    const dash = stale ? ' stroke-dasharray="4 3"' : ''
    const opacity = selected ? 1 : 0.62
    // A gradient per robot: two markers on one map would otherwise share an id.
    const gid = `rh-beam-${robot.robot_id.replace(/[^a-zA-Z0-9_-]/g, '')}`

    const halo = haloPx > 0
      ? `<circle r="${haloPx}" fill="var(--rh-amber)" fill-opacity="0.10"/>`
        + `<circle r="${haloPx}" fill="none" stroke="var(--rh-amber)" stroke-opacity="0.45" stroke-width="1" stroke-dasharray="3 4"/>`
      : ''
    // Pinned to the sharp beam's box (beamGradientBox), so rounding the
    // corners leaves the fade exactly where it was.
    const fade = beamGradientBox(beamPx, BEAM_SPREAD_DEG, lengthPx / 2)
    const beam = beamPx > 0
      ? `<defs><radialGradient id="${gid}" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1"`
        + ` gradientTransform="translate(${fade.cx.toFixed(2)},0) scale(${fade.rx.toFixed(2)},${fade.ry.toFixed(2)})">`
        + `<stop offset="0" stop-color="${v.color}" stop-opacity="0.34"/>`
        + `<stop offset="1" stop-color="${v.color}" stop-opacity="0"/></radialGradient></defs>`
        + `<path d="${beamPath(beamPx, BEAM_SPREAD_DEG, lengthPx / 2, beamCornerPx(lengthPx))}" fill="url(#${gid})"/>`
      : ''
    // Set a little forward of centre, so it reads as the nose rather than as a
    // spine through the middle of the body (user, 2026-11-25).
    const spine = selected && lengthPx >= 26
      ? `<line x1="${(lengthPx * 0.08).toFixed(1)}" y1="0" x2="${(lengthPx * 0.42).toFixed(1)}" y2="0"`
        + ` stroke="${v.color}" stroke-width="1.25" stroke-linecap="round" opacity="0.75"/>`
      : ''

    return L.divIcon({
      className: '',
      iconSize: [box, box],
      iconAnchor: [extent, extent],
      html: `<svg width="${box}" height="${box}" viewBox="${-extent} ${-extent} ${box} ${box}"
          style="overflow:visible;opacity:${opacity};cursor:${selected ? 'default' : 'pointer'}">
          <g transform="rotate(${rot})">
            ${halo}${beam}
            <path d="${roundedBodyPath(lengthPx, widthPx)}" fill="${v.color}" fill-opacity="0.32"
              stroke="${v.color}" stroke-width="${selected ? 1.75 : 1.25}"${dash} stroke-linejoin="round"/>
            ${spine}
          </g>
        </svg>`,
    })
  }, [ppm, heading, v.color, stale, selected, robot.robot_id])

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
