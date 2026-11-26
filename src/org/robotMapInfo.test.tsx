import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { mockMaps } from '@/mocks/maps'
import { initialRobots } from '@/mocks/mockRobots'
import { hashForMap } from '@/app/routes'
import { RobotMapSummary } from '@/components/org/RobotMapSummary'
import type { RobotBridgeInfo, RobotState } from '@/types'
import type { SiteMap } from '@/types/maps'
import { robotMapInfo, robotsOnMap } from './robotMapInfo'

const VENUE = mockMaps[0]
const HASH = VENUE.floors[0].content_hash!
const TWO_FLOORS: SiteMap = {
  ...VENUE, map_id: 'map-two', name: 'Two floors',
  floors: [{ ...VENUE.floors[0], index: 0, content_hash: 'a'.repeat(64) }, { ...VENUE.floors[0], index: 1, content_hash: 'b'.repeat(64) }],
}
const robot = (bridge: Partial<RobotBridgeInfo>): RobotState => ({
  ...initialRobots[0], site_id: VENUE.site_id, bridge: { ...initialRobots[0].bridge!, ...bridge },
})

beforeAll(async () => { await i18n.changeLanguage('en') })

describe('a robot’s map (Fleet’s Map row, Sites’ Robots tab)', () => {
  it('no map: a robot set up for none', () => {
    expect(robotMapInfo(robot({ nav_map_id: null, nav_localised: null }), [VENUE])).toEqual({ kind: 'noMap', placed: null })
  })

  it('same version, placed', () => {
    const info = robotMapInfo(robot({ nav_map_id: VENUE.map_id, nav_map_hash: HASH, nav_localised: true }), [VENUE])
    expect(info).toMatchObject({ kind: 'onMap', version: 'same', placed: true })
  })

  it('differs, not placed', () => {
    const info = robotMapInfo(robot({ nav_map_id: VENUE.map_id, nav_map_hash: 'f'.repeat(64), nav_localised: false }), [VENUE])
    expect(info).toMatchObject({ kind: 'onMap', version: 'differs', placed: false })
  })

  it('version unknown when the robot reports no hash; placed unknown is null, never false', () => {
    const info = robotMapInfo(robot({ nav_map_id: VENUE.map_id, nav_map_hash: null, nav_localised: null }), [VENUE])
    expect(info).toMatchObject({ kind: 'onMap', version: 'unknown', placed: null })
  })

  it('same when the hash matches any floor, since the bridge does not say which', () => {
    const info = robotMapInfo(robot({ nav_map_id: 'map-two', nav_map_hash: 'b'.repeat(64) }), [TWO_FLOORS])
    expect(info).toMatchObject({ kind: 'onMap', version: 'same' })
  })

  it('elsewhere: a map this site does not have (or whose list is not in yet)', () => {
    expect(robotMapInfo(robot({ nav_map_id: 'map-gone' }), [VENUE])).toMatchObject({ kind: 'elsewhere', mapId: 'map-gone' })
    expect(robotMapInfo(robot({ nav_map_id: VENUE.map_id }), null)).toMatchObject({ kind: 'elsewhere', mapId: VENUE.map_id })
  })

  it('robotsOnMap picks the robots set up for a map', () => {
    const a = robot({ nav_map_id: VENUE.map_id }), b = robot({ nav_map_id: 'other' })
    expect(robotsOnMap([a, b], VENUE.map_id)).toEqual([a])
  })

  describe('as the row shows it', () => {
    const html = (r: RobotState, maps: SiteMap[] | null = [VENUE]) => renderToStaticMarkup(<RobotMapSummary robot={r} maps={maps} />)

    it('links the map name to the Map workspace, with Same version and Placed', () => {
      const out = html(robot({ nav_map_id: VENUE.map_id, nav_map_hash: HASH, nav_localised: true }))
      expect(out).toContain(`href="${hashForMap(VENUE.site_id, VENUE.map_id)}"`)
      expect(out).toContain('Venue survey')
      expect(out).toContain('Same version')
      expect(out).toContain('Placed')
    })

    it('Differs and Not placed', () => {
      const out = html(robot({ nav_map_id: VENUE.map_id, nav_map_hash: 'f'.repeat(64), nav_localised: false }))
      expect(out).toContain('Differs')
      expect(out).toContain('Not placed')
    })

    it('No map, with no placed badge', () => {
      const out = html(robot({ nav_map_id: null, nav_localised: null }))
      expect(out).toContain('No map')
      expect(out).not.toContain('Placed')
    })

    it('a map the site does not have is named by id, unlinked', () => {
      const out = html(robot({ nav_map_id: 'map-gone' }))
      expect(out).toContain('map-gone · not at this site')
      expect(out).not.toContain('href=')
    })
  })
})
