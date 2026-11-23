/**
 * Measures the browser stabiliser on a real recorded walk, the way the
 * prototype measures itself: stabilise every frame, then re-estimate the
 * motion of the OUTPUT with the same estimator and compare its jitter with the
 * input's. Skipped unless STAB_CLIP names a raw 320x180 grey clip:
 *
 *   ffmpeg -i clip.mp4 -vf scale=320:180,format=gray -f rawvideo clip.gray
 *   STAB_CLIP=clip.gray npx vitest run src/lib/stabilise/clip.measure
 *
 * Prints one JSON line per mode. Not part of CI: the clip is not in the repo.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EST_WIDTH, MotionEstimator, type GreyImage } from './motion'
import { PathSmoother, jitterRms, type Correction } from './pathSmoother'
import { correctionMatrix } from './transform'

const CLIP = process.env.STAB_CLIP
const W = EST_WIDTH, H = 180, FPS = 15, CROP = 0.08

/** The frame as the canvas would draw it (bilinear, black outside). */
function warpGrey(src: GreyImage, c: Correction): GreyImage {
  const [a, b, cc, d, e, f] = correctionMatrix(c, src.width, src.height, CROP)
  // Invert the affine to sample the source for each output pixel.
  const det = a * d - b * cc
  const ia = d / det, ib = -b / det, ic = -cc / det, id = a / det
  const out = new Float32Array(src.width * src.height)
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const u = x - e, v = y - f
      const sx = ia * u + ic * v, sy = ib * u + id * v
      const x0 = Math.floor(sx), y0 = Math.floor(sy)
      if (x0 < 0 || y0 < 0 || x0 >= src.width - 1 || y0 >= src.height - 1) continue
      const fx = sx - x0, fy = sy - y0, i = y0 * src.width + x0
      const top = src.data[i] + fx * (src.data[i + 1] - src.data[i])
      const bot = src.data[i + src.width] + fx * (src.data[i + src.width + 1] - src.data[i + src.width])
      out[y * src.width + x] = top + fy * (bot - top)
    }
  }
  return { width: src.width, height: src.height, data: out }
}

describe.skipIf(!CLIP)('stabiliser on a recorded clip', () => {
  it('reports shake removed and per-frame cost', () => {
    const bytes = readFileSync(CLIP!)
    const n = Math.floor(bytes.length / (W * H))
    const frames: GreyImage[] = []
    for (let i = 0; i < n; i++) {
      frames.push({ width: W, height: H, data: Float32Array.from(bytes.subarray(i * W * H, (i + 1) * W * H)) })
    }
    const est = new MotionEstimator()
    const t0 = performance.now()
    const motion = frames.map((f) => est.step(f))
    const estMs = (performance.now() - t0) / n
    const before = jitterRms(motion, FPS)

    for (const [name, lookahead] of [['causal', 0], ['lookahead', 4]] as const) {
      const s = new PathSmoother<number>({ fps: FPS, lookahead, width: W, height: H, crop: CROP })
      const shown: { i: number; c: Correction }[] = []
      motion.forEach((m, i) => s.push(m, i).emit.forEach((e) => shown.push({ i: e.item, c: e.correction })))
      const re = new MotionEstimator()
      const out = shown.map(({ i, c }) => re.step(warpGrey(frames[i], c)))
      // The raw clip's first `lookahead` frames are never shown; compare like with like.
      const after = jitterRms(out, FPS)
      const ref = jitterRms(motion.slice(shown[0].i), FPS)
      const removed = 1 - after.px / ref.px
      console.log(JSON.stringify({
        mode: name, frames: n, est_ms_per_frame: +estMs.toFixed(2), tracking_failures: est.failures,
        raw_px_rms_at_320: +before.px.toFixed(3), raw_px_rms_at_1280: +(before.px * 4).toFixed(2),
        raw_deg_rms: +before.deg.toFixed(3), out_px_rms_at_320: +after.px.toFixed(3),
        out_deg_rms: +after.deg.toFixed(3), shake_removed_pct: +(100 * removed).toFixed(1),
        delay_ms: Math.round(lookahead * 1000 / FPS),
      }))
      expect(removed).toBeGreaterThan(0.3)
    }
  }, 120_000)
})
