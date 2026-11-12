import type { SceneView } from '../types'

/** Keys the scene holds while pressed (and so stops the browser from
 * scrolling with), as the options page's HANDLED set. */
export const HELD_KEYS: ReadonlySet<string> = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyR', 'KeyF',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight',
])

/** Keys that move a camera or a body. In Follow on the live robot, any of
 * these lets go of the robot. */
export const MOVE_KEYS: ReadonlySet<string> = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight',
])

/** Keys that take the Follow camera back to the live robot. */
export const REATTACH_KEYS: ReadonlySet<string> = new Set(['KeyB', 'Home'])

export const TAP_MAX_PX = 5
export const TAP_MAX_MS = 500

/** A press and its release: a tap when the pointer moved at most ~5 px and
 * came up within ~500 ms. Anything else is a drag. */
export function isTap(
  down: { x: number; y: number; t: number }, up: { x: number; y: number; t: number },
  maxPx = TAP_MAX_PX, maxMs = TAP_MAX_MS,
): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) <= maxPx && up.t - down.t <= maxMs
}

/** Whether a key event should reach the scene: only from the scene element
 * itself (not a button inside it), with no command modifier held. */
export function sceneOwnsKey(e: { target: EventTarget | null; metaKey: boolean; ctrlKey: boolean; altKey: boolean }, host: EventTarget): boolean {
  return e.target === host && !e.metaKey && !e.ctrlKey && !e.altKey
}

/** The key-hint labels, as `scene.keys.*` locale keys. */
export type KeyHintLabel =
  | 'pan' | 'rotate' | 'zoomInOut' | 'tilt' | 'dragPan' | 'scrollZoom'
  | 'forwardBack' | 'slide' | 'turn' | 'up' | 'down' | 'look' | 'scrollForward'
  | 'walkBack' | 'sideStep' | 'dropWaypoint' | 'orbit' | 'cameraDistance'
  | 'clickWaypoint' | 'clickPoint' | 'dragPose' | 'letGo' | 'backToRobot'
  | 'pinchZoom' | 'pinchForward' | 'arrowsPan' | 'arrowsMove' | 'arrowsWalk' | 'tapWaypoint' | 'tapPoint' | 'padDrop'

export interface KeyHint { keys: string[]; label: KeyHintLabel }

const k = (keys: string, label: KeyHintLabel): KeyHint => ({ keys: keys.split(' '), label })

/**
 * The options page's KEYMAP (and TOUCHMAP on a touch screen) for one view.
 * Two changes from the page: the click line says what a click does here
 * (a waypoint in Missions, a point in LiveOps, a pose while setting position),
 * and Follow on the live robot lists how to let go and come back instead of
 * driving a stand-in. The page's Backspace undo is the host's, not the
 * scene's, so it is not listed.
 */
export function keyHints(view: SceneView, opts: {
  followTarget: 'robot' | 'standin'
  pointerMode: 'tap' | 'pose'
  touch?: boolean
}): KeyHint[] {
  const hints = keyHintsFor(view, opts)
  // Setting a pose turns camera dragging off: a drag is the pose.
  return opts.pointerMode === 'pose' ? hints.filter((h) => h.keys[0] !== 'Drag' || h.label === 'dragPose') : hints
}

function keyHintsFor(view: SceneView, opts: {
  followTarget: 'robot' | 'standin'
  pointerMode: 'tap' | 'pose'
  touch?: boolean
}): KeyHint[] {
  const { followTarget, pointerMode, touch = false } = opts
  const click = pointerMode === 'pose'
    ? k('Drag', 'dragPose')
    : k(touch ? 'Tap' : 'Click', followTarget === 'standin' ? (touch ? 'tapWaypoint' : 'clickWaypoint') : (touch ? 'tapPoint' : 'clickPoint'))
  if (touch) {
    if (view === 'plan') return [k('Drag', 'dragPan'), k('Pinch', 'pinchZoom'), k('Arrows', 'arrowsPan'), click]
    if (view === 'fly') return [k('Drag', 'look'), k('Pinch', 'pinchForward'), k('Arrows', 'arrowsMove'), click]
    if (followTarget === 'robot') return [k('Arrows', 'letGo'), k('Drag', 'letGo'), click]
    return [k('Arrows', 'arrowsWalk'), k('Drag', 'orbit'), k('Drop', 'padDrop'), click]
  }
  if (view === 'plan') {
    return [k('W A S D', 'pan'), k('↑ ← ↓ →', 'pan'), k('Q E', 'rotate'), k('R F', 'zoomInOut'), k('T', 'tilt'),
      k('Drag', 'dragPan'), k('Scroll', 'scrollZoom'), click]
  }
  if (view === 'fly') {
    return [k('W S', 'forwardBack'), k('A D', 'slide'), k('← →', 'turn'), k('Space E', 'up'), k('Shift Q', 'down'),
      k('Drag', 'look'), k('Scroll', 'scrollForward'), click]
  }
  if (followTarget === 'robot') {
    return [k('W A S D', 'letGo'), k('Drag', 'letGo'), k('B Home', 'backToRobot'), k('Scroll', 'cameraDistance'), click]
  }
  return [k('W S ↑ ↓', 'walkBack'), k('A D ← →', 'turn'), k('Q E', 'sideStep'), k('Space', 'dropWaypoint'),
    k('Drag', 'orbit'), k('Scroll', 'cameraDistance'), click]
}
