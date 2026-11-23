/**
 * Smoothing the camera's path, live.
 *
 * The camera's path is the running sum of the frame-to-frame motion. Shake is
 * the fast part of it; a deliberate turn is the slow part. Each frame is shown
 * shifted and rolled by (smoothed path - path), so the picture follows the slow
 * part only. Same arithmetic as the prototype (`tools/video_stab/
 * stabilise_clip.py`, `smooth_causal` / `smooth_lookahead`), done one frame at a
 * time because a live feed cannot see the future:
 *
 * - lookahead N > 0: a Gaussian over the last and the next N frames. Frame i is
 *   shown once frame i + N has arrived, so the picture is N frames late
 *   (4 frames = 267 ms at 15 fps; measured on a real walk to remove ~75 % of the
 *   shake, against ~51 % for causal).
 * - lookahead 0 (causal): a one-pole low-pass over past frames only. No delay,
 *   but a turn is followed late and the picture floats a little.
 *
 * Generic over the frame handle `T` so the caller decides what a frame is
 * (a VideoFrame in the browser, a number in tests). Frames this class stops
 * holding without showing come back in `dropped`, for the caller to release.
 */

export interface Correction { dx: number; dy: number; da: number }
export interface FrameMotion { dx: number; dy: number; da: number; ok?: boolean }

export interface SmootherOptions {
  fps: number
  /** Frames of lookahead (= added delay); 0 for causal. */
  lookahead: number
  /** Frame size in the units motion is measured in, for the crop margin. */
  width: number
  height: number
  /** Share of width and height zoomed away so a moved edge stays out of view. */
  crop: number
  /** Motion slower than this is kept as deliberate. The prototype's measured
   * best: 0.6 Hz with lookahead, 1.0 Hz causal (a lower causal cutoff lags a
   * turn badly). */
  lookaheadCutoffHz?: number
  causalCutoffHz?: number
}

export interface Shown<T> { item: T; correction: Correction }
export interface PushResult<T> { emit: Shown<T>[]; dropped: T[] }

interface PathPoint { x: number; y: number; a: number }

export class PathSmoother<T> {
  private readonly opts: Required<SmootherOptions>
  private lookahead: number
  private weights: number[] = []
  /** The last 2N+1 path points; the newest is last. */
  private window: PathPoint[] = []
  /** Frames not yet shown, oldest first; at most N. */
  private held: { item: T; path: PathPoint }[] = []
  private path: PathPoint = { x: 0, y: 0, a: 0 }
  private causal: PathPoint | null = null

  constructor(opts: SmootherOptions) {
    this.opts = { lookaheadCutoffHz: 0.6, causalCutoffHz: 1.0, ...opts }
    this.lookahead = 0
    this.setWeights(Math.max(0, Math.round(opts.lookahead)))
  }

  /** Frames of delay this smoother adds right now. */
  get delayFrames(): number {
    return this.lookahead
  }

  private setWeights(n: number): void {
    this.lookahead = n
    // The Gaussian whose -3 dB point is the cutoff, as in the prototype.
    const sigma = this.opts.fps / (2 * Math.PI * this.opts.lookaheadCutoffHz)
    this.weights = []
    for (let k = -n; k <= n; k++) this.weights.push(Math.exp(-0.5 * (k / sigma) ** 2))
  }

  private clamp(c: Correction): Correction {
    const mx = (this.opts.width * this.opts.crop) / 2
    const my = (this.opts.height * this.opts.crop) / 2
    return { dx: Math.max(-mx, Math.min(mx, c.dx)), dy: Math.max(-my, Math.min(my, c.dy)), da: c.da }
  }

  /** Gaussian-weighted mean of the window around window[centre]; the window is
   * truncated at the start of the stream, as the prototype truncates at the
   * clip's edges. */
  private gaussianAt(centre: number): PathPoint {
    const n = this.lookahead
    let sx = 0, sy = 0, sa = 0, sw = 0
    for (let j = 0; j < this.window.length; j++) {
      const k = j - centre
      if (k < -n || k > n) continue
      const w = this.weights[k + n]
      sx += w * this.window[j].x; sy += w * this.window[j].y; sa += w * this.window[j].a; sw += w
    }
    return { x: sx / sw, y: sy / sw, a: sa / sw }
  }

  private causalStep(): Correction {
    const alpha = 1 - Math.exp(-2 * Math.PI * this.opts.causalCutoffHz / this.opts.fps)
    const p = this.path
    const c = this.causal ?? { ...p }
    c.x += alpha * (p.x - c.x); c.y += alpha * (p.y - c.y); c.a += alpha * (p.a - c.a)
    this.causal = c
    return this.clamp({ dx: c.x - p.x, dy: c.y - p.y, da: c.a - p.a })
  }

  /** One new frame and how the picture moved since the previous one. Returns
   * the frames to show now (zero or one), each with its correction. */
  push(motion: FrameMotion, item: T): PushResult<T> {
    this.path = { x: this.path.x + motion.dx, y: this.path.y + motion.dy, a: this.path.a + motion.da }
    this.window.push(this.path)
    const keep = 2 * Math.max(this.lookahead, 1) + 1
    if (this.window.length > keep) this.window.splice(0, this.window.length - keep)

    if (this.lookahead === 0) return { emit: [{ item, correction: this.causalStep() }], dropped: [] }

    // Keep the causal filter warm so a switch to causal does not start cold.
    this.causalStep()
    this.held.push({ item, path: this.path })
    if (this.held.length <= this.lookahead) return { emit: [], dropped: [] }
    const out = this.held.shift()!
    const centre = this.window.length - 1 - this.lookahead
    const s = this.gaussianAt(centre)
    const p = out.path
    return { emit: [{ item: out.item, correction: this.clamp({ dx: s.x - p.x, dy: s.y - p.y, da: s.a - p.a }) }], dropped: [] }
  }

  /** Change the lookahead. Going to 0 (the viewer took control) drops the held
   * frames and shows the newest at once: the picture jumps forward by the old
   * delay, once. Going up builds the delay up from the next frame (the picture
   * holds still for that long). */
  setLookahead(frames: number): PushResult<T> {
    const n = Math.max(0, Math.round(frames))
    if (n === this.lookahead) return { emit: [], dropped: [] }
    const held = this.held
    this.held = []
    this.setWeights(n)
    if (n > 0 || held.length === 0) {
      // Frames held for a longer lookahead are shown as they come due under
      // the new one only if it is still a lookahead; otherwise released below.
      return { emit: [], dropped: held.map((h) => h.item) }
    }
    const newest = held[held.length - 1]
    const dropped = held.slice(0, -1).map((h) => h.item)
    const c = this.causal ?? this.path
    return {
      emit: [{ item: newest.item, correction: this.clamp({ dx: c.x - this.path.x, dy: c.y - this.path.y, da: c.a - this.path.a }) }],
      dropped,
    }
  }

  /** Forget everything (a new stream, or a resolution change). Returns the held
   * frames for the caller to release. */
  reset(): T[] {
    const held = this.held.map((h) => h.item)
    this.held = []
    this.window = []
    this.path = { x: 0, y: 0, a: 0 }
    this.causal = null
    return held
  }
}

/** RMS of frame-to-frame motion after removing its slow part: the shake a
 * viewer sees, independent of deliberate turns. The prototype's
 * `jitter_stats`, so numbers compare. */
export function jitterRms(motion: { dx: number; dy: number; da: number }[], fps: number): { px: number; deg: number } {
  const k = Math.max(3, Math.floor(fps / 2) | 1)
  const hf = (vals: number[]) => {
    // np.convolve(mode="same") with a box of k: zero-padded at the ends.
    const h = Math.floor(k / 2)
    return vals.map((v, i) => {
      let s = 0
      for (let j = i - h; j <= i + h; j++) if (j >= 0 && j < vals.length) s += vals[j]
      return v - s / k
    })
  }
  const x = hf(motion.map((m) => m.dx)), y = hf(motion.map((m) => m.dy)), a = hf(motion.map((m) => m.da))
  const n = Math.max(1, motion.length)
  let sp = 0, sa = 0
  for (let i = 0; i < motion.length; i++) { sp += x[i] * x[i] + y[i] * y[i]; sa += a[i] * a[i] }
  return { px: Math.sqrt(sp / n), deg: (Math.sqrt(sa / n) * 180) / Math.PI }
}
