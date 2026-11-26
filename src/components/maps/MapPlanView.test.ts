// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mockMaps } from '@/mocks/maps'
import type { RobotState } from '@/types'
import type { SiteMap } from '@/types/maps'
import { robotOnFloor } from './MapPlanView'

const map = mockMaps[0]
const floor = map.floors[0]
const robot = (over: { navMap?: string | null; hash?: string | null; provider?: string; quality?: string } = {}) => ({
  bridge: { nav_map_id: over.navMap === undefined ? map.map_id : over.navMap, nav_map_hash: over.hash ?? floor.content_hash },
  position: { provider: over.provider ?? 'slam', quality: over.quality ?? 'localized' },
}) as unknown as Pick<RobotState, 'bridge' | 'position'>

// The Map workspace draws a robot at its live position only where that
// position means something on the floor shown.
describe('robotOnFloor', () => {
  it("draws a robot whose nav stack runs this map, at its nav stack's position", () => {
    expect(robotOnFloor(robot(), map, floor.index)).toBe(true)
  })

  it('leaves out a robot on another map or none, odometry-only, or lost', () => {
    expect(robotOnFloor(robot({ navMap: 'map-other' }), map, floor.index)).toBe(false)
    expect(robotOnFloor(robot({ navMap: null }), map, floor.index)).toBe(false)
    expect(robotOnFloor(robot({ provider: 'dead_reckoning' }), map, floor.index)).toBe(false)
    expect(robotOnFloor(robot({ quality: 'lost' }), map, floor.index)).toBe(false)
  })

  it('on a map with several floors, draws it only on the floor whose files it runs', () => {
    const two: SiteMap = { ...map, floors: [floor, { ...floor, index: 1, content_hash: 'b'.repeat(64) }] }
    expect(robotOnFloor(robot(), two, 0)).toBe(true)
    expect(robotOnFloor(robot(), two, 1)).toBe(false)
  })
})
