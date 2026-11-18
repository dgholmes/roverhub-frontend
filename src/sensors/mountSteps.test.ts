import { describe, expect, it } from 'vitest'
import type { LidarMountEstimate, LidarMountStatus } from '@/types/sensors'
import { barFraction, mountSteps } from './mountSteps'

const inUse = { x_m: 0.234, y_m: 0.015, z_m: 0.25, roll_deg: 0, pitch_deg: 19.4, yaw_deg: 0 }
const est = (over: Partial<LidarMountEstimate> = {}): LidarMountEstimate => ({
  x_m: null, y_m: null, sd_x_m: null, sd_y_m: null, roll_deg: -0.6, pitch_deg: 19.4, sd_tilt_deg: 0.1,
  turns: 0, still_samples: 840, since: null, updated_at: null,
  turns_left: 0, turns_right: 0, offset_confident: false, tilt_confident: true, last_turn: null,
  ...over,
})
const status = (measured: LidarMountEstimate | null, over: Partial<LidarMountStatus['in_use']> = {}) =>
  ({ in_use: { ...inUse, ...over }, measured })

describe('mountSteps', () => {
  it('reads rover-jetson as it stood on 2026-11-18: tilt right, offset waiting for turns', () => {
    const s = mountSteps(status(est({ turns_left: 2, turns_right: 1, turns: 3 })))
    expect(s.tilt).toMatchObject({ state: 'ok', measured: { pitch: 19.4, roll: -0.6 }, rollDiffers: false })
    expect(s.offset).toMatchObject({ state: 'measuring', turns: 3, target: 8, left: 2, right: 1, eachWayTarget: 3, measured: null, unsteady: false })
    expect(s.allDone).toBe(false)
  })

  it('says the tilt differs past 1° on pitch or roll, and names the roll only when it is what differs', () => {
    expect(mountSteps(status(est(), { pitch_deg: 17 })).tilt).toMatchObject({ state: 'differs', rollDiffers: false })
    expect(mountSteps(status(est({ roll_deg: 2.5 }))).tilt).toMatchObject({ state: 'differs', rollDiffers: true })
  })

  it('keeps the tilt measuring until the robot trusts it, with the still readings so far', () => {
    expect(mountSteps(status(est({ tilt_confident: false, still_samples: 120 }))).tilt).toMatchObject({ state: 'measuring', measured: null, stillSamples: 120 })
    expect(mountSteps(status(null)).tilt).toMatchObject({ state: 'measuring', stillSamples: 0 })
  })

  it('keys the offset on offset_confident, and calls 8 turns without it unsteady', () => {
    const counted = est({ x_m: 0.25, y_m: 0.012, sd_x_m: 0.02, sd_y_m: 0.02, turns: 8, turns_left: 4, turns_right: 4 })
    expect(mountSteps(status(counted)).offset).toMatchObject({ state: 'measuring', unsteady: true })
    // Not all each way yet: not "unsteady", just not done.
    expect(mountSteps(status({ ...counted, turns_left: 6, turns_right: 2 })).offset.unsteady).toBe(false)
    const sure = mountSteps(status({ ...counted, offset_confident: true }))
    expect(sure.offset).toMatchObject({ state: 'ok', measured: { x: 0.25, y: 0.012 }, unsteady: false })
    expect(sure.allDone).toBe(true)
    expect(mountSteps(status({ ...counted, offset_confident: true, x_m: 0.3 })).offset.state).toBe('differs')
  })

  it('shows the total only for a bridge older than 0.0.25', () => {
    const old = est({ turns: 5, turns_left: null, turns_right: null, offset_confident: null, tilt_confident: null })
    expect(mountSteps(status(old)).offset).toMatchObject({ turns: 5, left: null, right: null })
    expect(mountSteps(status({ ...old, turns_left: 3 })).offset).toMatchObject({ left: null, right: null })
  })

  it('fills a bar to the each-way target and no further', () => {
    expect(barFraction(0, 3)).toBe(0)
    expect(barFraction(2, 3)).toBeCloseTo(2 / 3)
    expect(barFraction(5, 3)).toBe(1)
  })
})
