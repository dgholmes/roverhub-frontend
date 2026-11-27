import { useCallback, useMemo, useState } from 'react'
import { MapContainer } from 'react-leaflet'
import L from 'leaflet'
import { color, space } from '@/design-system/tokens'
import { GridLayer } from '@/components/liveops/map/GridLayer'
import { GeofenceLayer } from '@/components/liveops/map/GeofenceLayer'
import { NoGoZoneLayer } from '@/components/liveops/map/NoGoZoneLayer'
import { FloorplanLayer } from '@/components/liveops/map/FloorplanLayer'
import { FloorPicker } from '@/components/liveops/map/FloorPicker'
import { MAP_BOUNDS } from '@/components/liveops/map/MapCanvas'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { boundsForFloor } from '@/liveops/mapFloor'
import { floorOfWaypoint } from '@/missions/floorCells'
import { EditableRouteLayer } from './route-editor/EditableRouteLayer'
import { FitToRoute } from './route-editor/FitToRoute'
import { useFitExtent } from './route-editor/useFitExtent'
import type { MissionWaypoint } from '@/types'
import type { SiteMap } from '@/types/maps'

const GRID_BOUNDS: L.LatLngBoundsLiteral = [[-300, -300], [300, 300]]
const noop = () => {}

/**
 * The floors a route stands on, in route order: each step's own floor (by
 * elevation, floorOfWaypoint), a step with none taken to be on the map's first
 * floor. The first entry is the floor the route starts on.
 */
function routeFloors(map: SiteMap, waypoints: readonly MissionWaypoint[]): number[] {
  const first = map.floors[0]?.index
  if (first === undefined) return []
  const out: number[] = []
  for (const wp of waypoints) {
    const f = floorOfWaypoint(map, wp, first)
    if (f && !out.includes(f.index)) out.push(f.index)
  }
  return out
}

/**
 * The mission library's preview: one mission's route on the map it was drawn
 * on, pannable and zoomable but not editable. The same layers the editor's
 * Leaflet map draws (MissionMapEditor `PlanningMap`), so a route looks the
 * same in both places -- but never the 3D scene, which is too heavy for a
 * preview that changes with every card click.
 *
 * With a map: that map's floorplan, for the floor the route starts on, and its
 * zones. Without one (no map, an unknown or a missing one -- the card's chip
 * says which): the plain grid and the provider's sample site, as before.
 */
export function RoutePreviewMap({ missionId, waypoints, map, flagged, padding }: {
  missionId: string
  waypoints: MissionWaypoint[]
  /** The mission's map (missionMapOf), when the site has it. */
  map?: SiteMap
  flagged?: Record<string, 'error' | 'warning'>
  padding: { topLeft: [number, number]; bottomRight: [number, number] }
}) {
  const floors = useMemo(() => (map ? routeFloors(map, waypoints) : []), [map, waypoints])
  // A floor picked on the picker counts for this mission and map only: the
  // next mission opens on its own route's floor.
  const owner = `${missionId}:${map?.map_id ?? ''}`
  const [picked, setPicked] = useState<{ owner: string; index: number } | null>(null)
  const pickedIndex = picked?.owner === owner ? picked.index : undefined
  const floor = map?.floors.find((f) => f.index === (pickedIndex ?? floors[0] ?? map.floors[0]?.index))
  const bounds = useMemo(() => (floor ? boundsForFloor(floor) : MAP_BOUNDS), [floor])
  const zones = map?.zones ?? dataProvider.sampleSite().zones
  // Framed on where the floor was surveyed, not on its whole grid.
  const fit = useFitExtent(map, floor?.index, floor ? bounds : undefined)
  const pick = useCallback((index: number) => setPicked({ owner, index }), [owner])

  return (
    <div data-route-preview style={{ position: 'absolute', inset: 0, isolation: 'isolate' }}>
      <MapContainer
        crs={L.CRS.Simple} bounds={bounds}
        style={{ height: '100%', width: '100%', background: color.mapBg }}
        zoomControl={false} attributionControl={false}
        minZoom={1} maxZoom={7} zoomSnap={0.1} zoomDelta={0.5}
      >
        <FitToRoute
          waypoints={waypoints} fitKey={`${missionId}:${map?.map_id ?? ''}:${floor?.index ?? ''}:${fit.fitKeySuffix}`}
          padding={padding} extent={fit.extent} zones={zones}
        />
        {/* No captions: the preview's own title and stats bar sit where they would. */}
        {map && floor && <FloorplanLayer map={map} floorIndex={floor.index} captions={false} />}
        <GridLayer bounds={GRID_BOUNDS} />
        {/* The map's own zones, or with no map the provider's sample site (the
            mock site in mock mode, nothing on the real backend), as the editor. */}
        <GeofenceLayer zones={zones} />
        <NoGoZoneLayer zones={zones} />
        <EditableRouteLayer waypoints={waypoints} selectedId={null} onSelect={noop} flagged={flagged} />
      </MapContainer>
      {/* Only for a route over two or more floors. A sibling of the map, as in the editor. */}
      {map && floor && floors.length > 1 && (
        <div style={{ position: 'absolute', top: space[4], right: space[4], zIndex: 1000 }}>
          <FloorPicker map={map} value={floor.index} onChange={pick} />
        </div>
      )}
    </div>
  )
}
