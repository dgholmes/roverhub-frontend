import type { ScenePalette } from './types'

/** The options page's dark palette, which is also theme.css's dark values.
 * Used for any variable that resolves empty: tests (jsdom has no stylesheet),
 * or an element outside the themed tree. */
export const SCENE_PALETTE_DARK: Readonly<ScenePalette> = Object.freeze({
  bg: '#111113',
  floor: '#1d1d20',
  wall: '#d9d9de',
  furn: '#55555b',
  grid: '#2a2a2e',
  track: '#32ade6',
  robot: '#e8e8ea',
  pointFloor: '#3a3a40',
  pointFurn: '#a26a1c',
  pointWall: '#dcdce2',
  accent: '#0a84ff',
  red: '#ff453a',
  amber: '#ff9f0a',
})

/** Which CSS variable each palette entry reads. */
const VARS: Readonly<Record<keyof ScenePalette, string>> = {
  bg: '--rh-scene-bg',
  floor: '--rh-scene-floor',
  wall: '--rh-scene-wall',
  furn: '--rh-scene-furn',
  grid: '--rh-scene-grid',
  track: '--rh-scene-track',
  robot: '--rh-scene-robot',
  pointFloor: '--rh-scene-point-floor',
  pointFurn: '--rh-scene-point-furn',
  pointWall: '--rh-scene-point-wall',
  accent: '--rh-accent',
  red: '--rh-red',
  amber: '--rh-amber',
}

/**
 * The scene's colours as the theme currently resolves them. WebGL and a canvas
 * cannot read `var(...)`, so the engine resolves once and again on a theme
 * change. Reads `el` (default: the document root) so a subtree with its own
 * theme or accent is honoured.
 */
export function resolveScenePalette(el?: Element): ScenePalette {
  const target = el ?? (typeof document !== 'undefined' ? document.documentElement : undefined)
  const style = target && typeof getComputedStyle === 'function' ? getComputedStyle(target) : null
  const out = { ...SCENE_PALETTE_DARK }
  for (const key of Object.keys(VARS) as (keyof ScenePalette)[]) {
    const value = style?.getPropertyValue(VARS[key]).trim()
    if (value) out[key] = value
  }
  return out
}
