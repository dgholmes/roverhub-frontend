/**
 * Frame-to-frame camera motion, measured in the browser.
 *
 * A port of `MotionEstimator` in the root repo's offline prototype
 * (`tools/video_stab/stabilise_clip.py`), without OpenCV: corners on the
 * previous frame (Shi-Tomasi), tracked into this one with pyramidal
 * Lucas-Kanade, then a similarity transform (shift + roll + scale) fitted with
 * RANSAC, so a person walking through the picture does not count as camera
 * motion. A frame where tracking fails reports no motion rather than a guess.
 *
 * Everything works on a small grey copy (EST_WIDTH px wide): the cost is then
 * the same whatever the stream's resolution, and the caller scales the result
 * up to the frame it draws.
 */

/** Width motion is estimated at. The prototype used 480 px on a 1280 px
 * stream; 320 keeps the per-frame cost well inside the 66 ms a 15 fps frame
 * allows on a laptop while tracking the same ~100 corners. */
export const EST_WIDTH = 320

export interface GreyImage {
  width: number
  height: number
  data: Float32Array
}

export interface Point { x: number; y: number }

/** Picture motion since the previous frame: the shift of the picture's centre
 * in estimate pixels, and the roll in radians (positive = clockwise on screen,
 * because y points down). `ok` is false when tracking failed and the zeros are
 * a refusal to guess. */
export interface Motion { dx: number; dy: number; da: number; ok: boolean }

/** BT.601 luma, the weights OpenCV's BGR2GRAY uses. */
export function greyFromRgba(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): GreyImage {
  const data = new Float32Array(width * height)
  for (let i = 0, j = 0; i < data.length; i++, j += 4) {
    data[i] = 0.299 * rgba[j] + 0.587 * rgba[j + 1] + 0.114 * rgba[j + 2]
  }
  return { width, height, data }
}

function halve(img: GreyImage): GreyImage {
  const width = Math.floor(img.width / 2), height = Math.floor(img.height / 2)
  const data = new Float32Array(width * height)
  const src = img.data, w = img.width
  for (let y = 0; y < height; y++) {
    const r0 = 2 * y * w, r1 = r0 + w
    for (let x = 0; x < width; x++) {
      const c = 2 * x
      data[y * width + x] = 0.25 * (src[r0 + c] + src[r0 + c + 1] + src[r1 + c] + src[r1 + c + 1])
    }
  }
  return { width, height, data }
}

/** Level 0 is the image itself; each further level is half the size. */
export function buildPyramid(img: GreyImage, levels = 3): GreyImage[] {
  const out = [img]
  while (out.length < levels && out[out.length - 1].width >= 32 && out[out.length - 1].height >= 32) {
    out.push(halve(out[out.length - 1]))
  }
  return out
}

/** Bilinear sample; the caller keeps (x, y) inside [0, w-1) x [0, h-1). */
function sample(img: GreyImage, x: number, y: number): number {
  const x0 = Math.floor(x), y0 = Math.floor(y)
  const fx = x - x0, fy = y - y0
  const i = y0 * img.width + x0
  const d = img.data
  const top = d[i] + fx * (d[i + 1] - d[i])
  const bottom = d[i + img.width] + fx * (d[i + img.width + 1] - d[i + img.width])
  return top + fy * (bottom - top)
}

export interface CornerOptions {
  /** Corners are picked as the best one per cell, so they spread over the
   * frame instead of piling onto the one textured poster. */
  cols?: number
  rows?: number
  /** Relative to the strongest corner, as goodFeaturesToTrack's qualityLevel. */
  quality?: number
  /** Kept clear of the edge so a tracking window fits around every corner. */
  margin?: number
}

/** Shi-Tomasi corners: the smaller eigenvalue of the gradient structure
 * tensor over a 3x3 block, best per grid cell. */
export function findCorners(img: GreyImage, opts: CornerOptions = {}): Point[] {
  const { cols = 12, rows = 8, quality = 0.01, margin = 10 } = opts
  const { width: w, height: h, data: d } = img
  if (w < 2 * margin + 3 || h < 2 * margin + 3) return []
  const xx = new Float32Array(w * h), xy = new Float32Array(w * h), yy = new Float32Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const gx = 0.5 * (d[i + 1] - d[i - 1])
      const gy = 0.5 * (d[i + w] - d[i - w])
      xx[i] = gx * gx; xy[i] = gx * gy; yy[i] = gy * gy
    }
  }
  const score = new Float32Array(w * h)
  let best = 0
  for (let y = margin; y < h - margin; y++) {
    for (let x = margin; x < w - margin; x++) {
      let a = 0, b = 0, c = 0
      for (let v = -1; v <= 1; v++) {
        for (let u = -1; u <= 1; u++) {
          const j = (y + v) * w + x + u
          a += xx[j]; b += xy[j]; c += yy[j]
        }
      }
      const half = 0.5 * (a + c)
      const s = half - Math.sqrt(0.25 * (a - c) * (a - c) + b * b)
      score[y * w + x] = s
      if (s > best) best = s
    }
  }
  // A flat frame has no corners at all; a near-flat one would yield noise.
  if (best < 1) return []
  const floor = best * quality
  const out: Point[] = []
  const cw = (w - 2 * margin) / cols, ch = (h - 2 * margin) / rows
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k < cols; k++) {
      const x0 = Math.floor(margin + k * cw), x1 = Math.floor(margin + (k + 1) * cw)
      const y0 = Math.floor(margin + r * ch), y1 = Math.floor(margin + (r + 1) * ch)
      let bs = floor, bx = -1, by = -1
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const s = score[y * w + x]
          if (s > bs) { bs = s; bx = x; by = y }
        }
      }
      if (bx >= 0) out.push({ x: bx, y: by })
    }
  }
  return out
}

/** Half-width of the Lucas-Kanade window: 15x15 at 320 px is the prototype's
 * 21x21 at 480 px, scaled. */
const LK_HALF = 7
const LK_ITERATIONS = 20
const LK_EPSILON = 0.01

/** Where `p` (a point of the previous frame, level-0 pixels) went in the
 * current one, or null when it could not be followed. Pyramidal Lucas-Kanade:
 * solved at the coarsest level first, so a shift bigger than the window is
 * still found. */
export function trackPoint(prev: GreyImage[], cur: GreyImage[], p: Point): Point | null {
  let gx = 0, gy = 0
  const n = LK_HALF * 2 + 1
  const tpl = new Float32Array(n * n), ix = new Float32Array(n * n), iy = new Float32Array(n * n)
  for (let level = Math.min(prev.length, cur.length) - 1; level >= 0; level--) {
    const P = prev[level], C = cur[level]
    const s = 2 ** level
    const px = p.x / s, py = p.y / s
    const lo = LK_HALF + 1
    const inside = px >= lo && py >= lo && px < P.width - lo - 1 && py < P.height - lo - 1
    if (!inside) {
      if (level === 0) return null
      gx *= 2; gy *= 2
      continue
    }
    let a = 0, b = 0, c = 0
    for (let v = -LK_HALF, k = 0; v <= LK_HALF; v++) {
      for (let u = -LK_HALF; u <= LK_HALF; u++, k++) {
        const x = px + u, y = py + v
        tpl[k] = sample(P, x, y)
        const dx = 0.5 * (sample(P, x + 1, y) - sample(P, x - 1, y))
        const dy = 0.5 * (sample(P, x, y + 1) - sample(P, x, y - 1))
        ix[k] = dx; iy[k] = dy
        a += dx * dx; b += dx * dy; c += dy * dy
      }
    }
    const det = a * c - b * b
    // Too little texture to say which way it moved (an edge, or flat).
    if (det < 1e-3 * (a + c) * (a + c) || a + c < 1e-6) return null
    let dx = 0, dy = 0
    for (let it = 0; it < LK_ITERATIONS; it++) {
      const ox = px + gx + dx, oy = py + gy + dy
      if (ox < lo || oy < lo || ox >= C.width - lo - 1 || oy >= C.height - lo - 1) return null
      let bx = 0, by = 0
      for (let v = -LK_HALF, k = 0; v <= LK_HALF; v++) {
        for (let u = -LK_HALF; u <= LK_HALF; u++, k++) {
          const e = tpl[k] - sample(C, ox + u, oy + v)
          bx += e * ix[k]; by += e * iy[k]
        }
      }
      const ux = (c * bx - b * by) / det
      const uy = (a * by - b * bx) / det
      dx += ux; dy += uy
      if (ux * ux + uy * uy < LK_EPSILON * LK_EPSILON) break
    }
    gx += dx; gy += dy
    if (level > 0) { gx *= 2; gy *= 2 }
  }
  return { x: p.x + gx, y: p.y + gy }
}

/** q = [a -b; b a] p + t: OpenCV's estimateAffinePartial2D model. */
export interface Similarity { a: number; b: number; tx: number; ty: number }

/** Least-squares similarity from p to q (at least two points). */
export function fitSimilarity(p: Point[], q: Point[]): Similarity | null {
  const n = p.length
  if (n < 2) return null
  let pmx = 0, pmy = 0, qmx = 0, qmy = 0
  for (let i = 0; i < n; i++) { pmx += p[i].x; pmy += p[i].y; qmx += q[i].x; qmy += q[i].y }
  pmx /= n; pmy /= n; qmx /= n; qmy /= n
  let den = 0, sa = 0, sb = 0
  for (let i = 0; i < n; i++) {
    const ux = p[i].x - pmx, uy = p[i].y - pmy, vx = q[i].x - qmx, vy = q[i].y - qmy
    den += ux * ux + uy * uy
    sa += ux * vx + uy * vy
    sb += ux * vy - uy * vx
  }
  if (den < 1e-9) return null
  const a = sa / den, b = sb / den
  return { a, b, tx: qmx - (a * pmx - b * pmy), ty: qmy - (b * pmx + a * pmy) }
}

/** Reprojection threshold, estimate pixels: the prototype's 2.0 at 480 px. */
const RANSAC_THRESHOLD = 1.4
const RANSAC_ITERATIONS = 80
const MIN_POINTS = 8

/** RANSAC over two-point samples, then a refit on the inliers. Seeded, so the
 * same frames give the same answer. */
export function fitSimilarityRansac(p: Point[], q: Point[], seed = 1): { model: Similarity; inliers: number } | null {
  const n = p.length
  if (n < MIN_POINTS) return null
  let state = seed >>> 0 || 1
  const rand = () => {
    state ^= state << 13; state >>>= 0
    state ^= state >>> 17
    state ^= state << 5; state >>>= 0
    return state / 4294967296
  }
  const t2 = RANSAC_THRESHOLD * RANSAC_THRESHOLD
  const inlierMask = (m: Similarity, mask: boolean[]): number => {
    let count = 0
    for (let i = 0; i < n; i++) {
      const ex = m.a * p[i].x - m.b * p[i].y + m.tx - q[i].x
      const ey = m.b * p[i].x + m.a * p[i].y + m.ty - q[i].y
      mask[i] = ex * ex + ey * ey < t2
      if (mask[i]) count++
    }
    return count
  }
  let bestCount = 0
  let bestMask: boolean[] = []
  const mask: boolean[] = new Array(n)
  for (let it = 0; it < RANSAC_ITERATIONS; it++) {
    const i = Math.floor(rand() * n)
    let j = Math.floor(rand() * (n - 1))
    if (j >= i) j++
    const dxp = p[i].x - p[j].x, dyp = p[i].y - p[j].y
    if (dxp * dxp + dyp * dyp < 100) continue // too close to fix a rotation
    const m = fitSimilarity([p[i], p[j]], [q[i], q[j]])
    if (!m) continue
    const count = inlierMask(m, mask)
    if (count > bestCount) { bestCount = count; bestMask = mask.slice() }
  }
  if (bestCount < MIN_POINTS) return null
  const ip: Point[] = [], iq: Point[] = []
  for (let i = 0; i < n; i++) if (bestMask[i]) { ip.push(p[i]); iq.push(q[i]) }
  const model = fitSimilarity(ip, iq)
  return model ? { model, inliers: bestCount } : null
}

const NO_MOTION: Motion = { dx: 0, dy: 0, da: 0, ok: false }

/** Feed it one grey frame at a time; it reports how the picture moved since
 * the frame before. */
export class MotionEstimator {
  failures = 0
  private prev: GreyImage[] | null = null

  step(frame: GreyImage): Motion {
    const cur = buildPyramid(frame, 3)
    const prev = this.prev
    this.prev = cur
    if (!prev || prev[0].width !== frame.width || prev[0].height !== frame.height) {
      return { dx: 0, dy: 0, da: 0, ok: true }
    }
    const corners = findCorners(prev[0])
    const from: Point[] = [], to: Point[] = []
    for (const c of corners) {
      const t = trackPoint(prev, cur, c)
      if (t) { from.push(c); to.push(t) }
    }
    const fit = fitSimilarityRansac(from, to)
    if (!fit) {
      this.failures++
      return NO_MOTION
    }
    const { a, b, tx, ty } = fit.model
    // The shift of the picture's CENTRE, not of the model's origin (the
    // top-left corner): about the corner, a 1 degree roll reads as several
    // pixels of shift, and the correction would then fight the roll with a
    // slide. Same reasoning as the prototype.
    const cx = frame.width / 2, cy = frame.height / 2
    return {
      dx: a * cx - b * cy + tx - cx,
      dy: b * cx + a * cy + ty - cy,
      da: Math.atan2(b, a),
      ok: true,
    }
  }

  reset(): void {
    this.prev = null
  }
}
