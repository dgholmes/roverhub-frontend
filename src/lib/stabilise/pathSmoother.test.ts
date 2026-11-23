import { describe, expect, it } from 'vitest'
import { PathSmoother, jitterRms, type Correction } from './pathSmoother'

const FPS = 15
const still = { dx: 0, dy: 0, da: 0, ok: true }

/** The measured gait: a 1.38 Hz bounce, plus roll at ~4 Hz. Returns
 * frame-to-frame motion (what the estimator reports). */
function gait(frames: number, amp = 6): { dx: number; dy: number; da: number; ok: boolean }[] {
  const pos = (i: number) => ({
    x: 0.3 * amp * Math.sin(2 * Math.PI * 0.69 * i / FPS),
    y: amp * Math.sin(2 * Math.PI * 1.38 * i / FPS),
    a: 0.008 * Math.sin(2 * Math.PI * 4 * i / FPS),
  })
  return Array.from({ length: frames }, (_, i) => {
    if (i === 0) return still
    const a = pos(i - 1), b = pos(i)
    return { dx: b.x - a.x, dy: b.y - a.y, da: b.a - a.a, ok: true }
  })
}

/** Frame-to-frame motion the viewer sees: raw motion plus the change in
 * correction between consecutive shown frames. */
function shown(raw: { dx: number; dy: number; da: number }[], out: { item: number; correction: Correction }[]) {
  const res = []
  for (let k = 1; k < out.length; k++) {
    const i = out[k].item
    const c0 = out[k - 1].correction, c1 = out[k].correction
    res.push({ dx: raw[i].dx + c1.dx - c0.dx, dy: raw[i].dy + c1.dy - c0.dy, da: raw[i].da + c1.da - c0.da })
  }
  return res
}

function run(lookahead: number, motion = gait(300)) {
  const s = new PathSmoother<number>({ fps: FPS, lookahead, width: 320, height: 180, crop: 0.08 })
  const out: { item: number; correction: Correction }[] = []
  motion.forEach((m, i) => out.push(...s.push(m, i).emit))
  return { s, out, motion }
}

describe('PathSmoother', () => {
  it('in causal mode shows each frame at once', () => {
    const s = new PathSmoother<number>({ fps: FPS, lookahead: 0, width: 320, height: 180, crop: 0.08 })
    expect(s.push(still, 0).emit.map((e) => e.item)).toEqual([0])
    expect(s.push(still, 1).emit.map((e) => e.item)).toEqual([1])
    expect(s.delayFrames).toBe(0)
  })

  it('in lookahead mode holds each frame back exactly N frames', () => {
    const s = new PathSmoother<number>({ fps: FPS, lookahead: 4, width: 320, height: 180, crop: 0.08 })
    const shownAt: number[][] = []
    for (let i = 0; i < 8; i++) shownAt.push(s.push(still, i).emit.map((e) => e.item))
    expect(shownAt).toEqual([[], [], [], [], [0], [1], [2], [3]])
    expect(s.delayFrames).toBe(4)
  })

  it('leaves a still camera alone', () => {
    const { out } = run(4, Array.from({ length: 30 }, () => still))
    for (const e of out) expect(e.correction).toEqual({ dx: 0, dy: 0, da: 0 })
  })

  it('removes most of the gait bounce with lookahead, and about half without', () => {
    const raw = gait(300)
    const before = jitterRms(raw, FPS).px
    const look = jitterRms(shown(raw, run(4, raw).out), FPS).px
    const causal = jitterRms(shown(raw, run(0, raw).out), FPS).px
    expect(1 - look / before).toBeGreaterThan(0.6)
    expect(1 - causal / before).toBeGreaterThan(0.3)
    expect(look).toBeLessThan(causal)
  })

  it('keeps a deliberate turn: the correction comes back to zero once it ends', () => {
    // A steady 4 px/frame pan for 2 s, then still.
    const motion = [...Array.from({ length: 30 }, () => ({ dx: 4, dy: 0, da: 0, ok: true })),
      ...Array.from({ length: 60 }, () => still)]
    for (const n of [0, 4]) {
      const { out } = run(n, motion)
      expect(Math.abs(out[out.length - 1].correction.dx)).toBeLessThan(0.5)
    }
  })

  it('never corrects past the crop margin', () => {
    const motion = Array.from({ length: 40 }, () => ({ dx: 30, dy: 30, da: 0, ok: true }))
    const { out } = run(0, motion)
    for (const e of out) {
      expect(Math.abs(e.correction.dx)).toBeLessThanOrEqual(320 * 0.08 / 2 + 1e-9)
      expect(Math.abs(e.correction.dy)).toBeLessThanOrEqual(180 * 0.08 / 2 + 1e-9)
    }
  })

  it('switching to causal drops the held frames and shows the newest at once', () => {
    const s = new PathSmoother<number>({ fps: FPS, lookahead: 4, width: 320, height: 180, crop: 0.08 })
    for (let i = 0; i < 10; i++) s.push(still, i)
    const r = s.setLookahead(0)
    expect(r.dropped).toEqual([6, 7, 8])
    expect(r.emit.map((e) => e.item)).toEqual([9])
    expect(s.push(still, 10).emit.map((e) => e.item)).toEqual([10])
  })

  it('switching back to lookahead builds the delay up again', () => {
    const s = new PathSmoother<number>({ fps: FPS, lookahead: 0, width: 320, height: 180, crop: 0.08 })
    for (let i = 0; i < 5; i++) s.push(still, i)
    expect(s.setLookahead(4)).toEqual({ emit: [], dropped: [] })
    const shownAt = [5, 6, 7, 8, 9].map((i) => s.push(still, i).emit.map((e) => e.item))
    expect(shownAt).toEqual([[], [], [], [], [5]])
  })

  it('reset hands back every held frame so the caller can release it', () => {
    const s = new PathSmoother<number>({ fps: FPS, lookahead: 4, width: 320, height: 180, crop: 0.08 })
    for (let i = 0; i < 3; i++) s.push(still, i)
    expect(s.reset()).toEqual([0, 1, 2])
    expect(s.reset()).toEqual([])
  })
})
