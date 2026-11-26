import { color, font, radius } from '@/design-system/tokens'

/**
 * The map scene's overlay look, in a module of its own so a host can draw a
 * control that matches the scene's (the Map page's Flat / 3D / Point cloud
 * switch, shown over Flat and Point cloud too) without pulling three.js into
 * its chunk. MapScene itself is reached only through MapSceneLazy.
 */

/** Pixels from the scene's edge to its controls (before any host inset). */
export const SCENE_EDGE = 12

/** The page's glass: the overlay tint and blur, no outline (house rule: tints,
 * not hairlines). */
export const glassStyle: React.CSSProperties = {
  background: 'var(--rh-overlay)',
  backdropFilter: 'blur(24px)',
  WebkitBackdropFilter: 'blur(24px)',
  borderRadius: radius.md,
  boxShadow: 'var(--rh-shadow-md)',
}

/** A button in a glass pill: the accent fill when pressed. */
export function gbtn(pressed: boolean): React.CSSProperties {
  return {
    border: 'none', borderRadius: radius.sm, padding: '4px 12px', fontSize: font.size.sm, fontWeight: font.weight.semibold,
    fontFamily: font.family, cursor: 'pointer', whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6,
    background: pressed ? color.accentSolid : 'transparent', color: pressed ? color.accentText : color.t1,
  }
}

/** A disabled glass button: dimmed, and the cursor says no. */
export const gbtnDisabled: React.CSSProperties = { cursor: 'not-allowed', opacity: 0.45 }
