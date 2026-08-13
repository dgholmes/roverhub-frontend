import { describe, expect, it } from 'vitest'

import {
  DRIVE_EPSILON,
  DRIVE_INPUT_POLL_MS,
  DRIVE_KEEPALIVE_MS,
  DRIVE_STOP,
  keepaliveDue,
  setpointChanged,
} from './teleop'

/**
 * These gate every command the manual-drive loop sends. The old loop sent one
 * bounded burst every 250 ms unconditionally, which measured 44-53% of samples
 * stalled and half the achievable speed, because every RPC boundary costs the
 * robot a settle. So "did the setpoint actually change?" is now the difference
 * between smooth driving and the original bug.
 */
describe('setpointChanged', () => {
  it('always sends the first setpoint', () => {
    expect(setpointChanged(null, { vx: 0.5, vy: 0, vyaw: 0 })).toBe(true)
  })

  it('suppresses an identical setpoint', () => {
    const held = { vx: 0.5, vy: 0, vyaw: 0 }
    expect(setpointChanged(held, { ...held })).toBe(false)
  })

  it('suppresses sub-epsilon mouse jitter', () => {
    // Mouse-yaw accumulation varies continuously; without this every poll would
    // re-issue and reintroduce the per-tick settle.
    const held = { vx: 0.5, vy: 0, vyaw: 0.1 }
    expect(setpointChanged(held, { vx: 0.5, vy: 0, vyaw: 0.1 + DRIVE_EPSILON / 2 })).toBe(false)
  })

  it('sends a real speed change', () => {
    const held = { vx: 0.3, vy: 0, vyaw: 0 }
    expect(setpointChanged(held, { vx: 0.6, vy: 0, vyaw: 0 })).toBe(true)
  })

  it.each([
    ['vx', { vx: 0.6, vy: 0, vyaw: 0 }],
    ['vy', { vx: 0.3, vy: 0.5, vyaw: 0 }],
    ['vyaw', { vx: 0.3, vy: 0, vyaw: 0.5 }],
  ])('detects a change on %s', (_axis, next) => {
    expect(setpointChanged({ vx: 0.3, vy: 0, vyaw: 0 }, next)).toBe(true)
  })

  it('never swallows a stop, even a sub-epsilon one', () => {
    // The safety-critical case: releasing the keys must always reach the robot,
    // or it keeps driving until the bridge watchdog fires seconds later.
    const crawling = { vx: DRIVE_EPSILON / 2, vy: 0, vyaw: 0 }
    expect(setpointChanged(crawling, DRIVE_STOP)).toBe(true)
  })

  it('treats resuming from a stop as a change', () => {
    expect(setpointChanged(DRIVE_STOP, { vx: DRIVE_EPSILON / 2, vy: 0, vyaw: 0 })).toBe(true)
  })

  it('suppresses a repeated stop', () => {
    expect(setpointChanged(DRIVE_STOP, { ...DRIVE_STOP })).toBe(false)
  })
})

describe('keepaliveDue', () => {
  it('is not due immediately after sending', () => {
    expect(keepaliveDue(1000, 1000)).toBe(false)
    expect(keepaliveDue(1000, 1000 + DRIVE_KEEPALIVE_MS - 1)).toBe(false)
  })

  it('is due once the interval has elapsed', () => {
    expect(keepaliveDue(1000, 1000 + DRIVE_KEEPALIVE_MS)).toBe(true)
  })
})

describe('drive timing constants', () => {
  it('polls input far faster than it sends', () => {
    // Responsiveness is free now that polling does not imply sending.
    expect(DRIVE_INPUT_POLL_MS).toBeLessThan(DRIVE_KEEPALIVE_MS / 4)
  })

  it('keeps the keepalive well inside the bridge watchdog timeout', () => {
    // The bridge brakes after DRIVE_WATCHDOG_TIMEOUT_S = 2s of silence. At least
    // two keepalives must fit inside that, so one dropped MQTT message cannot
    // visibly interrupt driving.
    const watchdogMs = 2000
    expect(DRIVE_KEEPALIVE_MS * 2).toBeLessThanOrEqual(watchdogMs)
  })
})
