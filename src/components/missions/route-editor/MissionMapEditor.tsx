import { memo, useCallback, useMemo, useState } from 'react'
import { MapContainer } from 'react-leaflet'
import L from 'leaflet'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/kit'
import { color, font, glass, radius, space } from '@/design-system/tokens'
import { GridLayer } from '@/components/liveops/map/GridLayer'
import { GeofenceLayer } from '@/components/liveops/map/GeofenceLayer'
import { NoGoZoneLayer } from '@/components/liveops/map/NoGoZoneLayer'
import { FloorplanLayer } from '@/components/liveops/map/FloorplanLayer'
import { FloorPicker } from '@/components/liveops/map/FloorPicker'
import { MAP_BOUNDS } from '@/components/liveops/map/MapCanvas'
import { boundsForFloor } from '@/liveops/mapFloor'
import { waypointCells, type CellClass } from '@/missions/floorCells'
import { useFloorGrids } from '@/missions/useFloorGrids'
import { EditableRouteLayer } from './EditableRouteLayer'
import { MapClickHandler } from './MapClickHandler'
import { FitToRoute } from './FitToRoute'
import type { MissionWaypoint } from '@/types'
import type { SiteMap } from '@/types/maps'

/**
 * Missions' RouteEditor map (docs/05-ui-ux.md §11.2) — reuses the same
 * ground-plane primitives LiveOps' MapCanvas uses (grid, geofence, no-go
 * zones), but click-to-place-waypoint instead of live robot tracking. Built
 * as its own component rather than overloading MapCanvas, which is read-only
 * by design — cramming editing interaction into it would mean two very
 * different interaction models in one already-dense component.
 *
 * `map` is the surveyed map the mission is planned on:
 * - a map: its floorplan and its own zones are drawn, and a waypoint standing
 *   on ground the survey did not mark free is flagged (never blocked);
 * - `undefined`: the site has no surveyed map, and this is the plain grid it
 *   always was;
 * - `null`: the mission names a map that cannot be had. There is then NO canvas
 *   and no way to place a step: an empty canvas looks exactly like open floor,
 *   and an operator will draw a route across it.
 */
export function MissionMapEditor({ map, mapId, refusal, replacement, onReplace, ...canvas }: {
  mapId: string
  map?: SiteMap | null
  /** Why `map` is null when it is not simply missing. */
  refusal?: 'loading' | 'unavailable'
  /** The map to offer instead of a missing one, with what choosing it does. */
  replacement?: SiteMap
  onReplace?: (map: SiteMap) => void
} & CanvasProps) {
  if (map === null) {
    return <MapRefusal mapId={mapId} reason={refusal ?? 'missing'} replacement={replacement} onReplace={onReplace} />
  }
  return <PlanningMap map={map} {...canvas} />
}

interface CanvasProps {
  /** Changes when a different mission opens, so the map fits again. */
  fitKey?: string
  flagged?: Record<string, 'error' | 'warning'>
  waypoints: MissionWaypoint[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** `z_m` is the elevation of the floor it was placed on, or null on the plain grid. */
  onAddWaypoint: (x_m: number, y_m: number, z_m: number | null) => void
}

/** Why there is nothing to click, and what can be done about it. Fills the
 * pane where the canvas would be. */
function MapRefusal({ mapId, reason, replacement, onReplace }: {
  mapId: string
  reason: 'missing' | 'loading' | 'unavailable'
  replacement?: SiteMap
  onReplace?: (map: SiteMap) => void
}) {
  const { t } = useTranslation()
  const loading = reason === 'loading'
  return (
    <div
      data-testid={reason === 'missing' ? 'missing-map' : `map-${reason}`}
      role={loading ? 'status' : 'alert'}
      style={{
        width: '100%', height: '100%', background: color.mapBg, display: 'flex',
        alignItems: 'center', justifyContent: 'center', padding: space[6], boxSizing: 'border-box',
      }}
    >
      <div style={{
        maxWidth: 380, display: 'flex', flexDirection: 'column', gap: space[3], padding: space[4],
        borderRadius: radius.md, fontFamily: font.family,
        background: loading ? color.card : color.amberBg,
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.md, fontWeight: 600, color: color.t1 }}>
          <span style={{ width: 8, height: 8, borderRadius: radius.full, flexShrink: 0, background: loading ? color.t3 : color.amber }} />
          {loading ? t('missions.editor.mapLoading')
            : reason === 'missing' ? t('missions.editor.mapMissingTitle') : t('missions.editor.mapUnavailableTitle')}
        </span>
        {!loading && (
          <span style={{ fontSize: font.size.sm, color: color.t2 }}>
            {reason === 'missing' ? t('missions.editor.mapMissingBody', { mapId }) : t('missions.editor.mapUnavailableBody', { mapId })}
          </span>
        )}
        {reason === 'missing' && replacement && onReplace && (
          <div>
            <Button size="sm" onClick={() => onReplace(replacement)}>
              {t('missions.editor.mapUseSite', { name: replacement.name })}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

/** Wider than the site, so panning never reaches a hard edge of grid. */
const GRID_BOUNDS: L.LatLngBoundsLiteral = [[-300, -300], [300, 300]]
const NO_CELLS: Record<string, CellClass> = {}

function PlanningMap({
  map, waypoints, selectedId, onSelect, onAddWaypoint, flagged, fitKey = 'route',
}: { map?: SiteMap } & CanvasProps) {
  const { t } = useTranslation()
  const [pickedFloor, setPickedFloor] = useState<number | undefined>(undefined)
  const floor = map?.floors.find((f) => f.index === (pickedFloor ?? map.floors[0]?.index))
  const grids = useFloorGrids(map)

  // Where each waypoint stands, against its own floor's grid. Not blocking: a
  // doorway the survey missed is a fair place to plan through (the venue grid
  // is 86% unknown). It just has to show at authoring time, not at run time.
  const cells = useMemo(
    () => (map && floor ? waypointCells(map, grids, waypoints, floor.index) : NO_CELLS),
    [map, floor, grids, waypoints],
  )
  const { shown, notes, offFree } = useMemo(() => {
    const merged: Record<string, 'error' | 'warning'> = { ...flagged }
    const note: Record<string, string> = {}
    let off = 0
    for (const [id, cell] of Object.entries(cells)) {
      if (cell === 'free') continue
      off += 1
      // A validation error (inside a no-go zone) is worse than "not surveyed".
      if (merged[id] !== 'error') merged[id] = 'warning'
      note[id] = cell === 'occupied' ? t('missions.editor.stepOnObstacle') : t('missions.editor.stepUnclassified')
    }
    return { shown: merged, notes: note, offFree: off }
  }, [cells, flagged, t])

  const bounds = useMemo(() => (floor ? boundsForFloor(floor) : MAP_BOUNDS), [floor])
  const place = useCallback(
    (x_m: number, y_m: number) => onAddWaypoint(x_m, y_m, floor ? floor.floor_z_m : null),
    [onAddWaypoint, floor],
  )

  return (
    <div data-testid="planning-canvas" style={{ position: 'relative', width: '100%', height: '100%', isolation: 'isolate' }}>
      <MapContainer
        crs={L.CRS.Simple}
        bounds={bounds}
        style={{ height: '100%', width: '100%', background: color.mapBg }}
        zoomControl={false}
        attributionControl={false}
        minZoom={1}
        maxZoom={7}
        // Fine fractional zoom: whole steps left the route at about half the
        // size the pane could show it, and even quarter steps stopped ~20% short.
        zoomSnap={0.1}
        zoomDelta={0.5}
      >
        <FitToRoute waypoints={waypoints} fitKey={`${fitKey}:${map?.map_id ?? ''}:${floor?.index ?? ''}`} extent={floor ? bounds : undefined} />
        {map && floor && <FloorplanLayer map={map} floorIndex={floor.index} />}
        <GridLayer bounds={GRID_BOUNDS} />
        {/* The map's own zones, or the mock site's with no map: the same rule as
            LiveOps, so what is drawn here is what the checks use (zoneContext). */}
        <GeofenceLayer zones={map?.zones} />
        <NoGoZoneLayer zones={map?.zones} />
        <EditableRouteLayer waypoints={waypoints} selectedId={selectedId} onSelect={onSelect} flagged={shown} notes={notes} />
        <MapClickHandler onAdd={place} />
        {offFree > 0 && <OffFreeCaption count={offFree} />}
      </MapContainer>
      {/* A sibling of the Leaflet container, not a child: a click on the picker
          would otherwise bubble to the map and place a waypoint under it. */}
      {map && floor && map.floors.length > 1 && (
        <div style={{ position: 'absolute', top: space[3], right: space[3], zIndex: 1000 }}>
          <FloorPicker map={map} value={floor.index} onChange={setPickedFloor} />
        </div>
      )}
    </div>
  )
}

/** Steps standing on ground the lidar did not see as open. A tint and a dot, as
 * FloorplanLayer's survey caption, and for the same reason: unknown is not clear.
 * Memoized on a count so a keystroke elsewhere does not re-render it. */
const OffFreeCaption = memo(function OffFreeCaption({ count }: { count: number }) {
  const { t } = useTranslation()
  return (
    <div
      role="status"
      style={{
        ...glass.overlay, border: 'none', background: color.amberBg,
        position: 'absolute', left: space[3], top: space[3], zIndex: 1000, pointerEvents: 'none',
        display: 'flex', alignItems: 'center', gap: space[2],
        padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.md, fontFamily: font.family,
        fontSize: font.size.md, fontWeight: 600, color: color.t1,
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: radius.full, background: color.amber, flexShrink: 0 }} />
      {t('missions.editor.offFreeSummary', { count })}
    </div>
  )
})
