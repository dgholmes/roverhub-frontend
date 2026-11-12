import { memo, useMemo } from 'react'
import { ImageOverlay } from 'react-leaflet'
import type { LatLngBoundsLiteral, LeafletEventHandlerFnMap, ImageOverlay as LeafletImageOverlay } from 'leaflet'
import { useTranslation } from 'react-i18next'
import { color, font, glass, radius, space } from '@/design-system/tokens'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { boundsForFloor, sparseSurveyPercent } from '@/liveops/mapFloor'
import type { WalkableStatus } from '@/liveops/useWalkableArea'
import { walkableAreaM2 } from '@/liveops/walkable'
import { useSceneData } from '@/scene3d/useSceneData'
import type { SceneGrid } from '@/scene3d/types'
import type { SiteMap } from '@/types/maps'
import { usePaintedFloorUrl } from './useFloorCanvas'

/** An area as the notice shows it: one decimal under 10 m², whole above. */
export function formatAreaM2(m2: number): string {
  return m2 < 10 ? m2.toFixed(1) : String(Math.round(m2))
}

/** A painted grid's extent as overlay bounds: origin to origin + (w, h) cells,
 * as [y, x] corners. The same box `boundsForFloor` gives for its floor. */
export function sceneGridBounds(grid: SceneGrid): LatLngBoundsLiteral {
  const [x0, y0] = grid.origin
  return [[y0, x0], [y0 + grid.h * grid.res, x0 + grid.w * grid.res]]
}

/** One painted cell per image pixel: scaled up, the cells stay square and crisp
 * instead of smearing into each other (the scene's NearestFilter). Set on the
 * element once Leaflet has created it, since an ImageOverlay takes no style. */
export const PIXELATED: LeafletEventHandlerFnMap = {
  add: (e) => {
    const el = (e.target as LeafletImageOverlay).getElement()
    if (el) el.style.imageRendering = 'pixelated'
  },
}

/**
 * The surveyed floorplan under the live layers, in the map scene's colours:
 * the floor grid painted cell by cell (`paintFloor`) -- near-black ground, a
 * lighter floor, light walls, furniture, walkable cells tinted toward the
 * accent -- opaque, since it is the map's background now. It is repainted when
 * the theme or accent changes.
 *
 * Until the grid is loaded, and wherever it cannot be (mock mode, a map with no
 * stored grid, a fetch that failed, no 2D canvas), the backend's grey preview
 * image is drawn instead, translucent, as before the scene.
 *
 * Either image covers exactly the floor's grid (`boundsForFloor`), and sits
 * below the GridLayer's lines and everything above them: Leaflet stacks an
 * image overlay with a positive z-index over the vector pane's SVG, so it takes
 * a negative one.
 *
 * A thinly surveyed floor says so. Unknown cells are ground the lidar never
 * saw, not empty ground, and a plan drawn confidently over them invites a route
 * across it. The caption describes the data, so it stays when the image is
 * missing too.
 *
 * A floor with a planning grid (schema 0.0.17) says how much of it the robot
 * can walk instead: that, not the share of a wall slice the lidar saw, is what
 * decides whether a goal can be reached. Until the grid is read the corner
 * stays empty, and if it cannot be read the survey caption comes back.
 *
 * Memoized for the same reason GridLayer is: MapCanvas re-renders on every
 * telemetry frame, and `map` and `floorIndex` do not change with it (nor does
 * `walkable`, between loads).
 */
export const FloorplanLayer = memo(function FloorplanLayer({ map, floorIndex, walkable }: {
  map: SiteMap
  floorIndex: number
  /** The floor's planning-grid analysis (useWalkableArea); absent means none. */
  walkable?: WalkableStatus
}) {
  const { t } = useTranslation()
  const scene = useSceneData(map, floorIndex)
  const grid = scene.status === 'ready' && scene.data ? scene.data.grid : null
  const paintedUrl = usePaintedFloorUrl(grid)
  const paintedBounds = useMemo(() => (grid ? sceneGridBounds(grid) : null), [grid])
  const floor = map.floors.find((f) => f.index === floorIndex)
  if (!floor) return null

  // mockDataProvider has no stored files and returns '' -- an <img src=""> would
  // re-request the page, so an empty URL means no image.
  const previewUrl = paintedUrl ? '' : dataProvider.mapArtifactUrl(map.map_id, floor.index, 'preview')
  const planningState = floor.planning ? walkable?.state ?? 'none' : 'none'
  const walkableM2 = walkable?.state === 'ready' && floor.planning ? walkableAreaM2(walkable.analysis) : null
  // The survey caption, unless the planning grid is loading or has answered.
  const surveyedPercent = planningState === 'loading' || walkableM2 !== null ? null : sparseSurveyPercent(floor)

  return (
    <>
      {/* Lowest of the images: the walkable tint (-1) sits over it. Keyed apart
          so only the painted floor is pixelated. */}
      {paintedUrl && paintedBounds && (
        <ImageOverlay
          key="painted" url={paintedUrl} bounds={paintedBounds} opacity={1} zIndex={-2}
          interactive={false} eventHandlers={PIXELATED}
        />
      )}
      {previewUrl && (
        <ImageOverlay key="preview" url={previewUrl} bounds={boundsForFloor(floor)} opacity={0.85} zIndex={-2} interactive={false} />
      )}
      {walkableM2 !== null && (
        <div
          role="status"
          style={{
            ...glass.overlay, border: 'none', boxShadow: 'var(--rh-shadow-sm)',
            position: 'absolute', left: 12, bottom: 12, zIndex: 1000, pointerEvents: 'none',
            display: 'flex', alignItems: 'flex-start', gap: space[2],
            padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.md,
            fontFamily: font.family, maxWidth: 260,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: radius.full, background: color.green, flexShrink: 0, marginTop: 4 }} />
          <span>
            <span style={{ display: 'block', fontSize: font.size.md, fontWeight: 600, color: color.t1, fontVariantNumeric: 'tabular-nums' }}>
              {t('liveops.map.walkableArea', { area: formatAreaM2(walkableM2) })}
            </span>
            <span style={{ display: 'block', fontSize: font.size.sm, color: color.t2 }}>
              {t('liveops.map.walkableHint')}
            </span>
          </span>
        </div>
      )}
      {surveyedPercent !== null && (
        <div
          role="status"
          style={{
            ...glass.overlay, border: 'none', background: color.amberBg,
            position: 'absolute', left: 12, bottom: 12, zIndex: 1000, pointerEvents: 'none',
            display: 'flex', alignItems: 'flex-start', gap: space[2],
            padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.md,
            fontFamily: font.family, maxWidth: 240,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: radius.full, background: color.amber, flexShrink: 0, marginTop: 4 }} />
          <span>
            <span style={{ display: 'block', fontSize: font.size.md, fontWeight: 600, color: color.t1 }}>
              {t('liveops.map.surveyedPercent', { percent: surveyedPercent })}
            </span>
            <span style={{ display: 'block', fontSize: font.size.sm, color: color.t2 }}>
              {t('liveops.map.surveyedWarning')}
            </span>
          </span>
        </div>
      )}
    </>
  )
})
