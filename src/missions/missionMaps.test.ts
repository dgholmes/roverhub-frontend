import { describe, expect, it } from 'vitest'
import { mockMaps } from '@/mocks/maps'
import type { MissionLibraryEntry, RobotState } from '@/types'
import type { SiteMap } from '@/types/maps'
import {
  filterByMap, mapChoices, mapFilterOptions, missionMapKey, missionMapOf, newMissionStart,
} from './missionMaps'

const base: SiteMap = mockMaps[0]
const map = (map_id: string, over: Partial<SiteMap> = {}): SiteMap => ({ ...base, map_id, name: map_id, ...over })
const office = map('map-office', { name: 'Office 3F', updated_at: '2026-11-10T00:00:00Z' })
const carPark = map('map-car-park', { name: 'Car park B1', updated_at: '2026-11-01T00:00:00Z' })
const draft = map('map-4f', { name: 'Office 4F', status: 'draft', updated_at: '2026-11-20T00:00:00Z' })
const archived = map('map-old', { name: 'Old survey', status: 'archived', updated_at: '2026-10-01T00:00:00Z' })

const mission = (over: Partial<MissionLibraryEntry> = {}): MissionLibraryEntry => ({
  mission_id: 'm', name: 'M', type: 'patrol', kind: 'route', version: 1, creator: 'x', updated_at: '2026-11-01T00:00:00Z',
  map_id: office.map_id, site_id: 'site-a', waypoints: [], segments: [], ...over,
})
const robot = (robot_id: string, nav_map_id: string | null | undefined): RobotState =>
  ({ robot_id, name: robot_id, bridge: nav_map_id === undefined ? null : { nav_map_id } } as unknown as RobotState)

describe('missionMapOf: the map a mission card names', () => {
  const maps = [office, carPark]

  it("is the mission's own map from the site's list", () => {
    expect(missionMapOf(mission(), maps)).toEqual({ status: 'map', map: office })
    expect(missionMapOf(mission({ map_id: carPark.map_id }), maps)).toEqual({ status: 'map', map: carPark })
  })

  it('is "none" for a route that names no map, and for any program (a program has no map frame)', () => {
    expect(missionMapOf(mission({ map_id: '' }), maps)).toEqual({ status: 'none' })
    expect(missionMapOf(mission({ kind: 'program', map_id: office.map_id }), maps)).toEqual({ status: 'none' })
  })

  it('is "missing" when the id is not in the list', () => {
    expect(missionMapOf(mission({ map_id: 'map-deleted' }), maps)).toEqual({ status: 'missing' })
  })

  it('is "unknown", never "missing", while the list has not loaded', () => {
    expect(missionMapOf(mission(), null)).toEqual({ status: 'unknown' })
  })
})

describe('the library map filter', () => {
  const maps = [office, carPark]
  const onOffice = mission({ mission_id: 'a', map_id: office.map_id })
  const onCarPark = mission({ mission_id: 'b', map_id: carPark.map_id })
  const program = mission({ mission_id: 'c', kind: 'program', map_id: office.map_id })
  const gone = mission({ mission_id: 'd', map_id: 'map-deleted' })

  it('keys each mission by its map, with every lost map under one "missing" key', () => {
    expect(missionMapKey(onOffice, maps)).toBe(`map:${office.map_id}`)
    expect(missionMapKey(program, maps)).toBe('none')
    expect(missionMapKey(gone, maps)).toBe('missing')
  })

  it('is offered only when the missions span two or more maps', () => {
    expect(mapFilterOptions([onOffice, mission({ mission_id: 'e', map_id: office.map_id })], maps)).toEqual([])
    expect(mapFilterOptions([onOffice, onCarPark], maps).map((o) => o.key)).toEqual(['all', `map:${carPark.map_id}`, `map:${office.map_id}`])
  })

  it('lists named maps by name, then "no map", then "missing map"', () => {
    const options = mapFilterOptions([gone, program, onOffice, onCarPark], maps)
    expect(options.map((o) => o.key)).toEqual(['all', `map:${carPark.map_id}`, `map:${office.map_id}`, 'none', 'missing'])
    expect(options[1]).toMatchObject({ kind: 'map', name: 'Car park B1' })
  })

  it('is not offered before the list loads: every mission would read "unknown"', () => {
    expect(mapFilterOptions([onOffice, onCarPark], null)).toEqual([])
  })

  it('filters to one map, or lets everything through', () => {
    const all = [onOffice, onCarPark, program, gone]
    expect(filterByMap(all, `map:${carPark.map_id}`, maps)).toEqual([onCarPark])
    expect(filterByMap(all, 'none', maps)).toEqual([program])
    expect(filterByMap(all, 'missing', maps)).toEqual([gone])
    expect(filterByMap(all, 'all', maps)).toEqual(all)
  })
})

describe('mapChoices: the New mission chooser', () => {
  const robots = [robot('rover-jetson', office.map_id), robot('rover-pi', carPark.map_id), robot('rover-x', null), robot('rover-y', undefined)]

  it("names the robots on each map (the bridge's nav_map_id)", () => {
    const rows = mapChoices([office, carPark], robots)
    expect(rows.find((r) => r.map.map_id === office.map_id)?.robots).toEqual(['rover-jetson'])
    expect(rows.find((r) => r.map.map_id === carPark.map_id)?.robots).toEqual(['rover-pi'])
  })

  it('shows draft and archived maps but does not let them be chosen, and says why', () => {
    const rows = mapChoices([office, draft, archived], robots)
    expect(rows.find((r) => r.map.map_id === draft.map_id)).toMatchObject({ choosable: false, reason: 'draft' })
    expect(rows.find((r) => r.map.map_id === archived.map_id)).toMatchObject({ choosable: false, reason: 'archived' })
    expect(rows.find((r) => r.map.map_id === office.map_id)).toMatchObject({ choosable: true, reason: null })
    // Active maps first, then drafts, then archived.
    expect(rows.map((r) => r.map.map_id)).toEqual([office.map_id, draft.map_id, archived.map_id])
  })
})

describe('newMissionStart: what New mission does', () => {
  it('asks when the site has two or more maps, ticking the shown map when it is active', () => {
    const start = newMissionStart([office, carPark], carPark)
    expect(start).toEqual({ kind: 'ask', defaultMapId: carPark.map_id })
  })

  it('ticks the newest active map when the shown map is not active (or not known)', () => {
    expect(newMissionStart([office, carPark, draft], draft)).toEqual({ kind: 'ask', defaultMapId: office.map_id })
    expect(newMissionStart([carPark, office], null)).toEqual({ kind: 'ask', defaultMapId: office.map_id })
  })

  it('ticks nothing when no map is active', () => {
    expect(newMissionStart([draft, archived], draft)).toEqual({ kind: 'ask', defaultMapId: null })
  })

  it('skips the question when the site has exactly one map', () => {
    expect(newMissionStart([office], office)).toEqual({ kind: 'use', mapId: office.map_id })
    // A site whose only map is a draft keeps today's answer: drawn on it, as
    // the editor and Run now say it cannot run until the map is active.
    expect(newMissionStart([draft], draft)).toEqual({ kind: 'use', mapId: draft.map_id })
  })

  it('draws on the plain grid when the site has no maps', () => {
    expect(newMissionStart([], null)).toEqual({ kind: 'use', mapId: '' })
  })

  it("keeps today's behaviour (the shown map) when the list could not be had", () => {
    expect(newMissionStart(null, office)).toEqual({ kind: 'use', mapId: office.map_id })
    expect(newMissionStart(null, null)).toEqual({ kind: 'use', mapId: '' })
  })
})
