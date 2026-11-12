/**
 * The three cameras and the stand-in, as plain numbers: the options page's
 * `plan`, `fly` and `follow` state and its per-frame `step`, without three.js.
 * Everything here is in world units (X right, Y up, Z = -map y) so it can be
 * compared line for line with the page.
 */

export const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v))
export const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)

/** Top-down (tiltable) camera: looks at (tx, 0, tz) from `dist`, turned by `yaw`. */
export interface PlanCam { tx: number; tz: number; dist: number; yaw: number }
/** Free camera at (x, y, z), Euler YXZ (pitch, yaw, 0). */
export interface FlyCam { x: number; y: number; z: number; yaw: number; pitch: number }
/** Chase camera around a body at (x, z) facing `heading` (radians CCW from +X
 * seen from above, which is also the map-frame yaw). */
export interface FollowCam {
  x: number; z: number; heading: number
  orbit: number; pitch: number; dist: number
  walkPhase: number; gait: number
}

export const PLAN_FOV = 30
export const FLY_FOV = 70
export const FOLLOW_FOV = 55
export const PLAN_DIST_MIN = 3
export const PLAN_DIST_MAX = 120
export const FLY_Y_MIN = 0.15
export const FLY_Y_MAX = 25
export const FOLLOW_DIST_MIN = 1.2
export const FOLLOW_DIST_MAX = 14
/** Plan's elevation in degrees: 89.4 top-down, 46 fully tilted. */
export const PLAN_EL_TOP = 89.4
export const PLAN_EL_TILTED = 46

export type Keys = ReadonlySet<string>
const down = (keys: Keys, ...codes: string[]) => codes.some((k) => keys.has(k))

/** Plan keys: WASD/arrows pan at 0.7 x distance per second, Q/E rotate, R/F
 * zoom. True when anything moved. */
export function stepPlan(plan: PlanCam, keys: Keys, dt: number): boolean {
  const v = plan.dist * 0.7 * dt
  const fx = -Math.sin(plan.yaw), fz = -Math.cos(plan.yaw), rx = Math.cos(plan.yaw), rz = -Math.sin(plan.yaw)
  let f = 0, r = 0
  if (down(keys, 'KeyW', 'ArrowUp')) f += 1
  if (down(keys, 'KeyS', 'ArrowDown')) f -= 1
  if (down(keys, 'KeyD', 'ArrowRight')) r += 1
  if (down(keys, 'KeyA', 'ArrowLeft')) r -= 1
  plan.tx += (fx * f + rx * r) * v
  plan.tz += (fz * f + rz * r) * v
  let moved = f !== 0 || r !== 0
  if (down(keys, 'KeyQ')) { plan.yaw += 1.4 * dt; moved = true }
  if (down(keys, 'KeyE')) { plan.yaw -= 1.4 * dt; moved = true }
  if (down(keys, 'KeyR')) { plan.dist = clamp(plan.dist * (1 - 1.2 * dt), PLAN_DIST_MIN, PLAN_DIST_MAX); moved = true }
  if (down(keys, 'KeyF')) { plan.dist = clamp(plan.dist * (1 + 1.2 * dt), PLAN_DIST_MIN, PLAN_DIST_MAX); moved = true }
  return moved
}

/** The tilt animation: 1.6 per second toward `goal`, landing on it exactly. */
export function stepTilt(tiltT: number, goal: number, dt: number): number {
  if (tiltT === goal) return tiltT
  const sgn = Math.sign(goal - tiltT)
  const next = clamp(tiltT + sgn * dt * 1.6, 0, 1)
  return (sgn > 0 && next >= goal) || (sgn < 0 && next <= goal) ? goal : next
}

/** Plan camera position for a tilt fraction; it always looks at (tx, 0, tz). */
export function planPosition(plan: PlanCam, tiltT: number): { x: number; y: number; z: number } {
  const el = (PLAN_EL_TOP + (PLAN_EL_TILTED - PLAN_EL_TOP) * easeInOut(tiltT)) * Math.PI / 180
  return {
    x: plan.tx + Math.sin(plan.yaw) * Math.cos(el) * plan.dist,
    y: Math.sin(el) * plan.dist,
    z: plan.tz + Math.cos(plan.yaw) * Math.cos(el) * plan.dist,
  }
}

/** Plan wheel/pinch zoom factor applied to the distance, clamped. */
export function planZoom(dist: number, k: number): number {
  return clamp(dist * k, PLAN_DIST_MIN, PLAN_DIST_MAX)
}

/** Fly keys: W/S forward and back, A/D slide, arrows turn, Space/E up,
 * Shift/Q down, 3 m/s; height clamped to 0.15-25 m. `up`/`dn` are the touch
 * pad's buttons. */
export function stepFly(fly: FlyCam, keys: Keys, dt: number): boolean {
  const v = 3 * dt
  const fx = -Math.sin(fly.yaw), fz = -Math.cos(fly.yaw), rx = Math.cos(fly.yaw), rz = -Math.sin(fly.yaw)
  let f = 0, r = 0, u = 0
  if (down(keys, 'KeyW', 'ArrowUp')) f += 1
  if (down(keys, 'KeyS', 'ArrowDown')) f -= 1
  if (down(keys, 'KeyD')) r += 1
  if (down(keys, 'KeyA')) r -= 1
  if (down(keys, 'Space', 'KeyE', 'up')) u += 1
  if (down(keys, 'ShiftLeft', 'ShiftRight', 'KeyQ', 'dn')) u -= 1
  let turned = false
  if (down(keys, 'ArrowLeft')) { fly.yaw += 1.5 * dt; turned = true }
  if (down(keys, 'ArrowRight')) { fly.yaw -= 1.5 * dt; turned = true }
  fly.x += (fx * f + rx * r) * v
  fly.z += (fz * f + rz * r) * v
  fly.y = clamp(fly.y + u * v, FLY_Y_MIN, FLY_Y_MAX)
  return f !== 0 || r !== 0 || u !== 0 || turned
}

/** Fly wheel: move along the view direction, (1 - k) * 6 m. */
export function flyZoom(fly: FlyCam, k: number): void {
  const step = (1 - k) * 6
  fly.x += -Math.sin(fly.yaw) * Math.cos(fly.pitch) * step
  fly.z += -Math.cos(fly.yaw) * Math.cos(fly.pitch) * step
  fly.y = clamp(fly.y + Math.sin(fly.pitch) * step, FLY_Y_MIN, FLY_Y_MAX)
}

/** Drag look: 0.004 rad per pixel, pitch held inside +-1.5. */
export function flyLook(fly: FlyCam, dx: number, dy: number): void {
  fly.yaw -= dx * 0.004
  fly.pitch = clamp(fly.pitch - dy * 0.004, -1.5, 1.5)
}

/** The free camera that looks the way `dir` (a unit vector) does from `pos`:
 * the inverse of Euler YXZ (pitch, yaw, 0). Used when Follow lets go of the
 * robot, so the view does not jump. */
export function flyFrom(pos: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }): FlyCam {
  return {
    x: pos.x, y: clamp(pos.y, FLY_Y_MIN, FLY_Y_MAX), z: pos.z,
    pitch: Math.asin(clamp(dir.y, -1, 1)),
    yaw: Math.atan2(-dir.x, -dir.z),
  }
}

/** The page's Follow input: W/up walk, S/down back up at half speed, A/D or
 * left/right turn, Q/E side-step. */
export function followInput(keys: Keys): { f: number; side: number; turn: number } {
  let f = 0, side = 0, turn = 0
  if (down(keys, 'KeyW', 'ArrowUp')) f += 1
  if (down(keys, 'KeyS', 'ArrowDown')) f -= 0.5
  if (down(keys, 'KeyA', 'ArrowLeft')) turn += 1
  if (down(keys, 'KeyD', 'ArrowRight')) turn -= 1
  if (down(keys, 'KeyQ')) side += 1
  if (down(keys, 'KeyE')) side -= 1
  return { f, side, turn }
}

/** The 0.6 x 0.3 m body: its centre and four corners, at heading `h`, must
 * all be standable. `ok` takes world X, Z. */
export function canStand(X: number, Z: number, h: number, ok: (X: number, Z: number) => boolean): boolean {
  const c = Math.cos(h), s = Math.sin(h)
  for (const [a, b] of [[0, 0], [0.3, 0.15], [0.3, -0.15], [-0.3, 0.15], [-0.3, -0.15]]) {
    if (!ok(X + c * a + s * b, Z - s * a + c * b)) return false
  }
  return true
}

export type StandinStep = 'moved' | 'turned' | 'bumped' | 'idle'

/**
 * One frame of driving the stand-in: turn 1.8 rad/s, walk 1.2 m/s (side-step
 * at 0.6 of that). A blocked move slides along whichever axis is free, and
 * only a move blocked on both reports `bumped`. Also advances the gait.
 */
export function stepStandin(
  follow: FollowCam, input: { f: number; side: number; turn: number }, dt: number,
  ok: (X: number, Z: number) => boolean,
): StandinStep {
  const { f, side, turn } = input
  follow.heading += turn * 1.8 * dt
  const h = follow.heading
  const dx = (Math.cos(h) * f + Math.cos(h + Math.PI / 2) * side * 0.6) * 1.2 * dt
  const dz = (-Math.sin(h) * f - Math.sin(h + Math.PI / 2) * side * 0.6) * 1.2 * dt
  let result: StandinStep = turn ? 'turned' : 'idle'
  if (dx || dz) {
    if (canStand(follow.x + dx, follow.z + dz, h, ok)) { follow.x += dx; follow.z += dz; result = 'moved' }
    else if (canStand(follow.x + dx, follow.z, h, ok)) { follow.x += dx; result = 'moved' }
    else if (canStand(follow.x, follow.z + dz, h, ok)) { follow.z += dz; result = 'moved' }
    else result = 'bumped'
  }
  // The page counts a turn on the spot as moving, for the legs.
  stepGait(follow, result === 'moved' || turn !== 0, dt)
  return result
}

/** Leg swing: phase at 11 rad/s, amplitude eased toward moving or still. */
export function stepGait(follow: FollowCam, moving: boolean, dt: number): void {
  follow.walkPhase += dt * 11
  follow.gait += ((moving ? 1 : 0) - follow.gait) * Math.min(1, dt * 8)
}

/** Heading from (x0, z0) toward (x1, z1), in the stand-in's convention. */
export function headingTo(x0: number, z0: number, x1: number, z1: number): number {
  return Math.atan2(-(z1 - z0), x1 - x0)
}

/** a - b wrapped into (-pi, pi]. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d <= -Math.PI) d += Math.PI * 2
  return d
}

/**
 * One frame of the preview walk toward a target (world X, Z): turn at up to
 * 2.4 rad/s, and walk at 1.5 m/s only once facing within 0.6 rad. `arrived`
 * within 5 cm, as the page.
 */
export function previewStep(follow: FollowCam, tx: number, tz: number, dt: number): 'walking' | 'arrived' {
  const dx = tx - follow.x, dz = tz - follow.z, d = Math.hypot(dx, dz)
  const want = Math.atan2(-dz, dx)
  const diff = angleDiff(want, follow.heading)
  follow.heading += clamp(diff, -2.4 * dt, 2.4 * dt)
  if (Math.abs(diff) < 0.6) {
    const v = Math.min(d, 1.0 * dt * 1.5)
    follow.x += dx / (d || 1) * v
    follow.z += dz / (d || 1) * v
  }
  stepGait(follow, true, dt)
  return d < 0.05 ? 'arrived' : 'walking'
}

/** Where the chase camera wants to be: behind the body by `dist`, raised by
 * `pitch`, swung by `orbit`; it looks at (x, 0.4, z). */
export function followWant(follow: FollowCam): { x: number; y: number; z: number } {
  const a = follow.heading + Math.PI + follow.orbit
  return {
    x: follow.x + Math.cos(a) * Math.cos(follow.pitch) * follow.dist,
    y: 0.45 + Math.sin(follow.pitch) * follow.dist,
    z: follow.z - Math.sin(a) * Math.cos(follow.pitch) * follow.dist,
  }
}

/** Drag orbit for the chase camera. */
export function followOrbit(follow: FollowCam, dx: number, dy: number): void {
  follow.orbit -= dx * 0.006
  follow.pitch = clamp(follow.pitch + dy * 0.004, 0.08, 1.35)
}

export function followZoom(dist: number, k: number): number {
  return clamp(dist * k, FOLLOW_DIST_MIN, FOLLOW_DIST_MAX)
}

/** The wheel's zoom factor from a deltaY, as the page. */
export function wheelFactor(deltaY: number): number {
  return Math.exp(clamp(deltaY, -120, 120) * 0.0016)
}

/**
 * Ease a shown pose toward a target pose (map-frame x, y, yaw) at rate
 * `rate` per second; jumps over `snapM` metres snap. True while still moving.
 */
export function lerpPose(
  shown: { x: number; y: number; yaw: number }, target: { x: number; y: number; yaw: number },
  dt: number, rate = 8, snapM = 3,
): boolean {
  const dx = target.x - shown.x, dy = target.y - shown.y
  const dyaw = angleDiff(target.yaw, shown.yaw)
  if (Math.hypot(dx, dy) > snapM) { shown.x = target.x; shown.y = target.y; shown.yaw = target.yaw; return false }
  if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3 && Math.abs(dyaw) < 1e-3) {
    shown.x = target.x; shown.y = target.y; shown.yaw = target.yaw
    return false
  }
  const k = 1 - Math.exp(-rate * dt)
  shown.x += dx * k; shown.y += dy * k; shown.yaw += dyaw * k
  return true
}

/** The top-down plan's scale bar: metres per pixel at distance `dist` on a
 * `heightPx` tall view, and the first nice length at least 60 px long. */
export function scaleBar(dist: number, heightPx: number): { metres: number; px: number } {
  const mpp = 2 * dist * Math.tan(PLAN_FOV / 2 * Math.PI / 180) / Math.max(1, heightPx)
  const metres = [0.5, 1, 2, 5, 10, 20].find((m) => m / mpp >= 60) ?? 20
  return { metres, px: Math.round(metres / mpp) }
}
