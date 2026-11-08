import { describe, expect, it } from 'vitest'
import { mockMaps } from '@/mocks/maps'
import type { SiteMap } from '@/types/maps'
import { mapPropsFor, resolveMissionMap } from './useMissionMap'

const site: SiteMap = mockMaps[0]
const other: SiteMap = { ...site, map_id: 'map-older', status: 'archived' }

// resolveMissionMap decides what the editor does with a mission's map_id. The
// hazard is the second row: a mission can name a map that was deleted or
// replaced, and an empty canvas looks exactly like open floor.
describe('resolveMissionMap', () => {
  it('uses the site\'s map when the mission names it, without waiting for a fetch', () => {
    expect(resolveMissionMap({ missionMapId: site.map_id, siteMap: site, siteLoaded: true, fetched: undefined }))
      .toEqual({ status: 'map', map: site })
  })

  it('uses a map it fetched when that is not the site\'s (a mission on an older survey)', () => {
    expect(resolveMissionMap({ missionMapId: 'map-older', siteMap: site, siteLoaded: true, fetched: other }))
      .toEqual({ status: 'map', map: other })
  })

  it('is MISSING, not an empty canvas, when the map is gone but the site has one', () => {
    expect(resolveMissionMap({ missionMapId: 'map-deleted', siteMap: site, siteLoaded: true, fetched: null }))
      .toEqual({ status: 'missing' })
  })

  it('waits, and offers no canvas, until the fetch answers', () => {
    expect(resolveMissionMap({ missionMapId: 'map-deleted', siteMap: site, siteLoaded: true, fetched: undefined }))
      .toEqual({ status: 'loading' })
  })

  it('waits for the site\'s map before calling a map missing: "no map" and "not loaded yet" look alike', () => {
    expect(resolveMissionMap({ missionMapId: 'map-x', siteMap: undefined, siteLoaded: false, fetched: null }))
      .toEqual({ status: 'loading' })
  })

  it('plans on the plain grid, as before, when the site has no surveyed map at all', () => {
    expect(resolveMissionMap({ missionMapId: 'map-site-a', siteMap: undefined, siteLoaded: true, fetched: null }))
      .toEqual({ status: 'none' })
  })

  it('refuses, rather than guessing, when the map could not be fetched', () => {
    expect(resolveMissionMap({ missionMapId: 'map-x', siteMap: site, siteLoaded: true, fetched: 'error' }))
      .toEqual({ status: 'unavailable' })
    expect(resolveMissionMap({ missionMapId: 'map-x', siteMap: undefined, siteLoaded: true, fetched: 'error' }))
      .toEqual({ status: 'unavailable' })
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

  it('refuses while loading and when unavailable, offering nothing: the map may still turn up', () => {
    expect(mapPropsFor({ status: 'loading' }, site)).toEqual({ map: null, refusal: 'loading' })
    expect(mapPropsFor({ status: 'unavailable' }, site)).toEqual({ map: null, refusal: 'unavailable' })
  })
})
