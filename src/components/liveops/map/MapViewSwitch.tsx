import { memo, useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Box, Locate, Map as MapIcon, Plane } from 'lucide-react'
import { color, font, glass, radius, space } from '@/design-system/tokens'
import type { SceneDataState } from '@/scene3d/useSceneData'

/**
 * The LiveOps map's views: Plan is the flat Leaflet map; 3D, Fly and Follow
 * are the map scene (tilted plan, a flight through the lidar cloud, a chase
 * camera on the live robot). Tap to walk and Set position work in all four.
 */
export type MapView = 'plan' | '3d' | 'fly' | 'follow'
export type SceneMapView = Exclude<MapView, 'plan'>

export const MAP_VIEWS: readonly MapView[] = ['plan', '3d', 'fly', 'follow']

export const MAP_VIEW_KEY = 'rh.liveops.mapView'

const isMapView = (v: unknown): v is MapView => typeof v === 'string' && (MAP_VIEWS as readonly string[]).includes(v)

/** What this browser last chose; anything missing or unreadable is Plan. */
export function loadMapView(): MapView {
  try {
    const raw = localStorage.getItem(MAP_VIEW_KEY)
    return isMapView(raw) ? raw : 'plan'
  } catch {
    return 'plan'
  }
}

export function saveMapView(view: MapView): void {
  try {
    localStorage.setItem(MAP_VIEW_KEY, view)
  } catch { /* a per-viewer convenience only */ }
}

/** The chosen view, read once on mount and written on every change. */
export function useMapViewPref(): [MapView, (view: MapView) => void] {
  const [view, setView] = useState<MapView>(loadMapView)
  const choose = useCallback((next: MapView) => {
    saveMapView(next)
    setView(next)
  }, [])
  return [view, choose]
}

/** Why a scene view cannot be shown now, as a `liveops.map.*` key. */
export type MapViewReason = 'viewLoading' | 'viewNoScene' | 'viewNoCloud'

/** Per scene view: null when it can be shown, else why not. */
export type MapViewReasons = Readonly<Record<SceneMapView, MapViewReason | null>>

const NO_SCENE: MapViewReasons = Object.freeze({ '3d': 'viewNoScene', fly: 'viewNoScene', follow: 'viewNoScene' })
const LOADING: MapViewReasons = Object.freeze({ '3d': 'viewLoading', fly: 'viewLoading', follow: 'viewLoading' })
const NO_CLOUD: MapViewReasons = Object.freeze({ '3d': null, fly: 'viewNoCloud', follow: 'viewNoCloud' })
const ALL: MapViewReasons = Object.freeze({ '3d': null, fly: null, follow: null })

/**
 * Which views the floor's scene allows. 3D needs the scene built; Fly and
 * Follow need its lidar cloud too. Null scene (the inset, no survey): none.
 * Constant objects, so the memoized switch skips telemetry frames.
 */
export function mapViewReasons(scene: SceneDataState | null): MapViewReasons {
  if (!scene) return NO_SCENE
  if (scene.status === 'idle' || scene.status === 'loading') return LOADING
  if (scene.status !== 'ready' || !scene.data) return NO_SCENE
  return scene.data.cloud && scene.data.cloud.count > 0 ? ALL : NO_CLOUD
}

/** The view to show: the chosen one when it can be shown, else Plan. */
export function effectiveMapView(chosen: MapView, reasons: MapViewReasons): MapView {
  return chosen === 'plan' || reasons[chosen] === null ? chosen : 'plan'
}

const ICONS: Record<MapView, React.ElementType> = { plan: MapIcon, '3d': Box, fly: Plane, follow: Locate }
const LABELS: Record<MapView, 'viewPlan' | 'view3d' | 'viewFly' | 'viewFollow'> = {
  plan: 'viewPlan', '3d': 'view3d', fly: 'viewFly', follow: 'viewFollow',
}
const TITLES: Record<MapView, 'viewPlanTitle' | 'view3dTitle' | 'viewFlyTitle' | 'viewFollowTitle'> = {
  plan: 'viewPlanTitle', '3d': 'view3dTitle', fly: 'viewFlyTitle', follow: 'viewFollowTitle',
}

/**
 * A rail of four view buttons, styled like the FloorPicker above it: the
 * active view is a tint with an accent icon, an unavailable one is dimmed and
 * says why on hover. Memoized: pass a stable `onChange` and `reasons`, since
 * MapCanvas re-renders on every telemetry frame.
 */
export const MapViewSwitch = memo(function MapViewSwitch({ value, onChange, reasons }: {
  value: MapView
  onChange: (view: MapView) => void
  reasons: MapViewReasons
}) {
  const { t } = useTranslation()
  return (
    <div
      role="group"
      aria-label={t('liveops.map.viewSwitch')}
      style={{
        ...glass.overlay, border: 'none', boxShadow: 'var(--rh-shadow-sm)',
        display: 'flex', flexDirection: 'column', gap: 2, padding: 4, borderRadius: radius.md,
      }}
    >
      {MAP_VIEWS.map((view) => {
        const reason = view === 'plan' ? null : reasons[view]
        const active = view === value
        const enabled = reason === null
        const Icon = ICONS[view]
        return (
          <button
            key={view}
            type="button"
            data-view={view}
            aria-pressed={active}
            disabled={!enabled}
            title={reason ? t(`liveops.map.${reason}`) : t(`liveops.map.${TITLES[view]}`)}
            onClick={() => onChange(view)}
            style={{
              display: 'flex', alignItems: 'center', gap: space[2], border: 'none',
              cursor: enabled ? 'pointer' : 'not-allowed',
              padding: '6px 10px', borderRadius: radius.sm, fontFamily: font.family, fontSize: font.size.sm,
              fontWeight: active ? font.weight.semibold : font.weight.medium,
              background: active ? color.selected : 'transparent',
              color: !enabled ? color.t4 : active ? color.t1 : color.t2,
            }}
          >
            <Icon size={14} strokeWidth={1.8} aria-hidden color={active ? color.accent : 'currentColor'} />
            {t(`liveops.map.${LABELS[view]}`)}
          </button>
        )
      })}
    </div>
  )
})
