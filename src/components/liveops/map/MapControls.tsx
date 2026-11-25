import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Crosshair, Layers, Maximize } from 'lucide-react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { color, font, glass, radius, space } from '@/design-system/tokens'
import { toLatLng } from '@/liveops/mapCoords'
import { useRobotMarkerStyle, type RobotMarkerStyle } from '@/liveops/robotMarkerPref'
import type { Mission, RobotState } from '@/types'
import type { MapLayerVisibility } from './MapCanvas'

const ctrlBtnStyle: React.CSSProperties = {
  ...glass.overlay,
  width: 32, height: 32, borderRadius: radius.sm + 1,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: color.t1, cursor: 'pointer', boxShadow: 'var(--rh-shadow-sm)',
}

const LAYER_LABELS = [
  { key: 'geofence', labelKey: 'liveops.map.layerGeofence' },
  { key: 'noGoZones', labelKey: 'liveops.map.layerNoGo' },
  { key: 'annotations', labelKey: 'liveops.map.layerAnnotations' },
  { key: 'otherRobots', labelKey: 'liveops.map.layerOtherRobots' },
] as const satisfies readonly { key: keyof MapLayerVisibility; labelKey: string }[]

/** On a surveyed floor only: what the planning grid says, and what the lidar
 * sees now. Remembered per browser (liveops/mapLayerPrefs). */
const SURVEY_LAYER_LABELS = [
  { key: 'walkable', labelKey: 'liveops.map.layerWalkable' },
  { key: 'lidar', labelKey: 'liveops.map.layerLidar' },
  // Asked once per map, while deciding whether it wants trimming, so both
  // start off (liveops/mapLayerPrefs).
  { key: 'unsurveyed', labelKey: 'liveops.map.layerUnsurveyed' },
  { key: 'outliers', labelKey: 'liveops.map.layerOutliers' },
] as const satisfies readonly { key: keyof MapLayerVisibility; labelKey: string }[]

/** Map is never obscured by panels without operator action (docs/05-ui-ux.md
 * §18.6) — these controls are the operator action that moves the viewport. */
export function MapControls({
  robot, mission, bounds, layers, onToggleLayer, surveyLayers = false, bottom = 60, onRecentre, onMenuOpenChange,
}: {
  robot: RobotState
  mission?: Mission
  bounds: L.LatLngBoundsLiteral
  layers: MapLayerVisibility
  onToggleLayer: (key: keyof MapLayerVisibility) => void
  /** Resume following the robot, which a drag or a zoom pauses. */
  onRecentre?: () => void
  /** Offer Walkable area and Live lidar: the map is showing a surveyed floor. */
  surveyLayers?: boolean
  /** Distance from the map's bottom edge, clear of what sits under it. */
  bottom?: number
  /** Told when the layers menu opens or closes, so what sits above the
   * column can make way for it. */
  onMenuOpenChange?: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const map = useMap()
  const [layersOpen, setLayersOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => { onMenuOpenChange?.(layersOpen) }, [layersOpen, onMenuOpenChange])

  useEffect(() => {
    if (!layersOpen) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setLayersOpen(false)
    }
    window.addEventListener('mousedown', onClickOutside)
    return () => window.removeEventListener('mousedown', onClickOutside)
  }, [layersOpen])

  return (
    // Bottom-right, stacked above the Quick Actions button: top-left is
    // telemetry and top-right is the camera (dock or controls) in every view.
    <div style={{ position: 'absolute', bottom, right: 12, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button
        title={t('liveops.map.centerOnRobot')}
        aria-label={t('liveops.map.centerOnRobot')}
        onClick={() => {
          map.panTo(toLatLng(robot.position.x_m, robot.position.y_m))
          // Also the way back into following after a drag paused it: this is
          // already the "put the robot back in the middle" button, so it would
          // be strange for it to centre the robot once and then let it walk
          // off again while a run is in progress.
          onRecentre?.()
        }}
        style={ctrlBtnStyle}
      >
        <Crosshair size={16} strokeWidth={1.75} />
      </button>
      <button
        title={t('liveops.map.fitMission')}
        aria-label={t('liveops.map.fitMissionAria')}
        onClick={() => {
          if (!mission) return map.fitBounds(bounds, { padding: [20, 20] })
          const pts = mission.waypoints.map((wp) => toLatLng(wp.x_m, wp.y_m))
          map.fitBounds(L.latLngBounds(pts), { padding: [40, 40] })
        }}
        style={ctrlBtnStyle}
      >
        <Maximize size={16} strokeWidth={1.75} />
      </button>

      <div ref={ref} style={{ position: 'relative' }}>
        <button
          title={t('liveops.map.toggleLayers')}
          aria-label={t('liveops.map.toggleLayersAria')}
          onClick={() => setLayersOpen((o) => !o)}
          style={{ ...ctrlBtnStyle, background: layersOpen ? color.cardHover : ctrlBtnStyle.background }}
        >
          <Layers size={16} strokeWidth={1.75} />
        </button>

        {layersOpen && (
          <div style={{
            position: 'absolute', bottom: 0, right: 'calc(100% + 8px)', width: 176, boxShadow: 'var(--rh-shadow-lg)',
            ...glass.heavy, borderRadius: radius.md, padding: space[2], zIndex: 1001,
          }}>
            {[...(surveyLayers ? SURVEY_LAYER_LABELS : []), ...LAYER_LABELS].map(({ key, labelKey }) => {
              const on = layers[key]
              return (
                <button
                  key={key}
                  type="button"
                  role="menuitemcheckbox"
                  aria-checked={on}
                  onClick={() => onToggleLayer(key)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                    padding: '6px 8px', borderRadius: radius.sm, background: 'transparent', border: 'none',
                    color: on ? color.t1 : color.t3, fontSize: font.size.sm, fontFamily: font.family, cursor: 'pointer',
                  }}
                >
                  {t(labelKey)}
                  <span style={{
                    width: 14, height: 14, borderRadius: radius.xs, flexShrink: 0,
                    border: `1px solid ${on ? color.accent : color.border}`,
                    background: on ? color.accentDim : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {on && <Check size={10} strokeWidth={3} color={color.accent} />}
                  </span>
                </button>
              )
            })}
            <MarkerStyleSwitch />
          </div>
        )}
      </div>
    </div>
  )
}

const MARKER_STYLES = [
  { style: 'body', labelKey: 'liveops.map.markerBody' },
  { style: 'classic', labelKey: 'liveops.map.markerClassic' },
] as const satisfies readonly { style: RobotMarkerStyle; labelKey: string }[]

/** Body or classic robot marker, under the layers -- it is how the robot is
 * drawn, not a layer, so it is a choice of two rather than a checkbox. */
function MarkerStyleSwitch() {
  const { t } = useTranslation()
  const [style, setStyle] = useRobotMarkerStyle()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 8px 4px' }}>
      <span style={{ fontSize: font.size.xs, color: color.t3, fontFamily: font.family }}>
        {t('liveops.map.markerStyle')}
      </span>
      <div role="radiogroup" aria-label={t('liveops.map.markerStyle')}
        style={{ display: 'flex', gap: 2, padding: 2, borderRadius: radius.sm, background: color.bg }}>
        {MARKER_STYLES.map(({ style: s, labelKey }) => {
          const on = style === s
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={on}
              data-marker-style={s}
              onClick={() => setStyle(s)}
              style={{
                flex: 1, padding: '4px 6px', border: 'none', borderRadius: radius.sm - 1, cursor: 'pointer',
                background: on ? color.card : 'transparent', color: on ? color.t1 : color.t3,
                fontSize: font.size.sm, fontFamily: font.family, fontWeight: on ? 500 : 400,
              }}
            >
              {t(labelKey)}
            </button>
          )
        })}
      </div>
    </div>
  )
}
