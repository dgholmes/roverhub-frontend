/**
 * RoverHub Design System — Tokens
 *
 * Single source of truth for all visual decisions.
 * Every component should reference these instead of hardcoding values.
 */

// ─────────────────────────────────────────────
// COLOR
// ─────────────────────────────────────────────

/**
 * Every value is a `var(--rh-*)` reference into `theme.css`, which defines a
 * dark and a light palette. Inline styles, SVG attributes and Leaflet path
 * options all resolve these at paint time, so switching theme is a single
 * attribute change on <html> and needs no re-render.
 *
 * Consequence: these strings are not hex. Never concatenate an alpha suffix
 * onto one (`${color.red}33`) — use the matching `*Bg` / `*Border` token.
 */
const v = (name: string) => `var(--rh-${name})`

export const color = {
  // ── Backgrounds (darkest → lightest) ──
  bg:         v('bg'),          // outermost app shell
  surface:    v('surface'),     // top bar, rails, bottom bars
  elevated:   v('elevated'),    // menus, popovers, dialogs
  card:       v('card'),        // cards, inputs
  cardHover:  v('card-hover'),
  hover:      v('hover'),       // row / ghost-button hover tint
  selected:   v('selected'),    // selected row tint
  overlay:    v('overlay'),     // panels floating over the map or video
  overlayBorder: v('overlay-border'),
  scrim:      v('scrim'),

  // ── Canvases ──
  videoBg:    v('video-bg'),    // camera panes — dark in both themes
  mapBg:      v('map-bg'),
  mapGrid:    v('map-grid'),
  mapZone:    v('map-zone'),

  // ── Borders ──
  border:     v('border'),
  borderLt:   v('border-lt'),

  // ── Text ── (contrast is measured per theme in theme.css)
  t1:  v('t1'),   // primary — headings, values
  t2:  v('t2'),   // secondary — labels, descriptions
  t3:  v('t3'),   // muted — metadata, units, timestamps (AA on every surface)
  t4:  v('t4'),   // disabled control text (≥3:1)

  // ── Accent: selection, focus and primary actions only — never status ──
  accent:       v('accent'),
  accentSolid:  v('accent-solid'),   // fill behind accentText
  accentDim:    v('accent-dim'),
  accentBorder: v('accent-border'),
  accentGlow:   'none',              // glows retired; kept so old imports compile
  accentText:   v('accent-text'),    // text ON an accentSolid background

  // ── Status ──
  green:      v('green'),
  greenBg:    v('green-bg'),
  greenBorder:v('green-border'),

  amber:      v('amber'),
  amberBg:    v('amber-bg'),
  amberBorder:v('amber-border'),

  red:        v('red'),
  redBg:      v('red-bg'),
  redBorder:  v('red-border'),
  redGlow:    'none',

  orange:     v('orange'),   // "Strong" connection quality
  orangeBg:   v('orange-bg'),

  blue:       v('blue'),     // active operator control (MANUAL / ASSISTED)
  blueBg:     v('blue-bg'),
  blueBorder: v('blue-border'),

  // ── E-Stop: solid high-salience red, same in both themes ──
  estop:       v('estop'),
  estopHover:  v('estop-hover'),
  estopBorder: v('estop-border'),

  // ── SVG-specific ──
  // SVG <text> renders as geometry (no subpixel hinting), so these run a
  // little brighter than their HTML equivalents.
  svgLabel:    v('svg-label'),
  svgMuted:    v('svg-muted'),

  // ── Gauge ──
  gaugeTrack:  v('gauge-track'),
} as const

// ─────────────────────────────────────────────
// TYPOGRAPHY
// ─────────────────────────────────────────────

export const font = {
  family: "'Outfit', 'Pretendard Variable', system-ui, sans-serif",

  // Sizes (px)
  size: {
    // Rebased up one step (was 9/10/11/12/13/14/16/22): 75% of the app's text
    // sat at 10-11px, and an ops console is read at arm's length.
    '2xs': 10,  // axis ticks, compact chips only
    xs:   11,   // metadata, badge text
    sm:   12,   // secondary text, small labels
    md:   13,   // default UI text, buttons, tabs
    lg:   14,   // nav items, list primary text
    xl:   15,   // panel titles, task names
    '2xl':18,   // metric values
    '3xl':24,   // headline numbers
  },

  // Weights
  // One step lighter than the names suggest (was 400/500/600/700). Outfit
  // runs heavy, and with nearly every label set semibold or bold the UI read
  // as thick and shouty. Hierarchy now comes from size and colour first.
  weight: {
    regular:  400,
    medium:   450,
    semibold: 500,
    bold:     600,
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
  sm:   'var(--rh-shadow-sm)',
  md:   'var(--rh-shadow-md)',
  lg:   'var(--rh-shadow-lg)',

  // Glows are retired: they decorated status dots and diluted the one place
  // emphasis matters (E-Stop). Kept as 'none' so existing imports compile.
  glow: {
    accent: 'none',
    red:    'none',
    green:  'none',
    amber:  'none',
  },
} as const

// ─────────────────────────────────────────────
// GLASSMORPHISM
// ─────────────────────────────────────────────

export const glass = {
  /**
   * Standard overlay for anything carrying **text or status** over live video.
   *
   * Was 0.48 alpha. Over a bright camera frame the effective backdrop
   * approaches white, so contrast became a function of the video content: a red
   * E-Stop state pill measured **1.03:1** and secondary telemetry labels
   * 1.04–1.73:1 — i.e. the robot's state was invisible in exactly the daylight
   * conditions where an operator is most likely to be driving it. Raised so the
   * scrim, not the footage, determines legibility.
   * docs/audit/2026-08-12-ui-ux-audit.md A-16.
   */
  overlay: {
    background:              'var(--rh-overlay)',
    backdropFilter:          'blur(16px) saturate(140%)',
    WebkitBackdropFilter:    'blur(16px) saturate(140%)',
    border:                  '1px solid var(--rh-overlay-border)',
  },
  /** Decorative chrome that carries no text — safe to stay translucent. */
  thin: {
    background:              'var(--rh-overlay)',
    backdropFilter:          'blur(16px) saturate(140%)',
    WebkitBackdropFilter:    'blur(16px) saturate(140%)',
    border:                  '1px solid var(--rh-overlay-border)',
  },
  /** Heavier — modals, drawers */
  heavy: {
    background:              'var(--rh-elevated)',
    backdropFilter:          'none',
    WebkitBackdropFilter:    'none',
    border:                  '1px solid var(--rh-border)',
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

  /** The space a floating card keeps from the chrome around it -- the command
   * bar below, the site bar above, the side bars either side. The value the
   * Alerts panel already opens at beside the site side bar (AlertCenterButton),
   * so every card that floats over a workspace sits the same distance off. */
  floatingCardGap: space[2],
} as const

// ─────────────────────────────────────────────
// STACKING
// ─────────────────────────────────────────────

/**
 * The app-wide layers, lowest first. Overlays on the live view (video labels,
 * camera bars, the manual-control card, map controls) use 850-1001, but inside
 * LiveOpsWorkspace's `isolation: isolate` box, so they never compete with these.
 */
export const zIndex = {
  /** Cards that open from a button (BarCard). The lowest open card sits here
   * and each later one a step above it (liveops/barCardStack.ts), up to
   * `floatingCardTop`. */
  floatingCard:    1100,
  floatingCardTop: 1199,
  /** Dialogs and their scrims, above every floating card: a card can open a
   * confirm (Quick Actions does), and the confirm must win. */
  modal:           1200,
} as const

// ─────────────────────────────────────────────
// STATUS SEMANTICS
// ─────────────────────────────────────────────

/** Maps a semantic quality level to a color token */
export const statusColor = {
  ok:          color.green,      // nominal, active, connected — status, so never the accent
  good:        color.green,      // green — healthy
  warning:     color.amber,      // amber — attention needed
  error:       color.red,        // red — fault / failure
  offline:     color.t3,         // muted — disconnected / inactive
  excellent:   color.green,      // best quality
  strong:      color.orange,     // orange — good but not peak
  degraded:    color.amber,
  critical:    color.red,
} as const

export type StatusLevel = keyof typeof statusColor
