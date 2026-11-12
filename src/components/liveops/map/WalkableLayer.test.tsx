import { describe, expect, it, vi } from 'vitest'

vi.mock('react-leaflet', () => ({ ImageOverlay: () => null }))

import { walkablePixels } from './WalkableLayer'
import { CELL_BLOCKED, CELL_TIGHT, CELL_WALKABLE } from '@/liveops/walkable'

describe('walkablePixels', () => {
  it('tints walkable cells green, tight ones amber, and leaves the rest clear', () => {
    const mask = Uint8Array.from([CELL_WALKABLE, CELL_TIGHT, CELL_BLOCKED])
    const px = walkablePixels({ mask }, [10, 20, 30], [200, 100, 0])
    expect([...px.subarray(0, 4)]).toEqual([10, 20, 30, 77])
    expect([...px.subarray(4, 8)]).toEqual([200, 100, 0, 128])
    expect([...px.subarray(8, 12)]).toEqual([0, 0, 0, 0])
  })
})
