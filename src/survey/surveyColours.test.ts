import { describe, expect, it } from 'vitest'
import { SCENE_PALETTE_DARK } from '@/scene3d/palette'
import { floorColours, parseColour } from '@/scene3d/paintFloor'
import { countSurveyCells, paintSurveyCells, surveyCellOf, surveyColours } from './surveyColours'

describe('survey cell colours', () => {
  it('reads 0 / 128 / 255 as unseen / open / occupied, and in-between by the nearest', () => {
    expect(surveyCellOf(0)).toBe('unseen')
    expect(surveyCellOf(128)).toBe('open')
    expect(surveyCellOf(255)).toBe('occupied')
    expect(surveyCellOf(40)).toBe('unseen')
    expect(surveyCellOf(150)).toBe('open')
    expect(surveyCellOf(220)).toBe('occupied')
  })

  it('paints walls in the scene wall colour and open floor in the walkable blue', () => {
    const colours = surveyColours(SCENE_PALETTE_DARK)
    expect(colours.occupied).toEqual(parseColour(SCENE_PALETTE_DARK.wall))
    expect(colours.open).toEqual(floorColours(SCENE_PALETTE_DARK).walk)
    // The walkable tint leans blue: more blue than red.
    expect(colours.open[2]).toBeGreaterThan(colours.open[0])
    // On dark, walls are light.
    expect(colours.occupied[0]).toBeGreaterThan(200)
  })

  it('leaves unseen ground transparent, except its edge next to open floor', () => {
    // 4 x 1: open, unseen (edge), unseen (deep), wall
    const rgba = paintSurveyCells(new Uint8Array([128, 0, 0, 255]), 4, 1, surveyColours(SCENE_PALETTE_DARK))
    const alpha = (i: number) => rgba[i * 4 + 3]
    expect(alpha(0)).toBe(255)
    expect(alpha(1)).toBe(255) // the edge still to cover
    expect(alpha(2)).toBe(0)
    expect(alpha(3)).toBe(255)
    const c = surveyColours(SCENE_PALETTE_DARK)
    expect([rgba[4], rgba[5], rgba[6]]).toEqual(c.frontier)
    expect([rgba[12], rgba[13], rgba[14]]).toEqual(c.occupied)
  })

  it('counts each kind of cell', () => {
    expect(countSurveyCells(new Uint8Array([0, 128, 128, 255]))).toEqual({ unseen: 1, open: 2, occupied: 1 })
  })
})
