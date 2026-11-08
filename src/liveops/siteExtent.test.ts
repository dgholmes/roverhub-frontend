import { describe, expect, it } from 'vitest'
import { mockMaps } from '@/mocks/maps'
import { boundsForFloor } from './mapFloor'
import { sitePoints } from './siteExtent'
import type { RobotState } from '@/types'

const robot = { position: { x_m: 1, y_m: 2 } } as RobotState

describe('sitePoints', () => {
  it('is the same with no floor as with none given', () => {
    expect(sitePoints(robot, undefined, undefined)).toEqual(sitePoints(robot))
  })

  it('adds both corners of the floor to what is already fitted', () => {
    const floor = mockMaps[0].floors[0]
    const [sw, ne] = boundsForFloor(floor)
    const without = sitePoints(robot)
    const withFloor = sitePoints(robot, undefined, floor)
    expect(withFloor).toHaveLength(without.length + 2)
    expect(withFloor).toEqual(expect.arrayContaining([sw, ne]))
    expect(withFloor.slice(0, without.length)).toEqual(without)
  })
})
