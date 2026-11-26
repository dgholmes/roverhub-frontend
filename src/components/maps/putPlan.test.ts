import { describe, expect, it } from 'vitest'
import { initialRobots } from '@/mocks/mockRobots'
import type { RobotState } from '@/types'
import { actionable, putPlan } from './putPlan'

const FLOOR = 'f'.repeat(64)
const OLD = '0'.repeat(64)
const NOW = Date.parse('2026-11-26T05:00:00Z')

/** A live, standing robot on a 0.0.29 bridge, set up for `navMap` with `hash`. */
const robot = (navMap: string | null, hash: string | null, over: Partial<RobotState> = {}, schema = '0.0.29') => ({
  ...initialRobots[1], abstract_state: 'STAND', control_owner: null, active_run: null, nav_goal: null,
  connectivity: { ...initialRobots[1].connectivity, bridge_state: 'connected' },
  bridge: { ...initialRobots[1].bridge!, schema_version: schema, last_heartbeat_at: new Date(NOW).toISOString(), nav_map_id: navMap, nav_map_hash: hash },
  ...over,
}) as RobotState

const plan = (r: RobotState, floorHash: string | null = FLOOR) => putPlan(r, 'map-office', floorHash, NOW)

// The chooser offers what the Robot maps rows offered when each carried its
// own Send / Use buttons: these pin that it is the same.
describe('what putting a floor on a robot would do', () => {
  it('nothing for a robot with this version', () => {
    expect(plan(robot('map-office', FLOOR))).toMatchObject({ row: 'same', act: null, state: 'upToDate' })
  })

  it('SYNC_MAP (send) for a robot on this map whose files differ', () => {
    expect(plan(robot('map-office', OLD))).toMatchObject({ row: 'differs', act: 'send', block: null, state: 'update' })
  })

  it('USE_NAV_MAP (use) for a robot on another map, or on none', () => {
    expect(plan(robot('map-yard', OLD))).toMatchObject({ row: 'otherMap', act: 'use', block: null, state: 'switch' })
    expect(plan(robot(null, null))).toMatchObject({ row: 'noMap', act: 'use', block: null, state: 'switch' })
  })

  it('nothing for a robot on this map that reports no version, or on a floor with none', () => {
    expect(plan(robot('map-office', null))).toMatchObject({ row: 'unknown', act: null, state: 'unknown' })
    expect(plan(robot('map-yard', OLD), null)).toMatchObject({ act: null, state: 'unknown' })
  })

  it.each([
    ['offline', { connectivity: { ...initialRobots[1].connectivity, bridge_state: 'offline' } }, 'offline', 'offline'],
    ['in E-Stop', { abstract_state: 'E_STOP' }, 'estop', 'busy'],
    ['on a mission', { abstract_state: 'AUTO_MISSION' }, 'mission', 'busy'],
    ['walking', { nav_goal: { goal_id: 'g', x_m: 0, y_m: 0, yaw_rad: null, map_id: 'map-office', state: 'active', reason: null, updated_at: '' } }, 'walking', 'busy'],
  ] as const)('is held back while the robot is %s', (_, over, block, state) => {
    for (const r of [robot('map-office', OLD, over as Partial<RobotState>), robot('map-yard', OLD, over as Partial<RobotState>)]) {
      const p = plan(r)
      expect(p).toMatchObject({ block, state })
      expect(actionable(p)).toBe(false)
    }
  })

  it("can't take it on a bridge too old for the command: 0.0.26 for a send, 0.0.29 for a switch", () => {
    expect(plan(robot('map-office', OLD, {}, '0.0.25'))).toMatchObject({ act: 'send', block: 'oldBridge', state: 'cannot' })
    expect(plan(robot('map-office', OLD, {}, '0.0.26'))).toMatchObject({ act: 'send', block: null, state: 'update' })
    expect(plan(robot('map-yard', OLD, {}, '0.0.28'))).toMatchObject({ act: 'use', block: 'oldBridge', state: 'cannot' })
  })
})
