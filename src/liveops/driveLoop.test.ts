import { beforeEach, describe, expect, test, vi } from 'vitest'
import { DRIVE_KEEPALIVE_MS, DRIVE_SPEED_RATIO, type DriveSetpoint } from '@/lib/teleop'
import { STEER_MIN_INTERVAL_MS } from '@/components/liveops/hero/manualControlMath'
import { createDriveLoop, type DriveTick } from './driveLoop'

/**
 * The core is a pure function over time, so every test here drives its own
 * clock and reads the `send` spy. No React, no DOM, no timers -- which is the
 * whole point of lifting it out of `ManualControlOverlay`.
 */

const WALK: DriveSetpoint = { vx: 0.5, vy: 0, vyaw: 0 }

let clock = 0
let send: ReturnType<typeof vi.fn>

beforeEach(() => {
  clock = 1_000_000 // a realistic Date.now(), so `lastSentAt = 0` is long ago
  send = vi.fn(() => true)
})

function loop() {
  return createDriveLoop({ send, now: () => clock })
}

function driving(setpoint: DriveSetpoint = WALK, over: Partial<DriveTick> = {}): DriveTick {
  return { setpoint, ratio: DRIVE_SPEED_RATIO, active: true, ...over }
}

const IDLE: DriveTick = { setpoint: WALK, ratio: DRIVE_SPEED_RATIO, active: false }

/** Ticks every DRIVE_INPUT_POLL_MS across `ms`, as the hook's interval does. */
function tickFor(core: { tick: (t: DriveTick) => void }, t: DriveTick, ms: number, stepMs = 50) {
  for (let elapsed = 0; elapsed < ms; elapsed += stepMs) {
    clock += stepMs
    core.tick(t)
  }
}

describe('createDriveLoop', () => {
  test('sends once on change, then not again until the keepalive falls due', () => {
    const core = loop()
    core.tick(driving())
    expect(send).toHaveBeenCalledTimes(1)

    // Just short of the keepalive: the setpoint has not changed, so nothing
    // goes out. Re-issuing on a tick is what the one-long-sequence design
    // exists to remove (lib/teleop.ts).
    tickFor(core, driving(), DRIVE_KEEPALIVE_MS - 50)
    expect(send).toHaveBeenCalledTimes(1)

    clock += 50
    core.tick(driving())
    expect(send).toHaveBeenCalledTimes(2)
  })

  test('keepalive re-sends the unchanged setpoint at 1000ms', () => {
    const core = loop()
    core.tick(driving())
    tickFor(core, driving(), DRIVE_KEEPALIVE_MS)

    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenNthCalledWith(2, WALK.vx, WALK.vy, WALK.vyaw, DRIVE_SPEED_RATIO)
  })

  test('an idle loop sends no keepalive', () => {
    const core = loop()

    // The first inactive tick still sends one explicit stop -- a mounted loop
    // asserts a stopped robot once. After that it goes quiet: the bridge's
    // watchdog only guards a drive that is actually held.
    tickFor(core, IDLE, 3 * DRIVE_KEEPALIVE_MS)

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith(0, 0, 0, DRIVE_SPEED_RATIO)
  })

  test('a stop is never swallowed by the epsilon', () => {
    const core = loop()
    // Below DRIVE_EPSILON (0.02), so a naive difference would read as no change
    // -- and releasing the keys would leave the robot driving to the watchdog.
    const creep: DriveSetpoint = { vx: 0.01, vy: 0, vyaw: 0 }
    core.tick(driving(creep))
    expect(send).toHaveBeenCalledTimes(1)

    clock += 50
    core.tick({ ...driving(creep), active: false })

    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenNthCalledWith(2, 0, 0, 0, DRIVE_SPEED_RATIO)
  })

  test('passes every component through unscaled and passes the ratio through', () => {
    const core = loop()
    // The setpoint arrives ALREADY capped by the caller's tier, and the yaw
    // already quantised if that input class quantises it. The core must not
    // rescale it -- see the design's section 7.4 correction.
    const odd: DriveSetpoint = { vx: 0.37, vy: -0.11, vyaw: 0.42 }
    core.tick(driving(odd, { ratio: 30 }))

    expect(send).toHaveBeenCalledWith(0.37, -0.11, 0.42, 30)
  })

  test('a refused send does not advance lastSent, so the next tick retries', () => {
    const core = loop()
    send.mockReturnValue(false) // the bridge refused: battery floor, not owner

    core.tick(driving())
    expect(send).toHaveBeenCalledTimes(1)

    // One poll later, not one keepalive later. A refusal recorded as sent would
    // leave the robot waiting a second for a retry that could be refused again.
    clock += 50
    core.tick(driving())
    expect(send).toHaveBeenCalledTimes(2)

    send.mockReturnValue(true)
    clock += 50
    core.tick(driving())
    expect(send).toHaveBeenCalledTimes(3)

    // Accepted this time, so now it settles into the keepalive cadence.
    tickFor(core, driving(), DRIVE_KEEPALIVE_MS - 50)
    expect(send).toHaveBeenCalledTimes(3)
  })

  test('stop() sends zero velocity and clears change state', () => {
    const core = loop()
    core.tick(driving(WALK, { ratio: 30 }))
    expect(send).toHaveBeenCalledTimes(1)

    core.stop()
    // Stops carry the speed % too: the bridge sets the robot's speed from each
    // DRIVE, this one included.
    expect(send).toHaveBeenNthCalledWith(2, 0, 0, 0, 30)

    // Change state cleared: the same setpoint is a change again, so it goes out
    // on the very next tick rather than being suppressed as unchanged.
    clock += 50
    core.tick(driving(WALK, { ratio: 30 }))
    expect(send).toHaveBeenCalledTimes(3)
    expect(send).toHaveBeenNthCalledWith(3, WALK.vx, WALK.vy, WALK.vyaw, 30)
  })

  test('stop() before any tick still sends zero velocity', () => {
    const core = loop()
    core.stop()
    expect(send).toHaveBeenCalledWith(0, 0, 0, DRIVE_SPEED_RATIO)
  })

  test('a changed ratio while driving goes out at once, not at the next keepalive', () => {
    const core = loop()
    core.tick(driving(WALK, { ratio: 60 }))
    expect(send).toHaveBeenCalledTimes(1)

    // Held keys send the same velocities at any speed %, so the new % is a
    // changed setpoint of its own.
    clock += 50
    core.tick(driving(WALK, { ratio: 30 }))
    expect(send).toHaveBeenCalledTimes(2)
    expect(send).toHaveBeenNthCalledWith(2, WALK.vx, WALK.vy, WALK.vyaw, 30)
  })

  test('holdSteering holds a steering-only change, but never a stop', () => {
    const core = loop()
    core.tick(driving())
    expect(send).toHaveBeenCalledTimes(1)

    // Mouse wobble: same walking speed, a slightly different turn rate. Every
    // change restarts the robot's velocity sequence, so these are throttled.
    const steered = { ...WALK, vyaw: 0.3 }
    clock += STEER_MIN_INTERVAL_MS - 50
    core.tick(driving(steered, { holdSteering: true }))
    expect(send).toHaveBeenCalledTimes(1)

    // Past STEER_MIN_INTERVAL_MS it goes out.
    clock += 50
    core.tick(driving(steered, { holdSteering: true }))
    expect(send).toHaveBeenCalledTimes(2)

    // A stop is never held back, whatever the steering throttle says.
    clock += 50
    core.tick({ ...driving(steered, { holdSteering: true }), active: false })
    expect(send).toHaveBeenCalledTimes(3)
    expect(send).toHaveBeenNthCalledWith(3, 0, 0, 0, DRIVE_SPEED_RATIO)
  })

  test('without holdSteering the same steering change goes out immediately', () => {
    const core = loop()
    core.tick(driving())
    clock += 50
    core.tick(driving({ ...WALK, vyaw: 0.3 }))

    expect(send).toHaveBeenCalledTimes(2)
  })
})

describe('createDriveLoop: standing down for another driver', () => {
  test('sends nothing while standing down, not even the stop that ends a drive', () => {
    const core = loop()
    core.tick(driving())
    expect(send).toHaveBeenCalledTimes(1)
    tickFor(core, driving(WALK, { standDown: true }), DRIVE_KEEPALIVE_MS * 3)
    expect(send).toHaveBeenCalledTimes(1)
  })

  test('resumes from stopped: idle afterwards sends nothing, input sends at once', () => {
    const core = loop()
    core.tick(driving())
    core.tick(driving(WALK, { standDown: true }))
    tickFor(core, IDLE, DRIVE_KEEPALIVE_MS * 2)
    expect(send).toHaveBeenCalledTimes(1)
    core.tick(driving())
    expect(send).toHaveBeenCalledTimes(2)
  })
})
