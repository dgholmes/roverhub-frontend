/**
 * RoverHub Design System — Tokens
 *
 * Single source of truth for all visual decisions.
 * Every component should reference these instead of hardcoding values.
 */

// ─────────────────────────────────────────────
// COLOR
// ─────────────────────────────────────────────

export const color = {
  // ── Backgrounds (darkest → lightest) ──
  bg:         '#0B0B0D',   // outermost app shell
  surface:    '#111115',   // topbar, sidebar, bars
  elevated:   '#17171A',   // floating elements slightly above surface
  card:       '#1C1C1F',   // cards, preset buttons, inputs
  cardHover:  '#222226',   // card :hover state
  overlay:    'rgba(8,8,10,0.48)', // glassmorphism base

  // ── Borders ──
  border:     '#252527',   // standard dividers, card edges
  borderLt:   '#2E2E32',   // lighter borders, subtle separators

  // ── Text ──
  t1:  '#FFFFFF',                  // primary — headings, values
  t2:  '#8B8B90',                  // secondary — labels, descriptions
  t3:  '#55555A',                  // muted — section headers, placeholders
  t4:  'rgba(255,255,255,0.25)',   // ghost — disabled, very muted

  // ── Accent (lime green) ──
  accent:       '#AAFF00',
  accentDim:    'rgba(170,255,0,0.12)',
  accentBorder: 'rgba(170,255,0,0.25)',
  accentGlow:   '0 0 8px rgba(170,255,0,0.55)',
  accentText:   '#0B0B0D',          // text ON an accent background

  // ── Status ──
  green:      '#30D158',
  greenBg:    'rgba(48,209,88,0.12)',
  greenBorder:'rgba(48,209,88,0.25)',

  amber:      '#FF9F0A',
  amberBg:    'rgba(255,159,10,0.12)',
  amberBorder:'rgba(255,159,10,0.25)',

  red:        '#FF453A',
  redBg:      'rgba(255,67,58,0.12)',
  redBorder:  'rgba(255,67,58,0.25)',
  redGlow:    '0 0 8px rgba(255,67,58,0.8)',

  orange:     '#FF8B3E',   // "Strong" connection quality
  orangeBg:   'rgba(255,139,62,0.12)',

  blue:       '#409CFF',   // active operator control (MANUAL / ASSISTED)
  blueBg:     'rgba(64,156,255,0.12)',
  blueBorder: 'rgba(64,156,255,0.25)',

  // ── E-Stop (special deep red) ──
  estop:       '#3D0A0A',
  estopBorder: '#7A1A1A',

  // ── SVG-specific ──
  // SVG <text> renders as geometry (no subpixel hinting). These values are
  // intentionally brighter than their HTML equivalents so perceived weight matches.
  svgLabel:    '#AEAEB2',   // SVG secondary label  (≈ t2 + 20% luminance)
  svgMuted:    '#8B8B90',   // SVG muted label      (= t2, use only when space is tight)

  // ── Gauge ──
  gaugeTrack:  'rgba(170,255,0,0.15)',  // unfilled arc — tinted lime, reads as "depleted"
} as const

// ─────────────────────────────────────────────
// TYPOGRAPHY
// ─────────────────────────────────────────────

export const font = {
  family: "'Outfit', system-ui, sans-serif",

  // Sizes (px)
  size: {
    '2xs': 9,   // uppercase section labels, axis ticks
    xs:   10,   // metadata, badge text, section headers
    sm:   11,   // body, small labels, status items
    md:   12,   // UI text, tabs, button labels
    lg:   13,   // nav items, sidebar labels, toast
    xl:   14,   // panel titles, task names
    '2xl':16,   // metric values
    '3xl':22,   // large dashboard numbers (battery %, runtime)
  },

  // Weights
  weight: {
    regular:  400,
    medium:   500,
    semibold: 600,
    bold:     700,
  },

  // Letter spacing
  tracking: {
    tight:  '-0.015em',
    normal: '0em',
    wide:   '0.04em',
    wider:  '0.06em',
    widest: '0.08em',  // uppercase labels
  },
} as const

// ─────────────────────────────────────────────
// SPACING  (strict 4px grid)
// ─────────────────────────────────────────────

export const space = {
  1:  4,
  2:  8,
  3:  12,
  4:  16,
  5:  20,
  6:  24,
  8:  32,
  10: 40,
  12: 48,
} as const

// ─────────────────────────────────────────────
// BORDER RADIUS
// ─────────────────────────────────────────────

export const radius = {
  xs:   4,     // tight pills, task badges
  sm:   6,     // buttons, tabs, inputs, small cards
  md:   8,     // cards, map insets, preset buttons
  lg:   10,    // modals, larger panels
  xl:   12,    // sidebar cards, drawer headers
  full: 9999,  // fully circular
} as const

// ─────────────────────────────────────────────
// SHADOWS & GLOWS
// ─────────────────────────────────────────────

export const shadow = {
  sm:   '0 1px 3px rgba(0,0,0,0.24)',
  md:   '0 4px 14px rgba(0,0,0,0.36)',
  lg:   '0 8px 32px rgba(0,0,0,0.48)',

  glow: {
    accent: '0 0 8px rgba(170,255,0,0.55)',
    red:    '0 0 8px rgba(255,67,58,0.80)',
    green:  '0 0 8px rgba(48,209,88,0.55)',
    amber:  '0 0 8px rgba(255,159,10,0.55)',
  },
} as const

// ─────────────────────────────────────────────
// GLASSMORPHISM
// ─────────────────────────────────────────────

export const glass = {
  /** Standard overlay — telemetry pills, map inset, media controls */
  overlay: {
    background:              'rgba(8,8,10,0.48)',
    backdropFilter:          'blur(18px) saturate(160%)',
    WebkitBackdropFilter:    'blur(18px) saturate(160%)',
    border:                  '1px solid rgba(255,255,255,0.09)',
  },
  /** Heavier — modals, drawers */
  heavy: {
    background:              'rgba(8,8,10,0.72)',
    backdropFilter:          'blur(24px) saturate(180%)',
    WebkitBackdropFilter:    'blur(24px) saturate(180%)',
    border:                  '1px solid rgba(255,255,255,0.10)',
  },
} as const

// ─────────────────────────────────────────────
// ANIMATION
// ─────────────────────────────────────────────

export const motion = {
  fast:    '100ms ease',
  default: '150ms ease',
  slow:    '220ms ease',

  easeOut: 'cubic-bezier(0.16,1,0.3,1)',
} as const

// ─────────────────────────────────────────────
// LAYOUT
// ─────────────────────────────────────────────

export const layout = {
  topBarHeight:    56,
  bottomBarHeight: 48,
  currentTaskHeight: 100,
  sidebarWidth:    280,
  videoInset:      12,   // padding inside the live view canvas
  actionBtnHeight: 64,

  // ── LiveOps five-region layout (docs/05-ui-ux.md §3) ──
  liveOpsRailWidth:    240,
  liveOpsFeedWidth:    320,
  commandBarHeight:    56,
  timelineHeight:       180,
} as const

// ─────────────────────────────────────────────
// STATUS SEMANTICS
// ─────────────────────────────────────────────

/** Maps a semantic quality level to a color token */
export const statusColor = {
  ok:          color.accent,     // lime — nominal, active, connected
  good:        color.green,      // green — healthy
  warning:     color.amber,      // amber — attention needed
  error:       color.red,        // red — fault / failure
  offline:     color.t3,         // muted — disconnected / inactive
  excellent:   color.accent,     // lime — best quality
  strong:      color.orange,     // orange — good but not peak
  degraded:    color.amber,
  critical:    color.red,
} as const

export type StatusLevel = keyof typeof statusColor
