/**
 * How every LiveOps map frames the robot: zoomed in on it, and following it.
 *
 * One place, because there are six maps -- the desktop map pane, Split view's
 * and the stacked layout's map, the inset over the camera, and the touch
 * shell's watch and drive maps -- and they all mount `MapCanvas`, which mounts
 * `FollowRobot`, which reads its rules from here. Before this (2026-11-25) the
 * rule lived as one boolean in MapCanvas: the inset followed always, the full
 * map only while a mission run was walking, and nothing ever zoomed in. A
 * robot being driven by hand, or walking to a tapped goal, walked off every
 * full map, which is what the operator reported as "follow does not work".
 *
 * The rules:
 * - Every map opens zoomed in on the selected robot and follows it.
 * - A drag (or a box zoom, or Fit) pauses following on an interactive map. A
 *   zoom does not: while following, the wheel, the pinch and a double-click
 *   zoom about the robot, so zooming changes how close the follow is rather
 *   than ending it.
 * - Follow robot (the button that appears while paused, and MapControls'
 *   crosshair) turns it back on: re-centred, at the close-up zoom.
 * - Switching robots re-centres on the new one and turns following back on.
 *
 * Pure: no Leaflet here, so it is testable without a map.
 */

/** Metres of floor the full map shows across its smaller visible axis while
 * following: close enough that the robot reads as a robot (0.6 m long is about
 * 45 px on a 600 px pane) and a doorway is a doorway, wide enough to see the
 * next turn. */
export const FOLLOW_SPAN_M = 8

/** The inset over the camera: a 176 x 106 px window on the robot's room
 * (user, 2026-11-25). Wider than the full map's, since 8 m across 106 px would
 * show the robot and little else. */
export const MINI_FOLLOW_SPAN_M = 12

/**
 * How far from the focus point the robot may drift before the view moves, as
 * a fraction of the visible area's SMALLER axis.
 *
 * It exists so a robot standing still does not jitter the map: a
 * dead-reckoned pose wanders a few centimetres between frames, and panning on
 * every one of them makes the floor crawl under a stationary robot. A fifth is
 * wide enough to absorb that and still brings the robot back well before it
 * reaches an edge. The smaller axis because the zone is a circle and Split
 * view's map pane is tall and narrow.
 */
export const FOLLOW_DEAD_ZONE_FRACTION = 0.2

export interface Px { x: number; y: number }

/** Room on each side of the pane that panels float over: the same declaration
 * the views already make for fitting (`FitPadding`), already clamped. */
export interface FollowPadding {
  topLeft: [number, number]
  bottomRight: [number, number]
}

export type MapVariant = 'full' | 'mini'

export function followSpanM(variant: MapVariant): number {
  return variant === 'mini' ? MINI_FOLLOW_SPAN_M : FOLLOW_SPAN_M
}

/** The visible rectangle: the pane less what its panels cover. A padding that
 * would leave nothing (an unmeasured pane, an absurd declaration) is ignored
 * rather than producing a zero-size view. */
export function visibleRect(size: Px, padding?: FollowPadding): { x: number; y: number; width: number; height: number } {
  const [l, t] = padding?.topLeft ?? [0, 0]
  const [r, b] = padding?.bottomRight ?? [0, 0]
  const width = size.x - l - r
  const height = size.y - t - b
  if (width <= 0 || height <= 0) return { x: 0, y: 0, width: size.x, height: size.y }
  return { x: l, y: t, width, height }
}

/** Where on the pane the robot is held: the middle of what is visible, not of
 * the pane, so a robot is never followed underneath the telemetry card. */
export function focusPoint(size: Px, padding?: FollowPadding): Px {
  const r = visibleRect(size, padding)
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
}

/** The zoom that shows `spanM` metres across the visible area's smaller axis,
 * on a CRS.Simple map (one unit a metre, 2^zoom pixels per unit), snapped
 * DOWN to `snap` so the span always fits, and clamped to the map's range.
 * Null for a pane not laid out yet: there is no right zoom for zero pixels. */
export function followZoom(
  size: Px, spanM: number,
  { padding, minZoom = 1, maxZoom = 7, snap = 0.25 }: {
    padding?: FollowPadding; minZoom?: number; maxZoom?: number; snap?: number
  } = {},
): number | null {
  if (!(size.x > 0 && size.y > 0) || !(spanM > 0)) return null
  const r = visibleRect(size, padding)
  const raw = Math.log2(Math.min(r.width, r.height) / spanM)
  const snapped = snap > 0 ? Math.floor(raw / snap + 1e-9) * snap : raw
  return Math.min(maxZoom, Math.max(minZoom, snapped))
}

/** Whether the robot has left the dead zone around the focus point. */
export function shouldPan(
  robot: Px, focus: Px, size: Px,
  { padding, fraction = FOLLOW_DEAD_ZONE_FRACTION }: { padding?: FollowPadding; fraction?: number } = {},
): boolean {
  const r = visibleRect(size, padding)
  const radius = Math.min(r.width, r.height) * fraction
  return Math.hypot(robot.x - focus.x, robot.y - focus.y) > radius
}

/** A pose worth moving the view for. A bridge that sends a bad pose must not
 * throw the view somewhere the operator cannot pan back from. */
export function isFinitePosition(p: { x_m: number; y_m: number } | undefined | null): boolean {
  return !!p && Number.isFinite(p.x_m) && Number.isFinite(p.y_m)
}

/**
 * Follow state for one map. `epoch` moves whenever the view should be framed
 * afresh -- follow turned back on, or a different robot -- so the map can key
 * its "zoom in and centre" on it, apart from the per-frame pan.
 */
export interface FollowState {
  robotId: string
  following: boolean
  epoch: number
}

export type FollowEvent =
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'robot'; robotId: string }

export function initialFollow(robotId: string): FollowState {
  return { robotId, following: true, epoch: 0 }
}

export function followReducer(state: FollowState, event: FollowEvent): FollowState {
  switch (event.type) {
    case 'pause':
      return state.following ? { ...state, following: false } : state
    case 'resume':
      // Always a fresh frame, even when already following: the button reads
      // "show me the robot", and an operator who zoomed out while following
      // gets the close-up back.
      return { ...state, following: true, epoch: state.epoch + 1 }
    case 'robot':
      return event.robotId === state.robotId
        ? state
        : { robotId: event.robotId, following: true, epoch: state.epoch + 1 }
  }
}
