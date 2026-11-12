import { GRID_WALL, type SceneGrid } from '../types'

/**
 * The building's own axes. `yaw` (radians, map frame) is the dominant wall
 * direction folded into [-45, 45) degrees; r = (cos yaw, sin yaw) runs along
 * it and u = (-sin yaw, cos yaw) across it. (cx, cy) is the centre of the known
 * cells measured along those axes, and sr, su their extent along each.
 */
export interface Align {
  yaw: number
  cx: number
  cy: number
  sr: number
  su: number
  rx: number
  ry: number
  ux: number
  uy: number
}

/**
 * The options page's `computeAlign`: blur the wall mask, take Sobel gradients,
 * histogram their direction modulo 90 degrees weighted by magnitude, and pick
 * the best 7-degree window (refined to the weighted mean inside it). A site surveyed at an angle (the office sits at
 * about 45 degrees) is then squared up on screen by the first view.
 *
 * A grid with no walls has no direction: yaw 0. The extent comes from every
 * cell with any bit set, sampled every second cell as the page does.
 */
export function computeAlign(grid: SceneGrid): Align {
  const { w, h, bits, res, origin } = grid
  let m = new Float32Array(w * h)
  for (let k = 0; k < w * h; k++) m[k] = bits[k] & GRID_WALL ? 1 : 0
  const blur = (src: Float32Array, dx: number, dy: number) => {
    const out = new Float32Array(w * h)
    for (let j = 2; j < h - 2; j++) {
      for (let i = 2; i < w - 2; i++) {
        let t = 0
        for (let r = -2; r <= 2; r++) t += src[(j + r * dy) * w + i + r * dx]
        out[j * w + i] = t / 5
      }
    }
    return out
  }
  m = blur(blur(m, 1, 0), 0, 1)
  const hist = new Float32Array(90)
  // Per bin, the magnitude-weighted direction on a 90-degree circle (angle x 4),
  // to refine the winning window below the 1-degree bins.
  const cos4 = new Float64Array(90), sin4 = new Float64Array(90)
  for (let j = 1; j < h - 1; j++) {
    for (let i = 1; i < w - 1; i++) {
      const k = j * w + i
      const gx = m[k + 1 - w] + 2 * m[k + 1] + m[k + 1 + w] - m[k - 1 - w] - 2 * m[k - 1] - m[k - 1 + w]
      const gy = m[k + w - 1] + 2 * m[k + w] + m[k + w + 1] - m[k - w - 1] - 2 * m[k - w] - m[k - w + 1]
      const mag = Math.hypot(gx, gy)
      if (mag < 0.2) continue
      let deg = Math.atan2(gy, gx) * 180 / Math.PI
      deg = ((deg % 90) + 90) % 90
      const bin = Math.floor(deg) % 90
      hist[bin] += mag
      const a4 = deg * Math.PI / 45
      cos4[bin] += Math.cos(a4) * mag
      sin4[bin] += Math.sin(a4) * mag
    }
  }
  let best = 0, bestV = 0
  for (let d = 0; d < 90; d++) {
    let v = 0
    for (let r = -3; r <= 3; r++) v += hist[(d + r + 90) % 90]
    if (v > bestV) { bestV = v; best = d }
  }
  // The page took the window's centre bin (best + 0.5); the weighted mean
  // inside the window is the same answer without the half-degree step, and
  // keeps an axis-aligned building at 0 rather than a degree or more off.
  let deg = 0
  if (bestV > 0) {
    let c = 0, sn = 0
    for (let r = -3; r <= 3; r++) { const b = (best + r + 90) % 90; c += cos4[b]; sn += sin4[b] }
    deg = Math.atan2(sn, c) * 45 / Math.PI
    deg = ((deg % 90) + 90) % 90
  }
  if (deg >= 45) deg -= 90
  const yaw = deg * Math.PI / 180
  const rx = Math.cos(yaw), ry = Math.sin(yaw), ux = -Math.sin(yaw), uy = Math.cos(yaw)
  let r0 = Infinity, r1 = -Infinity, u0 = Infinity, u1 = -Infinity
  for (let j = 0; j < h; j += 2) {
    for (let i = 0; i < w; i += 2) {
      if (!bits[j * w + i]) continue
      const x = origin[0] + i * res, y = origin[1] + j * res
      const r = x * rx + y * ry, u = x * ux + y * uy
      if (r < r0) r0 = r
      if (r > r1) r1 = r
      if (u < u0) u0 = u
      if (u > u1) u1 = u
    }
  }
  if (!Number.isFinite(r0)) {
    // An empty grid: frame the whole of it.
    const x = origin[0] + (w * res) / 2, y = origin[1] + (h * res) / 2
    return { yaw: 0, cx: x, cy: y, sr: w * res, su: h * res, rx: 1, ry: 0, ux: 0, uy: 1 }
  }
  const rc = (r0 + r1) / 2, uc = (u0 + u1) / 2
  return { yaw, cx: rc * rx + uc * ux, cy: rc * ry + uc * uy, sr: r1 - r0, su: u1 - u0, rx, ry, ux, uy }
}

/** Points measured along the building's axes: centre and extent, with each
 * extent at least `minSpan` so one waypoint does not zoom to nothing. */
export function fitAlong(
  align: Pick<Align, 'rx' | 'ry' | 'ux' | 'uy'>, points: readonly { x: number; y: number }[], minSpan = 6,
): { cx: number; cy: number; sr: number; su: number } | null {
  if (!points.length) return null
  const { rx, ry, ux, uy } = align
  let r0 = Infinity, r1 = -Infinity, u0 = Infinity, u1 = -Infinity
  for (const p of points) {
    const r = p.x * rx + p.y * ry, u = p.x * ux + p.y * uy
    r0 = Math.min(r0, r); r1 = Math.max(r1, r); u0 = Math.min(u0, u); u1 = Math.max(u1, u)
  }
  const rc = (r0 + r1) / 2, uc = (u0 + u1) / 2
  return {
    cx: rc * rx + uc * ux, cy: rc * ry + uc * uy,
    sr: Math.max(minSpan, (r1 - r0) * 1.25), su: Math.max(minSpan, (u1 - u0) * 1.25),
  }
}

/** How far the top-down camera (vertical fov `fovDeg`) sits to show sr x su,
 * sr across the screen, with the page's 8% margin. */
export function planDistanceFor(sr: number, su: number, aspect: number, fovDeg = 30): number {
  const half = (fovDeg * Math.PI / 180) / 2
  return Math.max(su, sr / (aspect || 1)) / (2 * Math.tan(half)) * 1.08
}
