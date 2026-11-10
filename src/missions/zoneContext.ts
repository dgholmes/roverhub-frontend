import { dataProvider } from '@/lib/realtime/dataProvider'
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
 * - names no map: the plain grid, so the provider's sample site, as the canvas
 *   draws it (the mock site in mock mode; on the real backend, not checked);
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
 * The zones of one map, which are the ones the canvas draws. A map with no
 * zones checks against none. With no map at all (a mission that names none)
 * it checks against the provider's sample site, as the canvas draws it: the
 * mock site in mock mode. The real backend has no sample site, so there such a
 * mission is checked against nothing and says so (`zonesNotChecked`), rather
 * than being flagged, or cleared, by zones nobody can see.
 */
export function zoneContext(map: Pick<SiteMap, 'zones'> | null | undefined): ZoneChecks {
  if (!map) {
    const sample = dataProvider.sampleSite().zones
    return sample.length > 0 ? zoneContext({ zones: [...sample] }) : { noGoZones: [], geofences: [], zonesNotChecked: true }
  }
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
