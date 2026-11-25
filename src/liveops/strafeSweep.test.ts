import { describe, expect, it } from 'vitest'
import { DRIVE_KEEPALIVE_MS } from '@/lib/teleop'
import {
  clockTime,
  STRAFE_CURVE,
  STRAFE_HOLD_MS,
  STRAFE_REST_MS,
  STRAFE_SWEEP_LEVELS,
  STRAFE_SWEEP_RESEND_MS,
  STRAFE_SWEEP_SPEED_RATIO,
  STRAFE_SWEEP_STEPS,
  STRAFE_SWEEP_TOTAL_MS,
  strafeSweepAt,
} from './strafeSweep'

/** joy_mapping.stick_for, for positive speeds above the dead-zone jump. */
function stickFor(vy: number): number {
  const mag = Math.abs(vy)
  if (mag <= STRAFE_CURVE[0][1]) return STRAFE_CURVE[0][0]
  for (let i = 1; i < STRAFE_CURVE.length; i++) {
    const [s0, v0] = STRAFE_CURVE[i - 1]
    const [s1, v1] = STRAFE_CURVE[i]
    if (mag <= v1) return s0 + ((s1 - s0) * (mag - v0)) / (v1 - v0)
  }
  return STRAFE_CURVE[STRAFE_CURVE.length - 1][0]
}

describe('strafe sweep schedule', () => {
  it('mirrors the bridge curve', () => {
    expect(STRAFE_CURVE).toEqual([[0.5, 0.025], [0.55, 0.05], [0.6, 0.07], [0.65, 0.085], [0.7, 0.10], [0.9, 0.27], [1.0, 0.32]])
  })

  it('gives each level the vy that lands exactly on its stick', () => {
    expect(STRAFE_SWEEP_LEVELS.map((l) => l.stick)).toEqual([0.5, 0.55, 0.6, 0.65])
    expect(STRAFE_SWEEP_LEVELS.map((l) => l.vy)).toEqual([0.025, 0.05, 0.07, 0.085])
    for (const { stick, vy } of STRAFE_SWEEP_LEVELS) expect(stickFor(vy)).toBeCloseTo(stick, 9)
  })

  it('runs left, rest, right, rest at each level in order', () => {
    expect(STRAFE_SWEEP_STEPS).toHaveLength(16)
    const summary = STRAFE_SWEEP_STEPS.map((s) => [s.kind, s.side, s.stick, s.vy, s.durationMs])
    const expected: unknown[] = []
    for (const [stick, vy] of [[0.5, 0.025], [0.55, 0.05], [0.6, 0.07], [0.65, 0.085]]) {
      expected.push(['hold', 'left', stick, vy, 2000])
      expected.push(['rest', 'left', stick, 0, 1500])
      expected.push(['hold', 'right', stick, -vy, 2000])
      expected.push(['rest', 'right', stick, 0, 1500])
    }
    expect(summary).toEqual(expected)
    expect(STRAFE_SWEEP_STEPS.map((s) => s.index)).toEqual([...Array(16).keys()])
  })

  it('lays the steps end to end, 28 s in all', () => {
    let at = 0
    for (const step of STRAFE_SWEEP_STEPS) {
      expect(step.startMs).toBe(at)
      at += step.durationMs
    }
    expect(STRAFE_HOLD_MS).toBe(2000)
    expect(STRAFE_REST_MS).toBe(1500)
    expect(STRAFE_SWEEP_TOTAL_MS).toBe(28_000)
    expect(at).toBe(28_000)
  })

  it('drives at navigation speed and resends at the manual keepalive', () => {
    expect(STRAFE_SWEEP_SPEED_RATIO).toBe(80)
    expect(STRAFE_SWEEP_RESEND_MS).toBe(DRIVE_KEEPALIVE_MS)
  })
})

describe('strafeSweepAt', () => {
  const at = (ms: number) => {
    const r = strafeSweepAt(ms)
    return r.done ? 'done' : [r.step.index, r.remainingMs]
  }

  it('starts on the first left hold', () => {
    expect(at(0)).toEqual([0, 2000])
    expect(at(-50)).toEqual([0, 2000])
  })

  it('hands over exactly at each boundary', () => {
    expect(at(1999)).toEqual([0, 1])
    expect(at(2000)).toEqual([1, 1500])
    expect(at(3499)).toEqual([1, 1])
    expect(at(3500)).toEqual([2, 2000])
    expect(at(5500)).toEqual([3, 1500])
    expect(at(7000)).toEqual([4, 2000])
    expect(at(26_500)).toEqual([15, 1500])
    expect(at(27_999)).toEqual([15, 1])
  })

  it('is done at and after the total', () => {
    expect(at(28_000)).toBe('done')
    expect(at(60_000)).toBe('done')
  })
})

describe('clockTime', () => {
  it('pads hours, minutes and seconds', () => {
    expect(clockTime(new Date(2026, 10, 24, 9, 3, 5))).toBe('09:03:05')
    expect(clockTime(new Date(2026, 10, 24, 23, 59, 59))).toBe('23:59:59')
  })
})
