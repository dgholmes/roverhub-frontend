import { useEffect, useRef, useState } from 'react'
import { Check, Crosshair, Layers, Maximize } from 'lucide-react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { color, font, glass, radius, space } from '@/design-system/tokens'
import { toLatLng } from '@/liveops/mapCoords'
import type { Mission, RobotState } from '@/types'
import type { MapLayerVisibility } from './MapCanvas'

const ctrlBtnStyle: React.CSSProperties = {
  ...glass.overlay,
  width: 30, height: 30, borderRadius: radius.sm,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: color.t2, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.09)',
}

const LAYER_LABELS: { key: keyof MapLayerVisibility; label: string }[] = [
  { key: 'geofence', label: 'Geofences' },
  { key: 'noGoZones', label: 'No-Go Zones' },
  { key: 'annotations', label: 'Annotations' },
  { key: 'otherRobots', label: 'Other Robots' },
]

/** Map is never obscured by panels without operator action (docs/05-ui-ux.md
 * §18.6) — these controls are the operator action that moves the viewport. */
export function MapControls({
  robot, mission, bounds, layers, onToggleLayer,
}: {
  robot: RobotState
  mission?: Mission
  bounds: L.LatLngBoundsLiteral
  layers: MapLayerVisibility
  onToggleLayer: (key: keyof MapLayerVisibility) => void
}) {
  const map = useMap()
  const [layersOpen, setLayersOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!layersOpen) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setLayersOpen(false)
    }
    window.addEventListener('mousedown', onClickOutside)
    return () => window.removeEventListener('mousedown', onClickOutside)
  }, [layersOpen])

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

      <div ref={ref} style={{ position: 'relative' }}>
        <button
          title="Toggle layers"
          aria-label="Toggle map layers"
          onClick={() => setLayersOpen((o) => !o)}
          style={{ ...ctrlBtnStyle, background: layersOpen ? color.cardHover : ctrlBtnStyle.background }}
        >
          <Layers size={14} strokeWidth={1.8} />
        </button>

        {layersOpen && (
          <div style={{
            position: 'absolute', top: 0, right: 'calc(100% + 8px)', width: 160,
            ...glass.heavy, borderRadius: radius.md, padding: space[2], zIndex: 1001,
          }}>
            {LAYER_LABELS.map(({ key, label }) => {
              const on = layers[key]
              return (
                <button
                  key={key}
                  onClick={() => onToggleLayer(key)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%',
                    padding: '6px 8px', borderRadius: radius.sm, background: 'transparent', border: 'none',
                    color: on ? color.t1 : color.t3, fontSize: font.size.sm, fontFamily: font.family, cursor: 'pointer',
                  }}
                >
                  {label}
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
          </div>
        )}
      </div>
    </div>
  )
}
