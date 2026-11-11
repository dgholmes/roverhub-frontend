import { describe, expect, it } from 'vitest'
import type { GridPixels } from '@/missions/floorCells'
import {
  CELL_BLOCKED, CELL_TIGHT, CELL_WALKABLE, analyseWalkable, cellIndexAt, labelRegions, planningCellClass,
  regionsAroundCell, robotRegions, squaredDistanceToBlocked, walkableAreaM2, walkableRefusal,
} from './walkable'

const FREE = 254, WALL = 0, UNKNOWN = 205

/** A grid drawn as text, top row first: `.` free, `#` occupied, `?` unknown. */
function grid(rows: string[]): GridPixels {
  const height = rows.length, width = rows[0].length
  const pixels = new Uint8Array(width * height)
  rows.forEach((row, y) => [...row].forEach((c, x) => {
    pixels[y * width + x] = c === '.' ? FREE : c === '#' ? WALL : UNKNOWN
  }))
  return { width, height, pixels }
}

/** The mask back as text: `W` walkable, `t` tight, ` ` blocked. */
function maskText(a: { width: number; mask: Uint8Array }): string[] {
  const out: string[] = []
  for (let i = 0; i < a.mask.length; i += a.width) {
    out.push([...a.mask.subarray(i, i + a.width)].map((m) => (m === CELL_WALKABLE ? 'W' : m === CELL_TIGHT ? 't' : ' ')).join(''))
  }
  return out
}

/** A floor at the origin with 1 m cells, so cell (col, rowFromBottom) is the
 * point (col + 0.5, row + 0.5). */
const UNIT_FLOOR = { origin_xy_m: [0, 0] as [number, number], resolution_m: 1 }

describe('planningCellClass: the Nav2 thresholds', () => {
  it('reads 254 as free, 0 as occupied and 205 as unknown', () => {
    expect(planningCellClass(254)).toBe('free')
    expect(planningCellClass(0)).toBe('occupied')
    expect(planningCellClass(205)).toBe('unknown')
  })

  it('puts the free and occupied edges where map_server does', () => {
    // free when (255 - v) / 255 < 0.196, i.e. v > 205.02
    expect(planningCellClass(206)).toBe('free')
    expect(planningCellClass(205)).toBe('unknown')
    // occupied when (255 - v) / 255 > 0.65, i.e. v < 89.25
    expect(planningCellClass(89)).toBe('occupied')
    expect(planningCellClass(90)).toBe('unknown')
  })
})

describe('squaredDistanceToBlocked', () => {
  it('matches a brute-force search, with the grid edge counting as blocked', () => {
    let seed = 7
    const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
    for (let trial = 0; trial < 20; trial++) {
      const w = 3 + Math.floor(rand() * 12), h = 3 + Math.floor(rand() * 12)
      const blocked = Array.from({ length: w * h }, () => rand() < 0.15)
      const d2 = squaredDistanceToBlocked((i) => blocked[i], w, h)
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          // Edges: the virtual blocked cells at -1 and w / h.
          let best = Math.min((x + 1) ** 2, (w - x) ** 2, (y + 1) ** 2, (h - y) ** 2)
          for (let j = 0; j < w * h; j++) {
            if (blocked[j]) best = Math.min(best, (j % w - x) ** 2 + (Math.floor(j / w) - y) ** 2)
          }
          expect(d2[y * w + x]).toBe(best)
        }
      }
    }
  })
})

describe('analyseWalkable: the mask', () => {
  it('marks free cells at least the clearance from anything not free as walkable, nearer ones as tight', () => {
    // 1 m cells, 2 m clearance: a 7 x 7 open room with walls round it.
    const a = analyseWalkable(grid([
      '#########',
      '#.......#',
      '#.......#',
      '#.......#',
      '#.......#',
      '#.......#',
      '#.......#',
      '#.......#',
      '#########',
    ]), 1, 2)
    expect(maskText(a)).toEqual([
      '         ',
      ' ttttttt ',
      ' tWWWWWt ',
      ' tWWWWWt ',
      ' tWWWWWt ',
      ' tWWWWWt ',
      ' tWWWWWt ',
      ' ttttttt ',
      '         ',
    ])
    expect(a.walkableCells).toBe(25)
    expect(a.tightCells).toBe(24)
  })

  it('counts a cell exactly the clearance away as walkable, despite 0.2 / 0.05 in floating point', () => {
    // Nine free cells in a row between walls, 5 cm cells, 0.2 m clearance: only
    // the centre cell is 4 cells (0.20 m) from both walls.
    const a = analyseWalkable(grid([
      '###########',
      '#.........#',
      '###########',
    ]), 0.05, 0.2)
    // A one-cell-high corridor is 1 cell from the walls above and below: tight.
    expect(a.walkableCells).toBe(0)
    const wide = analyseWalkable(grid([
      '#########',
      ...Array.from({ length: 7 }, () => '#.......#'),
      '#########',
    ]), 0.05, 0.2)
    // The centre of a 7 x 7 room is exactly 4 cells from each wall.
    expect(maskText(wide)[4][4]).toBe('W')
    expect(wide.walkableCells).toBe(1)
  })

  it('treats unknown as not free, and the edge of the grid as an obstacle', () => {
    // 1.5 m clearance on 1 m cells: the outer ring is 1 m from the edge, and
    // the cells round the unknown one are 1 or 1.41 m from it.
    const a = analyseWalkable(grid([
      '.......',
      '.......',
      '.......',
      '...?...',
      '.......',
      '.......',
      '.......',
    ]), 1, 1.5)
    expect(maskText(a)).toEqual([
      'ttttttt',
      'tWWWWWt',
      'tWtttWt',
      'tWt tWt',
      'tWtttWt',
      'tWWWWWt',
      'ttttttt',
    ])
  })

  it('gives the walkable area in square metres', () => {
    const a = analyseWalkable(grid(['#####', '#...#', '#...#', '#...#', '#####']), 0.05, 0.05)
    expect(a.walkableCells).toBe(9)
    expect(walkableAreaM2(a)).toBeCloseTo(9 * 0.0025, 9)
  })
})

describe('regions', () => {
  it('splits rooms a wall separates, and joins them through a door', () => {
    const rooms = [
      '#########',
      '#...#...#',
      '#...#...#',
      '#...#...#',
      '#########',
    ]
    const split = analyseWalkable(grid(rooms), 1, 1)
    expect(split.regionCount).toBe(2)
    const doored = analyseWalkable(grid(rooms.map((r, y) => (y === 2 ? '#.......#' : r))), 1, 1)
    expect(doored.regionCount).toBe(1)
  })

  it('joins cells that touch only at a corner', () => {
    const mask = Uint8Array.from([
      CELL_WALKABLE, CELL_BLOCKED,
      CELL_BLOCKED, CELL_WALKABLE,
    ])
    const { region, regionCount } = labelRegions(mask, 2, 2)
    expect(regionCount).toBe(1)
    expect([...region]).toEqual([1, 0, 0, 1])
  })

  it('leaves tight cells out of every region', () => {
    const mask = Uint8Array.from([CELL_WALKABLE, CELL_TIGHT, CELL_WALKABLE])
    const { region, regionCount } = labelRegions(mask, 3, 1)
    expect(regionCount).toBe(2)
    expect(region[1]).toBe(0)
  })
})

describe('cellIndexAt', () => {
  it('counts rows up from the origin while the mask runs down from the top', () => {
    const a = { width: 3, height: 2 }
    expect(cellIndexAt(a, UNIT_FLOOR, [0.5, 0.5])).toBe(3) // bottom-left
    expect(cellIndexAt(a, UNIT_FLOOR, [0.5, 1.5])).toBe(0) // top-left
    expect(cellIndexAt(a, UNIT_FLOOR, [2.5, 1.5])).toBe(2)
    expect(cellIndexAt(a, UNIT_FLOOR, [3.5, 0.5])).toBe(-1)
    expect(cellIndexAt(a, UNIT_FLOOR, [-0.1, 0.5])).toBe(-1)
  })
})

describe('walkableRefusal: why a tap cannot be planned to', () => {
  // Two rooms, a wall between; 1 m cells, 1.5 m clearance. Row 0 is the top, so
  // the free rows 1..5 are y = 1..5 from the bottom; the wall is column 6.
  const a = analyseWalkable(grid([
    '#############',
    '#.....#.....#',
    '#.....#.....#',
    '#.....#.....#',
    '#.....#.....#',
    '#.....#.....#',
    '#############',
  ]), 1, 1.5)
  const at = (col: number, rowFromBottom: number): [number, number] => [col + 0.5, rowFromBottom + 0.5]
  const leftRoom = robotRegions(a, UNIT_FLOOR, at(3, 3))

  it('knows which room the robot is in', () => {
    expect(leftRoom).not.toBeNull()
    expect(leftRoom!.size).toBe(1)
  })

  it('accepts a walkable point in the same room', () => {
    expect(walkableRefusal(a, UNIT_FLOOR, at(2, 2), leftRoom)).toBeNull()
  })

  it('refuses ground the survey never walked', () => {
    expect(walkableRefusal(a, UNIT_FLOOR, at(6, 3), leftRoom)).toBe('notWalkable') // the wall
    expect(walkableRefusal(a, UNIT_FLOOR, at(40, 3), leftRoom)).toBe('notWalkable') // off the grid
  })

  it('refuses free floor too close to a wall for the robot to fit', () => {
    expect(walkableRefusal(a, UNIT_FLOOR, at(1, 3), leftRoom)).toBe('tooTight')
  })

  it('refuses a walkable point in another room', () => {
    expect(walkableRefusal(a, UNIT_FLOOR, at(9, 3), leftRoom)).toBe('unreachable')
  })

  it('does not refuse on reachability when the robot\'s room is unknown', () => {
    expect(walkableRefusal(a, UNIT_FLOOR, at(9, 3), null)).toBeNull()
  })

  it('finds the robot\'s room from a tight cell beside the wall', () => {
    // 5 cm cells: a robot pressed against the wall still stands in its room.
    const fine = analyseWalkable(grid([
      '##############',
      ...Array.from({ length: 12 }, () => '#............#'),
      '##############',
    ]), 0.05, 0.2)
    const floor = { origin_xy_m: [0, 0] as [number, number], resolution_m: 0.05 }
    const beside = cellIndexAt(fine, floor, [0.075, 0.3])
    expect(fine.mask[beside]).toBe(CELL_TIGHT)
    expect(regionsAroundCell(fine, beside)).toEqual(new Set([1]))
    expect(regionsAroundCell(fine, -1)).toBeNull()
  })
})
