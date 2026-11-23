import { describe, expect, it } from 'vitest'
import type { RobotBridgeInfo, RobotState } from '@/types'
import { mockMapReadyDone, mockMapReadyRefusal } from './mockMapReady'

const SURVEY = 'survey-20261120-113333-2881'
const HASH = 'a'.repeat(64)

const bridge = (over: Partial<RobotBridgeInfo> = {}): RobotBridgeInfo => ({
  bridge_id: 'b', schema_version: '0.0.29', last_heartbeat_at: null, mission_active: false,
  nav_map_id: 'map-old', nav_map_hash: 'b'.repeat(64), nav_localised: true, disk_free_gb: 10,
  recordings: [{ survey_id: SURVEY, bytes: 4_000_000_000, has_bag: true, has_cameras: true, keep: false, processing: false, started_at: null }],
  ...over,
})
const robot = (over: Partial<Pick<RobotState, 'abstract_state' | 'bridge' | 'nav_goal'>> = {}) =>
  ({ abstract_state: 'STAND' as const, bridge: bridge(), nav_goal: null, ...over })

describe('the mock bridge refuses the map ready commands as the bridge does', () => {
  it('refuses Use this map and Move to site unless idle', () => {
    const use = { map_id: 'map-new', floor_index: 0, map_hash: HASH }
    expect(mockMapReadyRefusal(robot(), 'USE_NAV_MAP', use, false)).toBeNull()
    expect(mockMapReadyRefusal(robot({ abstract_state: 'E_STOP' }), 'USE_NAV_MAP', use, false)).toMatch(/^REJECTED_ESTOP/)
    expect(mockMapReadyRefusal(robot(), 'SET_SITE', { site_id: 'site-b' }, true)).toMatch(/^REJECTED_RUN_ACTIVE/)
    expect(mockMapReadyRefusal(robot(), 'USE_NAV_MAP', { map_id: 'm', map_hash: 'nope' }, false)).toMatch(/^REJECTED_INVALID_PARAMS/)
    expect(mockMapReadyRefusal(robot(), 'SET_SITE', { site_id: 'a/b' }, false)).toMatch(/^REJECTED_INVALID_PARAMS/)
  })

  it('refuses a recording it does not have, one with no bag, and a skip with nothing processing', () => {
    expect(mockMapReadyRefusal(robot(), 'REPROCESS_SURVEY', { survey_id: 'nope' }, false)).toMatch(/^REJECTED_SURVEY_UNKNOWN/)
    const noBag = robot({ bridge: bridge({ recordings: [{ ...bridge().recordings![0], has_bag: false }] }) })
    expect(mockMapReadyRefusal(noBag, 'REPROCESS_SURVEY', { survey_id: SURVEY }, false)).toMatch(/^REJECTED_SURVEY_NO_RECORDING/)
    expect(mockMapReadyRefusal(robot(), 'SKIP_MOVING_SEARCH', { survey_id: SURVEY }, false)).toMatch(/^REJECTED_SURVEY_NOT_PROCESSING/)
    // While the mock survey is finding things that moved, Skip goes ahead.
    expect(mockMapReadyRefusal(robot(), 'SKIP_MOVING_SEARCH', { survey_id: SURVEY }, false, true)).toBeNull()
    expect(mockMapReadyRefusal(robot(), 'DELETE_SURVEY_RECORDING', { survey_id: SURVEY }, false)).toBeNull()
  })

  it('has nothing to say about other commands', () => {
    expect(mockMapReadyRefusal(robot(), 'SYNC_MAP', {}, true)).toBeNull()
  })
})

describe('a completed map ready command on the mock bridge', () => {
  it('Use this map moves the robot to the map, unplaced, and acks relocalise', () => {
    const done = mockMapReadyDone(bridge(), 'USE_NAV_MAP', { map_id: 'map-new', floor_index: 0, map_hash: HASH })
    expect(done.bridge).toMatchObject({ nav_map_id: 'map-new', nav_map_hash: HASH, nav_localised: false })
    expect(done.result).toEqual({ map_hash: HASH, relocalise: true })
  })

  it('Keep and Delete recording change the listed recording; Delete frees disk and keeps the entry', () => {
    const kept = mockMapReadyDone(bridge(), 'SET_SURVEY_KEEP', { survey_id: SURVEY, keep: true })
    expect(kept.bridge?.recordings?.[0].keep).toBe(true)
    const deleted = mockMapReadyDone(bridge(), 'DELETE_SURVEY_RECORDING', { survey_id: SURVEY })
    expect(deleted.bridge?.recordings?.[0]).toMatchObject({ survey_id: SURVEY, has_bag: false, has_cameras: false })
    expect(deleted.bridge?.recordings?.[0].bytes).toBeLessThan(4_000_000_000)
    expect(deleted.bridge?.disk_free_gb).toBeGreaterThan(10)
  })

  it('Move to site acks restarting', () => {
    expect(mockMapReadyDone(bridge(), 'SET_SITE', { site_id: 'site-b' })).toEqual({ bridge: null, result: { restarting: true } })
  })
})
