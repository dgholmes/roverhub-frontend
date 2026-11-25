import { memo } from 'react'
import { ImageOverlay } from 'react-leaflet'
import { useTranslation } from 'react-i18next'
import { color, font, glass, radius, space } from '@/design-system/tokens'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { boundsForFloor, sparseSurveyPercent } from '@/liveops/mapFloor'
import type { WalkableStatus } from '@/liveops/useWalkableArea'
import { walkableAreaM2 } from '@/liveops/walkable'
import { useSceneData } from '@/scene3d/useSceneData'
import type { SiteMap } from '@/types/maps'
import { MapCaption } from './MapCaptions'
import { usePaintedFloorUrl } from './useFloorCanvas'

/** An area as the notice shows it: one decimal under 10 m², whole above. */
export function formatAreaM2(m2: number): string {
  return m2 < 10 ? m2.toFixed(1) : String(Math.round(m2))
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
export const FloorplanLayer = memo(function FloorplanLayer({ map, floorIndex, walkable, showWalkable = true, captions = true }: {
  map: SiteMap
  floorIndex: number
  /** The floor's planning-grid analysis (useWalkableArea); absent means none. */
  walkable?: WalkableStatus
  /** Tint the walkable cells on the painted floor (the walkable layer's toggle). */
  showWalkable?: boolean
  /** The walkable-area and survey captions. Off while the map's tools are put
   * away, so a small map is only the map. */
  captions?: boolean
}) {
  const { t } = useTranslation()
  const scene = useSceneData(map, floorIndex)
  const grid = scene.status === 'ready' && scene.data ? scene.data.grid : null
  const painted = usePaintedFloorUrl(grid, showWalkable)
  const floor = map.floors.find((f) => f.index === floorIndex)
  if (!floor) return null

  // mockDataProvider has no stored files and returns '' -- an <img src=""> would
  // re-request the page, so an empty URL means no image.
  const previewUrl = painted ? '' : dataProvider.mapArtifactUrl(map.map_id, floor.index, 'preview')
  const planningState = floor.planning ? walkable?.state ?? 'none' : 'none'
  const walkableM2 = walkable?.state === 'ready' && floor.planning ? walkableAreaM2(walkable.analysis) : null
  // The survey caption, unless the planning grid is loading or has answered.
  const surveyedPercent = planningState === 'loading' || walkableM2 !== null ? null : sparseSurveyPercent(floor)

  return (
    <>
      {/* Lowest of the images. The painted one is cropped to the surveyed
          content and painted large (useFloorCanvas), so its bounds are its own. */}
      {painted && (
        <ImageOverlay key="painted" url={painted.url} bounds={painted.bounds} opacity={1} zIndex={-2} interactive={false} />
      )}
      {previewUrl && (
        <ImageOverlay key="preview" url={previewUrl} bounds={boundsForFloor(floor)} opacity={0.85} zIndex={-2} interactive={false} />
      )}
      {captions && walkableM2 !== null && (
        <MapCaption><div
          role="status"
          style={{
            ...glass.overlay, border: 'none', boxShadow: 'var(--rh-shadow-sm)',
            pointerEvents: 'none',
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
        </div></MapCaption>
      )}
      {captions && surveyedPercent !== null && (
        <MapCaption><div
          role="status"
          style={{
            ...glass.overlay, border: 'none', background: color.amberBg,
            pointerEvents: 'none',
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
        </div></MapCaption>
      )}
    </>
  )
})
