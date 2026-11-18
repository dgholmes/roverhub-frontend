import type { MissionLibraryEntry, MissionValidation, RobotType } from '@/types'
import type { SiteMap } from '@/types/maps'
import { validateMission, type CheckContext } from './validate'

/** What the checks need besides the robot type. */
export type ZoneChecks = Pick<CheckContext, 'noGoZones' | 'geofences' | 'zonesNotChecked'>

/**
 * The zones a mission is checked against, given the map it names and the map
 * that is loaded. A mission is only ever checked against the map it was planned
 * on: against any other map's polygons it would be flagged, or cleared, by
 * zones from somewhere else, and a tick it never earned is worth less than none.
 *
 * - names no map: not checked — there is no geometry to check against;
 * - names the loaded map: that map's zones;
 * - names any other map: not checked (the library would need one fetch per
 *   mission to do better), and `validateMission` says so.
 */
export function zonesFor(missionMapId: string, loaded: SiteMap | null | undefined): ZoneChecks {
  if (!missionMapId) return zoneContext(undefined)
  if (loaded && loaded.map_id === missionMapId) return zoneContext(loaded)
  return { noGoZones: [], geofences: [], zonesNotChecked: true }
}

/**
 * The zones of one map. A map with no zones checks against none.
 *
 * ⚠️ With no map at all this returns `zonesNotChecked`, never geometry. It used
 * to answer with the mock site's polygons — which meant a mission naming no map
 * was measured against hard-coded demo zones and handed back a real verdict,
 * green "Ready" included. An operator reads that word before sending a
 * quadruped past a stairwell, so it may only ever be earned against the zones
 * of the map the mission is actually planned on. Audit 2026-11-18 §4.2.
 *
 * Nothing in this module may import from `@/mocks`; floorCells.test.ts asserts
 * that directly, because the type checker cannot tell demo geometry from real.
 */
export function zoneContext(map: Pick<SiteMap, 'zones'> | null | undefined): ZoneChecks {
  if (!map) return { noGoZones: [], geofences: [], zonesNotChecked: true }
  const points = (polygon: [number, number][]) => polygon.map(([x_m, y_m]) => ({ x_m, y_m }))
  return {
    noGoZones: map.zones.filter((z) => z.kind === 'no_go').map((z) => ({ id: z.zone_id, label: z.label, points: points(z.polygon) })),
    geofences: map.zones.filter((z) => z.kind === 'geofence').map((z) => points(z.polygon)),
  }
}

/** A mission's checks as the library list shows them: against its own map when
 * that is the loaded one, otherwise "not checked" (see `zonesFor`). */
export function checkAgainstLoadedMap(
  mission: MissionLibraryEntry, loaded: SiteMap | undefined, robotType: RobotType | null,
): MissionValidation {
  return validateMission(mission, { ...zonesFor(mission.map_id, loaded), robotType })
}
