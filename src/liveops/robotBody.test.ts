import { describe, expect, it } from 'vitest'
import { ROBOT_BODY_LENGTH_M, ROBOT_BODY_WIDTH_M, robotBodyCorners } from './robotBody'

const close = (pts: [number, number][], want: [number, number][]) =>
  pts.forEach(([x, y], i) => { expect(x).toBeCloseTo(want[i][0], 9); expect(y).toBeCloseTo(want[i][1], 9) })

describe('robotBodyCorners', () => {
  it('is the 0.65 x 0.35 m body', () => {
    expect([ROBOT_BODY_LENGTH_M, ROBOT_BODY_WIDTH_M]).toEqual([0.65, 0.35])
  })

  it('lies along +x at heading 0, centred on the position', () => {
    close(robotBodyCorners(1, 2, 0), [[1.325, 2.175], [0.675, 2.175], [0.675, 1.825], [1.325, 1.825]])
  })

  it('turns anticlockwise: at 90 degrees the nose points along +y', () => {
    // Front-left corner: 0.325 forward (+y), 0.175 left (-x).
    close(robotBodyCorners(0, 0, 90), [[-0.175, 0.325], [-0.175, -0.325], [0.175, -0.325], [0.175, 0.325]])
  })

  it('keeps its size whatever the heading', () => {
    const [a, b, c] = robotBodyCorners(3, -1, 37)
    expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeCloseTo(0.65, 9)
    expect(Math.hypot(b[0] - c[0], b[1] - c[1])).toBeCloseTo(0.35, 9)
  })
})
