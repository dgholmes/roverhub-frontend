import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { LatLngBoundsLiteral } from 'leaflet'
import { Map as MapIcon } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { stateVisualFor } from '@/liveops/stateDisplay'
import { contentBoundsM } from '@/liveops/contentBounds'
import { paintFloorToUrl, useThemeStamp, type PaintedFloor } from '@/components/liveops/map/useFloorCanvas'
import { resolveScenePalette } from '@/scene3d/palette'
import { gridRequests, loadGrid } from '@/missions/useFloorGrids'
import { buildSceneGrid } from '@/scene3d/sceneData'
import type { SceneGrid } from '@/scene3d/types'
import { robotsOnMap } from '@/org/robotMapInfo'
import type { RobotState } from '@/types'
import type { MapFloor, SiteMap } from '@/types/maps'

/** What the thumbnail drew, for tests and for anyone reading the DOM. */
export type ThumbnailKind =
  /** The floor's grid, painted in the scene palette and cropped to the content. */
  | 'painted'
  /** The backend's preview image: the grid could not be painted. */
  | 'image'
  /** The floor outline and zones: no grid and no image (mock mode). */
  | 'sketch'
  | 'none' | 'loading' | 'error'

/** A floor's grid in the map frame, metres: lower-left corner and size. */
function floorBox(floor: MapFloor) {
  const [x0, y0] = floor.origin_xy_m
  return { x0, y0, w: floor.size_cells[0] * floor.resolution_m, h: floor.size_cells[1] * floor.resolution_m }
}

/** Robots set up for this map whose live position lies on the floor's grid:
 * the only ones a dot can honestly be drawn for. */
export function robotsOnFloor(robots: readonly RobotState[], map: SiteMap, floor: MapFloor): RobotState[] {
  const { x0, y0, w, h } = floorBox(floor)
  return robotsOnMap(robots, map.map_id).filter((r) => {
    const { x_m: x, y_m: y } = r.position
    return Number.isFinite(x) && Number.isFinite(y) && x >= x0 && x <= x0 + w && y >= y0 && y <= y0 + h
  })
}

/** A box in map metres. */
interface MetreBox { xLo: number; yLo: number; xHi: number; yHi: number }
/** From Leaflet-style `[[yLo, xLo], [yHi, xHi]]` bounds. */
const fromBounds = (b: LatLngBoundsLiteral): MetreBox => ({ yLo: b[0][0], xLo: b[0][1], yHi: b[1][0], xHi: b[1][1] })
/** As an SVG viewBox with y flipped, so north is up. */
const viewBoxOf = (b: MetreBox) => `${b.xLo} ${-b.yHi} ${b.xHi - b.xLo} ${b.yHi - b.yLo}`

/**
 * The floor's occupancy grid, read once per survey (`loadGrid`, the cache
 * Missions' waypoint checks share), as a SceneGrid. Only the grid: no planning
 * grid and no point cloud, which a thumbnail does not need. `failed` once it
 * cannot be had -- mock mode stores no files, or the fetch failed.
 */
function useThumbnailGrid(map: SiteMap | null, floor: MapFloor | null): { grid: SceneGrid | null; failed: boolean } {
  const req = map && floor ? gridRequests(map).find((r) => r.index === floor.index) ?? null : null
  const key = req?.key ?? null
  const [loaded, setLoaded] = useState<{ key: string; grid: SceneGrid | null } | null>(null)
  useEffect(() => {
    if (!req || !floor) return
    let current = true
    void loadGrid(req.url, req.key).then((pixels) => {
      if (!current) return
      setLoaded({
        key: req.key,
        grid: pixels ? buildSceneGrid(pixels, null, floor.resolution_m, [floor.origin_xy_m[0], floor.origin_xy_m[1]]) : null,
      })
    })
    return () => { current = false }
    // `req` and `floor` are covered by `key`: map id, update time and floor.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  if (!req) return { grid: null, failed: true }
  if (loaded?.key !== key) return { grid: null, failed: false }
  return { grid: loaded.grid, failed: loaded.grid === null }
}

/**
 * The grid painted by `paintFloorToUrl` (LiveOps' painter: scene palette,
 * cropped to the content plus a few cells), repainted when the theme changes.
 * Like `usePaintedFloorUrl`, but it also says when painting failed (no 2D
 * canvas, no blob), so the thumbnail can fall back instead of waiting. Each
 * object URL is revoked when it is replaced, when the grid goes, and on
 * unmount.
 */
function usePaintedThumbnail(grid: SceneGrid | null): { floor: PaintedFloor | null; failed: boolean } {
  const theme = useThemeStamp()
  const [state, setState] = useState<{ grid: SceneGrid; floor: PaintedFloor | null } | null>(null)
  const held = useRef<string | null>(null)
  useEffect(() => {
    if (!grid) return
    let current = true
    void paintFloorToUrl(grid, resolveScenePalette(), false).then((floor) => {
      if (!current) {
        if (floor) URL.revokeObjectURL(floor.url)
        return
      }
      const previous = held.current
      held.current = floor?.url ?? null
      setState({ grid, floor })
      if (previous) URL.revokeObjectURL(previous)
    })
    return () => { current = false }
  }, [grid, theme])
  useEffect(() => () => {
    if (held.current) URL.revokeObjectURL(held.current)
    held.current = null
  }, [])
  if (!grid || state?.grid !== grid) return { floor: null, failed: false }
  return { floor: state.floor, failed: state.floor === null }
}

/**
 * A site's floor map, small, drawn as LiveOps and the Map page draw it: the
 * floor's grid painted in the scene palette (`usePaintedThumbnail` over
 * LiveOps' `paintFloorToUrl`, following the theme), cropped to the surveyed
 * content. A survey's grid reaches far past the building -- 58 x 25 m around
 * 19 x 22 m of office on the active map (liveops/contentBounds.ts) -- so the
 * whole grid would show the building as a patch against one edge.
 *
 * On top, a dot per robot set up for this map and standing on the floor, in
 * its state's colour. Used by Org › Sites (cards and the Maps tab) and the
 * Dashboard's Sites block.
 *
 * Where the grid cannot be painted it falls back to the floor's `preview`
 * image, framed on the content when the grid was read and on the whole grid
 * when not; with no image either (mock mode), the floor's outline and zones,
 * so the robots still have somewhere to stand.
 *
 * One SVG in map metres (y flipped), so the floor and the dots share one frame
 * and stay aligned at any size.
 */
export function SiteMapThumbnail({ map, robots = [], loading, error, height = 120, label }: {
  /** The map to draw (org/siteRecords.ts `siteThumbnailMap`), null for none. */
  map: SiteMap | null
  robots?: readonly RobotState[]
  /** The site's maps are still on their way. */
  loading?: boolean
  /** The site's maps could not be read. */
  error?: boolean
  height?: number
  /** The accessible name; defaults to the map's name. */
  label?: string
}) {
  const { t } = useTranslation()
  const floor = map?.floors[0] ?? null
  const { grid, failed: gridFailed } = useThumbnailGrid(map, floor)
  const { floor: painted, failed: paintFailed } = usePaintedThumbnail(grid)
  const url = map && floor ? dataProvider.mapArtifactUrl(map.map_id, floor.index, 'preview') : ''
  const [failedUrl, setFailedUrl] = useState<string | null>(null)

  const frame: React.CSSProperties = {
    position: 'relative', height, borderRadius: radius.md, background: color.mapBg,
    overflow: 'hidden', flexShrink: 0, minWidth: 0,
  }

  if (!map || !floor) {
    const kind: ThumbnailKind = loading && !map ? 'loading' : error ? 'error' : 'none'
    const text = kind === 'loading' ? t('orgSites.thumb.loading') : kind === 'error' ? t('orgSites.thumb.error') : t('orgSites.thumb.noMap')
    return (
      <div data-thumbnail={kind} role="img" aria-label={label ?? text} style={{
        ...frame, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: space[1],
        color: color.t3, fontSize: font.size.sm,
      }}>
        <MapIcon size={18} strokeWidth={1.75} aria-hidden />
        <span>{text}</span>
      </div>
    )
  }

  const { x0, y0, w, h } = floorBox(floor)
  const whole: MetreBox = { xLo: x0, yLo: y0, xHi: x0 + w, yHi: y0 + h }
  // Painting takes a moment after the grid arrives (toBlob). Until the grid
  // has answered, or while it is being painted, nothing is drawn: drawn at
  // once, the pale whole-grid preview would flash before the painted floor.
  const painting = !!grid && !painted && !paintFailed
  const waiting = (!grid && !gridFailed) || painting
  const showImage = !painted && !waiting && !!url && failedUrl !== url
  const paintedBox = painted ? fromBounds(painted.bounds) : null
  const view: MetreBox = paintedBox ?? (grid ? fromBounds(contentBoundsM(grid)) : whole)
  const dotR = Math.max(view.xHi - view.xLo, view.yHi - view.yLo) * 0.028
  const dots = robotsOnFloor(robots, map, floor)
  const kind: ThumbnailKind = painted ? 'painted' : waiting ? 'loading' : showImage ? 'image' : 'sketch'

  return (
    <div data-thumbnail={kind} style={{ ...frame, background: painted ? color.sceneBg : color.mapBg }}>
      <svg
        role="img" aria-label={label ?? map.name}
        viewBox={viewBoxOf(view)} preserveAspectRatio="xMidYMid meet"
        style={{ width: '100%', height: '100%', display: 'block' }}
      >
        {painted && paintedBox && (
          <image
            href={painted.url} x={paintedBox.xLo} y={-paintedBox.yHi}
            width={paintedBox.xHi - paintedBox.xLo} height={paintedBox.yHi - paintedBox.yLo} preserveAspectRatio="none"
          />
        )}
        {!painted && !waiting && <rect x={x0} y={-(y0 + h)} width={w} height={h} fill={color.card} />}
        {showImage && (
          <image
            href={url} x={x0} y={-(y0 + h)} width={w} height={h} preserveAspectRatio="none"
            onError={() => setFailedUrl(url)}
          />
        )}
        {!waiting && map.zones.map((z) => (
          <polygon
            key={z.zone_id}
            points={z.polygon.map(([x, y]) => `${x},${-y}`).join(' ')}
            fill={z.kind === 'geofence' ? 'none' : color.mapZone}
            fillOpacity={0.35}
            stroke={z.kind === 'geofence' ? color.accent : color.red}
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {dots.map((r) => {
          const v = stateVisualFor(r.abstract_state, r.sdk_state)
          return (
            <circle
              key={r.robot_id} data-robot-dot={r.robot_id}
              cx={r.position.x_m} cy={-r.position.y_m} r={dotR}
              fill={v.color} stroke={color.bg} strokeWidth={1.5} vectorEffect="non-scaling-stroke"
              opacity={r.position.freshness === 'live' ? 1 : 0.5}
            >
              <title>{`${r.name} · ${v.label}`}</title>
            </circle>
          )
        })}
      </svg>
    </div>
  )
}

