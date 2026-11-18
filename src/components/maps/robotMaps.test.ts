import { beforeAll, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import type { Command, RobotState } from '@/types'
import { robotMapMatch, robotsForMap, syncBlock, syncOutcomeOf } from './robotMaps'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)
const t = i18n.t.bind(i18n)

/** A live, standing, 0.0.26 robot on map-office running hash A. */
const robot = (over: Partial<RobotState> = {}, bridge: Partial<NonNullable<RobotState['bridge']>> = {}): RobotState => ({
  ...initialRobots[1], robot_id: 'rover-jetson', name: 'rover-jetson', abstract_state: 'STAND', control_owner: null,
  active_run: null, nav_goal: null,
  connectivity: { ...initialRobots[1].connectivity, bridge_state: 'connected' },
  bridge: {
    ...initialRobots[1].bridge!, schema_version: '0.0.26', last_heartbeat_at: new Date().toISOString(),
    nav_map_id: 'map-office', nav_map_hash: A, ...bridge,
  },
  ...over,
})

const command = (over: Partial<Command>): Command => ({
  command_id: 'c1', robot_id: 'rover-jetson', type: 'SYNC_MAP', label: 'Send map to robot',
  stages: [], current_stage: 'execution_completed', initiated_by: 'operator-dev', ...over,
})

beforeAll(async () => { await i18n.changeLanguage('en') })

describe('robotMapMatch', () => {
  it('is same when the robot hashes to the floor, differs when not', () => {
    expect(robotMapMatch(robot(), 'map-office', A)).toBe('same')
    expect(robotMapMatch(robot(), 'map-office', B)).toBe('differs')
  })

  it('is unknown with no hash on either side', () => {
    expect(robotMapMatch(robot({}, { nav_map_hash: null }), 'map-office', A)).toBe('unknown')
    expect(robotMapMatch(robot({}, { nav_map_hash: undefined }), 'map-office', A)).toBe('unknown')
    expect(robotMapMatch(robot(), 'map-office', null)).toBe('unknown')
  })

  it('is otherMap for a robot set up for another map, whatever its hash', () => {
    expect(robotMapMatch(robot({}, { nav_map_id: 'map-yard' }), 'map-office', A)).toBe('otherMap')
  })
})

describe('robotsForMap', () => {
  it('lists robots set up for the map or reporting any hash', () => {
    const rs = [
      robot({ robot_id: 'on-map' }, { nav_map_hash: null }),
      robot({ robot_id: 'other' }, { nav_map_id: 'map-yard' }),
      robot({ robot_id: 'no-nav' }, { nav_map_id: null, nav_map_hash: null }),
    ]
    expect(robotsForMap(rs, 'map-office').map((r) => r.robot_id)).toEqual(['on-map', 'other'])
  })
})

describe('syncBlock', () => {
  it('is null for a live robot doing nothing', () => {
    expect(syncBlock(robot())).toBeNull()
  })

  it('says offline for a dropped or silent bridge', () => {
    expect(syncBlock(robot({ connectivity: { ...robot().connectivity, bridge_state: 'offline' } }))).toBe('offline')
    expect(syncBlock(robot({}, { last_heartbeat_at: new Date(Date.now() - 5 * 60_000).toISOString() }))).toBe('offline')
  })

  it('says oldBridge below 0.0.26, which would refuse SYNC_MAP as unknown', () => {
    expect(syncBlock(robot({}, { schema_version: '0.0.25' }))).toBe('oldBridge')
    expect(syncBlock(robot({}, { schema_version: null }))).toBe('oldBridge')
  })

  it('says estop, mission or walking', () => {
    expect(syncBlock(robot({ abstract_state: 'E_STOP' }))).toBe('estop')
    expect(syncBlock(robot({ abstract_state: 'AUTO_MISSION' }))).toBe('mission')
    expect(syncBlock(robot({ control_owner: 'mission:run-1' }))).toBe('mission')
    expect(syncBlock(robot({ nav_goal: {
      goal_id: 'g', x_m: 0, y_m: 0, yaw_rad: null, map_id: 'map-office', state: 'active', reason: null, updated_at: '',
    } }))).toBe('walking')
  })
})

describe('syncOutcomeOf', () => {
  it('reads the result on success, with relocalise', () => {
    expect(syncOutcomeOf(t, { result: 'completed', command: command({ result: { map_hash: A, changed: ['localisation'], relocalise: true } }) }))
      .toEqual({ ok: true, relocalise: true, mapHash: A })
    expect(syncOutcomeOf(t, { result: 'completed', command: command({ result: { map_hash: A, changed: ['planning'], relocalise: false } }) }))
      .toEqual({ ok: true, relocalise: false, mapHash: A })
  })

  it("words a known refusal, and keeps the bridge's detail beside it", () => {
    const out = syncOutcomeOf(t, { result: 'failed', command: command({
      current_stage: 'execution_failed', failure_reason: 'REJECTED_NAV_MAP_MISMATCH: this robot is set up for map map-yard',
    }) })
    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.reason).toBe(t('command.refusal.code.REJECTED_NAV_MAP_MISMATCH'))
    expect(out.detail).toBe('this robot is set up for map map-yard')
  })

  it('shows a plain failure as it came, and says when the robot never answered', () => {
    const plain = syncOutcomeOf(t, { result: 'failed', command: command({
      current_stage: 'execution_failed', failure_reason: 'sending the map failed: could not download /maps/m: 503',
    }) })
    expect(plain).toEqual({ ok: false, reason: 'could not download /maps/m: 503', detail: null })
    const lost = syncOutcomeOf(t, { result: 'unknown', command: command({ current_stage: 'timed_out' }) })
    expect(lost).toEqual({ ok: false, reason: t('missions.maps.robots.lost'), detail: null })
  })
})
