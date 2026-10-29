import { describe, expect, it } from 'vitest'
import { gridLines } from './mapGrid'

describe('gridLines', () => {
  it('draws one line per step in each direction, spanning the bounds', () => {
    const lines = gridLines([[0, 0], [20, 30]], 10)
    // x = 0, 10, 20, 30 (vertical) and y = 0, 10, 20 (horizontal)
    expect(lines).toHaveLength(7)
    expect(lines[0]).toEqual([[0, 0], [20, 0]])
    expect(lines[3]).toEqual([[0, 30], [20, 30]])
    expect(lines[4]).toEqual([[0, 0], [0, 30]])
    expect(lines[6]).toEqual([[20, 0], [20, 30]])
  })

  it('starts on the first multiple of step inside the bounds', () => {
    const lines = gridLines([[-15, -15], [15, 15]], 10)
    expect(lines.map((l) => l[0][1]).slice(0, 3)).toEqual([-10, 0, 10])
  })

  it('is the 122-line grid MapCanvas draws at its default bounds', () => {
    expect(gridLines([[-300, -300], [300, 300]], 10)).toHaveLength(122)
  })

  it('draws nothing for a step that would never end', () => {
    expect(gridLines([[0, 0], [10, 10]], 0)).toEqual([])
    expect(gridLines([[0, 0], [10, 10]], -5)).toEqual([])
  })
})
