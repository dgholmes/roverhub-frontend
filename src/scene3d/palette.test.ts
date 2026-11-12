// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { resolveScenePalette, SCENE_PALETTE_DARK } from './palette'

afterEach(() => { document.documentElement.removeAttribute('style') })

describe('resolveScenePalette', () => {
  it('falls back to the dark prototype values when no variable is set', () => {
    expect(resolveScenePalette()).toEqual(SCENE_PALETTE_DARK)
  })

  it('reads the scene variables and the accent, red and amber', () => {
    const root = document.documentElement
    root.style.setProperty('--rh-scene-floor', ' #fbfbfd ')
    root.style.setProperty('--rh-scene-point-furn', '#c27c12')
    root.style.setProperty('--rh-accent', '#0071e3')
    root.style.setProperty('--rh-red', '#d70015')
    root.style.setProperty('--rh-amber', '#a95300')
    const p = resolveScenePalette()
    expect(p.floor).toBe('#fbfbfd')
    expect(p.pointFurn).toBe('#c27c12')
    expect(p.accent).toBe('#0071e3')
    expect(p.red).toBe('#d70015')
    expect(p.amber).toBe('#a95300')
    expect(p.wall).toBe(SCENE_PALETTE_DARK.wall) // unset: fallback
  })

  it('reads the element it is given', () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    el.style.setProperty('--rh-scene-wall', '#3a3a3e')
    expect(resolveScenePalette(el).wall).toBe('#3a3a3e')
    expect(resolveScenePalette().wall).toBe(SCENE_PALETTE_DARK.wall)
    el.remove()
  })
})
