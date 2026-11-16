import { describe, expect, it } from 'vitest'
import { parsePgm } from '@/missions/floorCells'
import {
  PGM_FREE, PGM_OCCUPIED, PGM_UNKNOWN, PlanningEdit, cellOf, cellsAlongStroke, cellsInDisc, cellsInRect, encodePgm, paints,
  pgmIndex, type FloorFrame,
} from './gridEdit'

// 10 x 8 cells of 10 cm from (1, 2): x 1..2, y 2..2.8.
const frame: FloorFrame = { w: 10, h: 8, res: 0.1, origin: [1, 2] }
const F = PGM_FREE, O = PGM_OCCUPIED, U = PGM_UNKNOWN

describe('cells under a map point', () => {
  it('counts columns from the left and rows from the bottom, and stores rows top first', () => {
    expect(cellOf(frame, 1.05, 2.05)).toEqual({ i: 0, j: 0 })
    expect(cellOf(frame, 1.95, 2.75)).toEqual({ i: 9, j: 7 })
    expect(cellOf(frame, 0.99, 2.5)).toBeNull()
    expect(cellOf(frame, 1.5, 2.81)).toBeNull()
    // The bottom-left cell is the first of the LAST stored row.
    expect(pgmIndex(frame, 0, 0)).toBe(70)
    expect(pgmIndex(frame, 9, 7)).toBe(9)
  })

  it('takes every cell whose centre is in the round brush, and always the one under it', () => {
    expect(cellsInDisc(frame, 1.55, 2.45, 1)).toEqual([pgmIndex(frame, 5, 4)])
    const three = cellsInDisc(frame, 1.55, 2.45, 3)
    expect(three).toHaveLength(9)
    expect(new Set(three).size).toBe(9)
    // Clipped at the edge, never negative or past the grid.
    expect(cellsInDisc(frame, 1.0, 2.0, 5).every((k) => k >= 0 && k < 80)).toBe(true)
  })

  it('fills the gaps of a fast drag', () => {
    const cells = cellsAlongStroke(frame, [1.05, 2.05], [1.95, 2.05], 1)
    expect(cells.sort((a, b) => a - b)).toEqual([70, 71, 72, 73, 74, 75, 76, 77, 78, 79])
  })

  it('takes the cells whose centres are inside a box dragged either way', () => {
    const a: [number, number] = [1.12, 2.12], b: [number, number] = [1.38, 2.28]
    const cells = cellsInRect(frame, a, b)
    expect(cellsInRect(frame, b, a)).toEqual(cells)
    // Centres 1.15, 1.25, 1.35 across and 2.15, 2.25 up.
    expect(cells.sort((x, y) => x - y)).toEqual([pgmIndex(frame, 1, 2), pgmIndex(frame, 2, 2), pgmIndex(frame, 3, 2),
      pgmIndex(frame, 1, 1), pgmIndex(frame, 2, 1), pgmIndex(frame, 3, 1)].sort((x, y) => x - y))
  })
})

describe('painting the planning grid', () => {
  const grid = () => {
    const px = new Uint8Array(80).fill(F)
    px[0] = O; px[1] = O; px[2] = U; px[3] = O
    return px
  }

  it('Erase frees blocked cells, Restore blocks free ones, and neither touches unseen ground', () => {
    expect(paints('erase', O)).toBe(true)
    expect(paints('erase', F)).toBe(false)
    expect(paints('erase', U)).toBe(false)
    expect(paints('restore', F)).toBe(true)
    expect(paints('restore', O)).toBe(false)
    expect(paints('restore', U)).toBe(false)
    const edit = new PlanningEdit(frame, grid())
    expect(edit.apply([0, 1, 2, 3, 4], 'erase')).toBe(3)
    expect([...edit.pixels.slice(0, 5)]).toEqual([F, F, U, F, F])
    edit.end()
    expect(edit.apply([4, 5], 'restore')).toBe(2)
    edit.end()
    expect([...edit.pixels.slice(0, 6)]).toEqual([F, F, U, F, O, O])
  })

  it('undoes one whole stroke at a time, back to the grid as loaded', () => {
    const start = grid()
    const edit = new PlanningEdit(frame, start)
    edit.begin()
    edit.apply([0], 'erase')
    edit.apply([1], 'erase')
    edit.end()
    edit.apply([10, 11], 'restore')
    edit.end()
    expect(edit.strokes).toBe(2)
    expect(edit.changedCells()).toBe(4)
    edit.undo()
    expect(edit.pixels[10]).toBe(F)
    expect(edit.pixels[0]).toBe(F)
    edit.undo()
    expect([...edit.pixels]).toEqual([...start])
    expect(edit.undo()).toBeNull()
    expect(edit.changedCells()).toBe(0)
  })

  it('keeps no stroke that changed nothing, or that was painted back within itself', () => {
    const edit = new PlanningEdit(frame, grid())
    edit.apply([2], 'erase')        // unknown: untouched
    expect(edit.end()).toBeNull()
    edit.apply([0], 'erase')
    edit.apply([0], 'restore')
    expect(edit.end()).toBeNull()
    expect(edit.strokes).toBe(0)
  })

  it('reports its cells as a diff over the grid it loaded, and writes a PGM parsePgm reads back', () => {
    const edit = new PlanningEdit(frame, grid())
    edit.apply([3, 40], 'erase')
    edit.apply([41], 'restore')
    edit.end()
    const d = edit.diff()
    expect([...d.indices]).toEqual([3, 41])
    expect([...d.values]).toEqual([F, O])
    expect(edit.base()[3]).toBe(O)
    const back = parsePgm(edit.encode())!
    expect(back.width).toBe(10)
    expect(back.height).toBe(8)
    expect([...back.pixels]).toEqual([...edit.pixels])
  })

  it('refuses a grid of the wrong size', () => {
    expect(() => new PlanningEdit(frame, new Uint8Array(79))).toThrow()
    expect(() => encodePgm(10, 8, new Uint8Array(3))).toThrow()
  })
})
