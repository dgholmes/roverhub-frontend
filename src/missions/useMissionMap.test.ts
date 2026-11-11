import { describe, expect, it } from 'vitest'
import { mockMaps } from '@/mocks/maps'
import type { SiteMap } from '@/types/maps'
import { mapPropsFor, resolveMissionMap } from './useMissionMap'

const site: SiteMap = mockMaps[0]
const other: SiteMap = { ...site, map_id: 'map-older', status: 'archived' }

// resolveMissionMap decides what the editor does with a mission's map_id. The
// hazard is the "missing" rows: a mission can name a map that was deleted or
// replaced, and an empty canvas looks exactly like open floor.
describe('resolveMissionMap', () => {
  it("uses the site's map when the mission names it, without waiting for a fetch", () => {
    expect(resolveMissionMap({ missionMapId: site.map_id, siteMap: site, fetched: undefined }))
      .toEqual({ status: 'map', map: site })
  })

  it("uses a map it fetched when that is not the site's (a mission on an older survey)", () => {
    expect(resolveMissionMap({ missionMapId: 'map-older', siteMap: site, fetched: other }))
      .toEqual({ status: 'map', map: other })
  })

  it('is MISSING when the map named is gone, and the site has another', () => {
    expect(resolveMissionMap({ missionMapId: 'map-deleted', siteMap: site, fetched: null }))
      .toEqual({ status: 'missing' })
  })

  it("is MISSING when the map named is gone and it was the site's only one", () => {
    // The case the rule exists for: delete the only map and the site has none
    // left, which must not read as "this site was never surveyed".
    expect(resolveMissionMap({ missionMapId: 'map-deleted', siteMap: undefined, fetched: null }))
      .toEqual({ status: 'missing' })
  })

  it('plans on the plain grid only for a mission that names no map at all', () => {
    expect(resolveMissionMap({ missionMapId: '', siteMap: undefined, fetched: undefined })).toEqual({ status: 'none' })
    expect(resolveMissionMap({ missionMapId: '', siteMap: site, fetched: undefined })).toEqual({ status: 'none' })
  })

  it('is loading, not missing, while the map is still being fetched', () => {
    expect(resolveMissionMap({ missionMapId: 'map-slow', siteMap: site, fetched: undefined })).toEqual({ status: 'loading' })
    expect(resolveMissionMap({ missionMapId: 'map-slow', siteMap: undefined, fetched: undefined })).toEqual({ status: 'loading' })
  })

  it('says unavailable, not missing, when the fetch failed, so an outage is not a deletion', () => {
    expect(resolveMissionMap({ missionMapId: 'map-x', siteMap: site, fetched: 'error' })).toEqual({ status: 'unavailable' })
    expect(resolveMissionMap({ missionMapId: 'map-x', siteMap: undefined, fetched: 'error' })).toEqual({ status: 'unavailable' })
  })
})

// The wiring between the two: what MissionEditor hands MissionMapEditor. `null`
// is the only value that refuses, so every state that is not a known map or
// "this site has none" must produce it.
describe('mapPropsFor', () => {
  it('hands over the map to plan on', () => {
    expect(mapPropsFor({ status: 'map', map: site }, site)).toEqual({ map: site })
  })

  it('hands over undefined, the plain grid, only when the site has no map', () => {
    expect(mapPropsFor({ status: 'none' }, undefined)).toEqual({ map: undefined })
  })

  it('refuses a missing map, and offers the site map instead', () => {
    expect(mapPropsFor({ status: 'missing' }, site)).toEqual({ map: null, replacement: site })
  })

  it('refuses while loading, offering nothing: the map may still turn up', () => {
    expect(mapPropsFor({ status: 'loading' }, site)).toEqual({ map: null, refusal: 'loading' })
  })

  it('refuses when unavailable, and offers the site map too, so a failed load is not a dead end', () => {
    expect(mapPropsFor({ status: 'unavailable' }, site)).toEqual({ map: null, refusal: 'unavailable', replacement: site })
  })
})
