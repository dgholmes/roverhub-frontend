import { describe, expect, it } from 'vitest'
import { layoutFor, shouldUseTouchShell } from './touchShell'
import { readTouchShell, useTouchShell } from './useTouchShell'

describe('shouldUseTouchShell', () => {
  it('a coarse primary pointer selects the touch shell', () => {
    expect(shouldUseTouchShell({ coarsePointer: true, search: '' })).toBe(true)
    // Other params on the URL are none of this function's business.
    expect(shouldUseTouchShell({ coarsePointer: true, search: '?robot=rover-pi' })).toBe(true)
  })

  it('a fine pointer does not, whatever the width', () => {
    // There is deliberately no width input: a touchscreen laptop driven with a
    // mouse reports `(pointer: coarse)` false and keeps the desktop console,
    // and a narrow desktop window must not flip the shell.
    expect(shouldUseTouchShell({ coarsePointer: false, search: '' })).toBe(false)
    expect(shouldUseTouchShell({ coarsePointer: false, search: '?robot=rover-jetson' })).toBe(false)
  })

  it('?ui=touch forces it on; ?ui=desktop forces it off', () => {
    expect(shouldUseTouchShell({ coarsePointer: false, search: '?ui=touch' })).toBe(true)
    expect(shouldUseTouchShell({ coarsePointer: true, search: '?ui=desktop' })).toBe(false)
    // Position among other params, and a missing leading '?', must not matter.
    expect(shouldUseTouchShell({ coarsePointer: false, search: '?robot=rover-pi&ui=touch' })).toBe(
      true,
    )
    expect(shouldUseTouchShell({ coarsePointer: false, search: 'ui=touch' })).toBe(true)
  })

  it('an unrecognised ?ui= value falls back to the pointer test', () => {
    expect(shouldUseTouchShell({ coarsePointer: true, search: '?ui=tablet' })).toBe(true)
    expect(shouldUseTouchShell({ coarsePointer: false, search: '?ui=tablet' })).toBe(false)
  })
})

describe('layoutFor', () => {
  it('landscape when wider than tall, portrait otherwise', () => {
    expect(layoutFor({ width: 1024, height: 768 }).orientation).toBe('landscape')
    expect(layoutFor({ width: 768, height: 1024 }).orientation).toBe('portrait')
    // A square viewport is not landscape.
    expect(layoutFor({ width: 800, height: 800 }).orientation).toBe('portrait')
  })

  it('big when the short side is at least 600', () => {
    expect(layoutFor({ width: 1024, height: 768 }).big).toBe(true) // tablet landscape
    expect(layoutFor({ width: 600, height: 960 }).big).toBe(true) // exactly at the boundary
    expect(layoutFor({ width: 844, height: 390 }).big).toBe(false) // phone landscape
    expect(layoutFor({ width: 390, height: 844 }).big).toBe(false) // phone portrait
    expect(layoutFor({ width: 599, height: 2000 }).big).toBe(false)
  })
})

describe('useTouchShell in the node test environment', () => {
  // Vitest runs with `environment: 'node'`: no window, no matchMedia. Importing
  // this module -- directly, or transitively from a component under test --
  // must not throw, and the answer with no DOM must be the desktop shell.
  it('imports and answers without a DOM', () => {
    expect(typeof window).toBe('undefined')
    expect(typeof useTouchShell).toBe('function')
    expect(readTouchShell()).toEqual({ touch: false, orientation: 'landscape', big: true })
  })
})
