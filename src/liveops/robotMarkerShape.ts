import { ROBOT_BODY_LENGTH_M, ROBOT_BODY_WIDTH_M } from './robotBody'

/**
 * The robot's shape on the map, in pixels.
 *
 * ⚠️ There used to be three separate things standing for one robot: a fixed
 * 28 px circle with an arrow (RobotMarker), a true-scale rectangle that grew
 * with the zoom (RobotBodyLayer), and an amber dot in the corner of the
 * circle. Past about 43 px/m the rectangle overtook the circle, so at the
 * default fit the operator saw a circle sitting inside an unrelated box, and
 * asked what any of it meant (user, 2026-11-25).
 *
 * This is the one shape that replaced them: the robot's real 0.65 x 0.35 m
 * footprint, rounded, with a soft beam showing which way the front is
 * pointed. Being true scale is the point -- it is what answers "will it fit
 * through there" against the walkable layer -- so the only departure from
 * true scale is a floor size, below which it stops shrinking and stays
 * findable.
 *
 * ⚠️ **The beam is not a measurement.** It says where the front is, nothing
 * more, and `beamReachPx` deliberately keeps it to a couple of body lengths
 * so it cannot be read as lidar coverage or a camera's field of view. If it
 * is ever meant to show one of those, it needs the real figures, not this.
 */

/** The shortest the body is ever drawn, nose to tail. Below this the true
 * body is a couple of pixels on a whole-floor view, which is not something an
 * operator can find or click. */
export const MIN_BODY_PX = 20

/** Half-angle of the beam. Wide enough to read as "this way" at a glance,
 * narrow enough not to blanket the floorplan. */
export const BEAM_SPREAD_DEG = 32

/** Corner rounding, as a share of the body's width. */
const CORNER_SHARE = 0.34

const n = (v: number) => String(Math.round(v * 100) / 100)

/**
 * The body in pixels at `pixelsPerMetre`, never shorter than `minPx`.
 *
 * A pane that has not been laid out, or a map mid-initialisation, can report a
 * scale of zero or worse; anything not a positive number falls back to the
 * floor rather than drawing a zero-sized or NaN-sized robot.
 */
export function bodySizePx(pixelsPerMetre: number, minPx: number = MIN_BODY_PX): { lengthPx: number; widthPx: number } {
  const scale = Number.isFinite(pixelsPerMetre) && pixelsPerMetre > 0 ? pixelsPerMetre : 0
  const lengthPx = Math.max(ROBOT_BODY_LENGTH_M * scale, minPx)
  return { lengthPx, widthPx: lengthPx * (ROBOT_BODY_WIDTH_M / ROBOT_BODY_LENGTH_M) }
}

/**
 * The rounded body as an SVG path, centred on the origin and pointing along
 * +x -- which is the robot's nose, before `bodyRotationDeg` turns it.
 *
 * The radius is clamped to what the body can take: a radius past the
 * half-width turns the corners inside out.
 */
export function roundedBodyPath(lengthPx: number, widthPx: number, radiusPx?: number): string {
  const hl = lengthPx / 2, hw = widthPx / 2
  const r = Math.min(radiusPx ?? widthPx * CORNER_SHARE, hw * 0.92, hl * 0.4)
  return `M${n(hl - r)},${n(-hw)}`
    + ` Q${n(hl)},${n(-hw)} ${n(hl)},${n(-hw + r)}`
    + ` L${n(hl)},${n(hw - r)}`
    + ` Q${n(hl)},${n(hw)} ${n(hl - r)},${n(hw)}`
    + ` L${n(-hl + r)},${n(hw)}`
    + ` Q${n(-hl)},${n(hw)} ${n(-hl)},${n(hw - r)}`
    + ` L${n(-hl)},${n(-hw + r)}`
    + ` Q${n(-hl)},${n(-hw)} ${n(-hl + r)},${n(-hw)} Z`
}

/**
 * The beam, opening along +x.
 *
 * It starts at `innerPx` rather than at the body's centre, so the sector has
 * no apex: a sector drawn from the centre is widest and most opaque exactly
 * where the body already is, which reads as a hard triangle stuck to the
 * robot's nose (user, 2026-11-25). Begun at the nose instead, the beam is an
 * annular wedge that only ever covers floor.
 *
 * Given `cornerPx`, its four corners are rounded and nothing else moves: the
 * same front, the same start at the nose (user, 2026-11-25, who tried a gap
 * between body and beam and kept the start as built). Draw its gradient over
 * `beamGradientBox`, or the rounding moves the fade.
 */
export function beamPath(reachPx: number, spreadDeg: number = BEAM_SPREAD_DEG, innerPx = 0, cornerPx = 0): string {
  const a = (spreadDeg * Math.PI) / 180
  const cosA = Math.cos(a), sinA = Math.sin(a)
  const ox = reachPx * cosA, oy = reachPx * sinA
  if (innerPx <= 0) {
    return `M0,0 L${n(ox)},${n(-oy)} A${n(reachPx)},${n(reachPx)} 0 0 1 ${n(ox)},${n(oy)} Z`
  }
  // No more rounding than the narrow end at the nose can take, or the two
  // corners there would meet and turn the path inside out.
  const rho = Math.min(cornerPx, innerPx * Math.tan(a) * 0.45, (reachPx - innerPx) / 4)
  if (!(rho > 0)) {
    const ix = innerPx * cosA, iy = innerPx * sinA
    return `M${n(ix)},${n(-iy)} L${n(ox)},${n(-oy)}`
      + ` A${n(reachPx)},${n(reachPx)} 0 0 1 ${n(ox)},${n(oy)}`
      + ` L${n(ix)},${n(iy)}`
      + ` A${n(innerPx)},${n(innerPx)} 0 0 0 ${n(ix)},${n(-iy)} Z`
  }

  // The same wedge, each corner replaced by an arc of radius rho tangent to
  // the side and to the circle it meets. The upper side runs along -a with
  // the beam below it; the lower along +a with the beam above it.
  const upper: Side = { u: [cosA, -sinA], inward: [sinA, cosA] }
  const lower: Side = { u: [cosA, sinA], inward: [sinA, -cosA] }
  const frontUp = cornerTangents(upper, reachPx, true, rho)
  const frontLo = cornerTangents(lower, reachPx, true, rho)
  const backUp = cornerTangents(upper, innerPx, false, rho)
  const backLo = cornerTangents(lower, innerPx, false, rho)
  const p = (q: Vec) => `${n(q[0])},${n(q[1])}`
  const r = n(rho), corner = ` A${r},${r} 0 0 1 `
  return `M${p(backUp.onSide)} L${p(frontUp.onSide)}`
    + corner + p(frontUp.onCircle)
    + ` A${n(reachPx)},${n(reachPx)} 0 0 1 ${p(frontLo.onCircle)}`
    + corner + p(frontLo.onSide)
    + ` L${p(backLo.onSide)}`
    + corner + p(backLo.onCircle)
    + ` A${n(innerPx)},${n(innerPx)} 0 0 0 ${p(backUp.onCircle)}`
    + corner + p(backUp.onSide) + ' Z'
}

type Vec = [number, number]
/** A side of the beam: a line from the body centre along `u`, with the beam
 * on the `inward` side of it. */
interface Side { u: Vec; inward: Vec }

/**
 * Where a rounded corner of radius `rho` touches a beam side and a circle
 * about the body centre -- the front (`inside`: the beam lies within it) or
 * the arc at the nose (the beam lies outside it).
 *
 * The corner's centre sits `rho` in from the side and `rho` in from the
 * circle, so it is on the side's parallel at distance R -/+ rho from the
 * origin; the touch points are its feet on each.
 */
function cornerTangents(side: Side, radius: number, inside: boolean, rho: number): { onSide: Vec; onCircle: Vec } {
  const { u, inward } = side
  const d = inside ? radius - rho : radius + rho
  // Centre q = t*u + rho*inward with |q| = d; u and inward are orthonormal.
  const t = Math.sqrt(Math.max(0, d * d - rho * rho))
  const q: Vec = [t * u[0] + rho * inward[0], t * u[1] + rho * inward[1]]
  const k = radius / Math.hypot(q[0], q[1])
  return { onSide: [t * u[0], t * u[1]], onCircle: [q[0] * k, q[1] * k] }
}

/** How round the beam's corners are: slight -- a tenth of the body -- and
 * never under 2 px, below which the rounding does not show. */
export function beamCornerPx(lengthPx: number): number {
  return Math.max(lengthPx * 0.1, 2)
}

/**
 * The box the beam's radial gradient is fitted to: the sharp wedge's own.
 *
 * SVG fits a gradient to its shape's bounding box by default. Rounding the
 * corners shrinks that box, which would move and narrow the fade -- and the
 * fade is the part of the beam that was right (user, 2026-11-25). So the
 * gradient is given this box explicitly (`userSpaceOnUse`) and stays exactly
 * as it was with sharp corners.
 */
export function beamGradientBox(reachPx: number, spreadDeg: number = BEAM_SPREAD_DEG, innerPx = 0): {
  cx: number; rx: number; ry: number
} {
  const a = (spreadDeg * Math.PI) / 180
  const x0 = innerPx * Math.cos(a)
  return { cx: (x0 + reachPx) / 2, rx: (reachPx - x0) / 2, ry: reachPx * Math.sin(a) }
}

/** How far the beam reaches: a couple of body lengths, with a floor so a
 * small robot still shows one. Never a sensor range -- see the note above. */
export function beamReachPx(lengthPx: number): number {
  return Math.max(lengthPx * 2.2, 40)
}

/** The uncertainty halo's radius. Drawn only when the position is not live,
 * so that unlike the amber dot it replaced, it means something when it is
 * there and nothing is shown when there is nothing to say. */
export function haloRadiusPx(lengthPx: number): number {
  return Math.max(lengthPx * 1.9, 26)
}

/** Half the side of the square icon box, so nothing drawn is clipped at any
 * rotation: the furthest of the beam, the halo and the body's own diagonal. */
export function markerExtentPx({ lengthPx, beamPx, haloPx }: {
  lengthPx: number; beamPx: number; haloPx: number
}): number {
  return Math.ceil(Math.max(beamPx, haloPx, lengthPx * 0.75) + 2)
}
