import { describe, expect, it } from 'vitest'
import { placeCard, type Box } from './barCardPlacement'

// A 1280x800 window: site bar to y=44, side bar + rail to x=308, command bar
// from y=736. The free area between them is what a card may use.
const bounds: Box = { top: 44, right: 1280, bottom: 736, left: 308 }
const G = 8

/** A 36px button in the bar's single row, its right edge at `right`. */
const barButton = (right: number, width = 90): Box => ({ top: 745, bottom: 781, left: right - width, right })

describe('placeCard', () => {
  it('sits the gap above the command bar, not above its own button', () => {
    const p = placeCard({ anchor: barButton(900), bounds, size: { width: 220, height: 150 }, gap: G })
    expect(p.top + 150).toBe(736 - G)
    expect(p.left + 220).toBe(900)
  })

  it('clears the whole bar when it has wrapped, so a lower-row card never covers the row above', () => {
    const lowerRow: Box = { top: 789, bottom: 825, left: 800, right: 890 }
    const p = placeCard({ anchor: lowerRow, bounds: { ...bounds, bottom: 692 }, size: { width: 220, height: 150 }, gap: G })
    expect(p.top + 150).toBe(692 - G)
  })

  it('sits the gap above an anchor that floats above the bar (Quick Actions)', () => {
    const corner: Box = { top: 600, bottom: 636, left: 1100, right: 1268 }
    const p = placeCard({ anchor: corner, bounds, size: { width: 150, height: 200 }, gap: G })
    expect(p.top + 200).toBe(600 - G)
    expect(p.left + 150).toBe(1268)
  })

  it('aligns left or centre when asked', () => {
    const anchor = barButton(900)
    expect(placeCard({ anchor, bounds, size: { width: 220, height: 100 }, gap: G, align: 'left' }).left).toBe(810)
    expect(placeCard({ anchor, bounds, size: { width: 220, height: 100 }, gap: G, align: 'center' }).left).toBe(745)
  })

  it('keeps the gap off the side bar when the anchor is near it', () => {
    const p = placeCard({ anchor: barButton(400), bounds, size: { width: 220, height: 100 }, gap: G })
    expect(p.left).toBe(308 + G)
  })

  it('keeps the gap off the right edge when aligned past it', () => {
    const p = placeCard({ anchor: barButton(1200), bounds, size: { width: 220, height: 100 }, gap: G, align: 'left' })
    expect(p.left + 220).toBe(1280 - G)
  })

  it('caps the height at the free space, keeping the gap below the site bar too', () => {
    const p = placeCard({ anchor: barButton(900), bounds, size: { width: 220, height: 2000 }, gap: G })
    expect(p.maxHeight).toBe(736 - G - (44 + G))
    expect(p.top).toBe(44 + G)
  })

  it('reports how wide the free area is, and pins a too-wide card to its left edge', () => {
    const narrow: Box = { top: 44, right: 500, bottom: 736, left: 308 }
    const p = placeCard({ anchor: barButton(480), bounds: narrow, size: { width: 220, height: 100 }, gap: G })
    expect(p.maxWidth).toBe(500 - G - (308 + G))
    expect(p.left).toBe(308 + G)
  })

  it('never returns a negative height', () => {
    const squeezed: Box = { top: 730, right: 1280, bottom: 736, left: 0 }
    expect(placeCard({ anchor: barButton(900), bounds: squeezed, size: { width: 220, height: 100 }, gap: G }).maxHeight).toBe(0)
  })
})
