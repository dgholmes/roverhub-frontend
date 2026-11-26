import { describe, expect, it } from 'vitest'
import { DRIVE_INPUT_POLL_MS, DRIVE_STOP, AUTO_RELEASE_SECONDS as TELEOP_AUTO_RELEASE_SECONDS } from '@/lib/teleop'
import {
  FULL_STICK, FULL_STICK_FORWARD_MPS, FULL_STICK_STRAFE_MPS, FULL_STICK_TURN_RADPS,
  velocityFor,
} from '@/components/liveops/hero/manualControlMath'
import { applyLookDelta, LOOK_LIMIT_DEG, LOOK_NEUTRAL } from '@/components/liveops/hero/lookAround'
import type { StickVector } from './joystickMath'
import {
  AUTO_RELEASE_SECONDS, LOOK_SWEEP_MS, touchDriveTick, touchLookDelta,
} from './touchDriveIntent'

/**
 * What the touch shell's sticks ask the shared drive loop for, as a pure
 * function — the counterpart of `hero/manualControlMath.ts`'s `driveTickFor`,
 * which is the worked example of what an adapter owes the loop.
 *
 * Two properties are what these tests really exist for:
 *
 * 1. **The deadman's breadth.** `active` is the ONLY signal the 60 s
 *    auto-release reads (`useDriveLoop`), and it is deliberately not derived
 *    from the setpoint: a thumb resting on a centred stick, or adjusting the
 *    speed, is an operator who is still there. A deadman stricter on touch
 *    than on a keyboard would drop control under an operator's hand, which is
 *    the design's anti-goal #1.
 * 2. **The signs**, asserted against `velocityFor`'s own output for the
 *    equivalent held key rather than restated. A restated sign can drift from
 *    the keyboard mapping with no test noticing, and a sign error here drives
 *    a real robot the wrong way under an operator's thumb.
 *
 * Pure and `environment: 'node'`, like `joystickMath.test.ts`.
 */

const ZERO: StickVector = { x: 0, y: 0 }
/** Screen y points down, so a stick pushed UP the screen is `y: -1`. */
const UP: StickVector = { x: 0, y: -1 }
const LEFT: StickVector = { x: -1, y: 0 }
const RIGHT: StickVector = { x: 1, y: 0 }
const DOWN: StickVector = { x: 0, y: 1 }

describe('the deadman is as broad as the desktop keyboard’s', () => {
  it('a finger down on a centred stick still reads active', () => {
    const tick = touchDriveTick(ZERO, ZERO, 60, false, true)
    expect(tick.active).toBe(true)
    // ...and asks for nothing, so the loop stops the robot rather than
    // creeping it at whatever the dead zone let through.
    expect(tick.setpoint).toEqual(DRIVE_STOP)
  })

  it('a drive-strip change reads active, so adjusting speed feeds the deadman', () => {
    expect(touchDriveTick(ZERO, ZERO, 80, false, false, true).active).toBe(true)
  })

  it('no finger and no control touched is inactive', () => {
    expect(touchDriveTick(ZERO, ZERO, 60, false, false).active).toBe(false)
    expect(touchDriveTick(ZERO, ZERO, 60, false, false).setpoint).toEqual(DRIVE_STOP)
  })

  it('a deflected stick with no finger down asks for nothing', () => {
    // The stick cannot report a deflection it is not holding, but if it ever
    // did, `sticksDown` is the authority: a drive surface nobody is touching
    // must not be driving.
    expect(touchDriveTick(UP, ZERO, 60, false, false).setpoint).toEqual(DRIVE_STOP)
  })
})

describe('the sticks ask for full stick, and the tick carries the speed %', () => {
  it('pushing the left stick up matches a held W', () => {
    const tick = touchDriveTick(UP, ZERO, 60, false, true)
    expect(tick.setpoint).toEqual({ ...velocityFor(new Set(['forward'])), vyaw: 0 })
    expect(tick.setpoint.vx).toBe(FULL_STICK_FORWARD_MPS)
  })

  // ⚠️ Left turns, right steps sideways -- the robot's own remote, measured off
  // `/joy` (joystickMath.ts). They were the other way round until 2026-11-26,
  // which meant the same thumb did different things on the remote and on the
  // tablet, for one robot in one room.
  it('pushing the left stick left matches a held Q', () => {
    const tick = touchDriveTick(LEFT, ZERO, 60, false, true)
    expect(tick.setpoint).toEqual(velocityFor(new Set(['turnLeft'])))
    expect(tick.setpoint.vyaw).toBe(FULL_STICK_TURN_RADPS)
  })

  it('pushing the right stick left matches a held A', () => {
    const tick = touchDriveTick(ZERO, LEFT, 60, false, true)
    expect(tick.setpoint).toEqual({ ...velocityFor(new Set(['strafeLeft'])), vyaw: 0 })
    expect(tick.setpoint.vy).toBe(FULL_STICK_STRAFE_MPS)
  })

  it('the right stick steps sideways and nothing else, whatever its vertical does', () => {
    const stepping = touchDriveTick(ZERO, { x: 1, y: -1 }, 60, false, true)
    expect(stepping.setpoint.vx).toBe(0)
    expect(stepping.setpoint.vyaw).toBe(0)
    expect(stepping.setpoint.vy).toBe(-FULL_STICK_STRAFE_MPS)
    // Pure vertical on the sidestep stick is no input at all.
    expect(touchDriveTick(ZERO, DOWN, 60, false, true).setpoint).toEqual(DRIVE_STOP)
  })

  it('both sticks combine into one setpoint, each keeping its own axes', () => {
    // Walking forward while stepping right: the left stick's forward and the
    // right stick's sideways, in one setpoint, neither overwriting the other.
    const tick = touchDriveTick(UP, RIGHT, 60, false, true)
    expect(tick.setpoint).toEqual(velocityFor(new Set(['forward', 'strafeRight'])))
    // And a turn from the left stick rides along with a sidestep from the right.
    const both = touchDriveTick({ x: 1, y: -1 }, LEFT, 60, false, true)
    expect(both.setpoint.vx).toBeGreaterThan(0)
    expect(both.setpoint.vyaw).toBeLessThan(0)
    expect(both.setpoint.vy).toBe(FULL_STICK_STRAFE_MPS)
  })

  it('the velocities never scale with the speed %, which rides along as the ratio', () => {
    // The ROBOT caps motion at its own %, exactly as the handheld remote
    // works. A console that scaled here would halve the robot's speed twice.
    const slow = touchDriveTick(UP, ZERO, 30, false, true)
    const fast = touchDriveTick(UP, ZERO, 80, false, true)
    expect(slow.setpoint).toEqual(fast.setpoint)
    expect(slow.ratio).toBe(30)
    expect(fast.ratio).toBe(80)
  })

  it('a half-throw is half of full stick on each axis', () => {
    const tick = touchDriveTick({ x: 0, y: -0.5 }, ZERO, 60, false, true)
    expect(tick.setpoint.vx).toBeCloseTo(FULL_STICK.forward / 2, 10)
  })
})

describe('look mode', () => {
  it('zeroes vyaw and drives nothing', () => {
    // Balance pitch and yaw exist only in balance_stand (lookAround.ts), so
    // looking is something a STANDING robot does: the whole setpoint goes to
    // zero, not the turn alone.
    const tick = touchDriveTick(UP, LEFT, 60, true, true)
    expect(tick.setpoint.vyaw).toBe(0)
    expect(tick.setpoint).toEqual(DRIVE_STOP)
  })

  it('still reads active, because a thumb on the look stick is an operator', () => {
    expect(touchDriveTick(ZERO, LEFT, 60, true, true).active).toBe(true)
  })

  it('a full throw sweeps the whole look range in LOOK_SWEEP_MS', () => {
    const perTick = touchLookDelta(RIGHT, DRIVE_INPUT_POLL_MS)
    let target = LOOK_NEUTRAL
    for (let ms = 0; ms < LOOK_SWEEP_MS; ms += DRIVE_INPUT_POLL_MS) {
      target = applyLookDelta(target, perTick.dxPx, perTick.dyPx)
    }
    // Swept from one end of the range to the other, so from neutral it lands
    // hard against the limit.
    expect(target.yawDeg).toBeCloseTo(LOOK_LIMIT_DEG, 6)
  })

  it('pushing the stick right looks right and down looks down', () => {
    const right = touchLookDelta(RIGHT)
    expect(applyLookDelta(LOOK_NEUTRAL, right.dxPx, right.dyPx).yawDeg).toBeGreaterThan(0)
    const down = touchLookDelta(DOWN)
    // pitch > 0 leans forward, which points the camera DOWN (lookAround.ts).
    expect(applyLookDelta(LOOK_NEUTRAL, down.dxPx, down.dyPx).pitchDeg).toBeGreaterThan(0)
  })

  it('a centred look stick moves the target nowhere', () => {
    expect(touchLookDelta(ZERO)).toEqual({ dxPx: 0, dyPx: 0 })
  })
})

describe('what touch never does', () => {
  it('holdSteering is always false on touch', () => {
    // It arms the desktop mouse's steering throttle and means nothing here:
    // there is no mouse yaw on a tablet, and throttling a thumb would make a
    // stick lag the robot.
    for (const tick of [
      touchDriveTick(ZERO, ZERO, 60, false, false),
      touchDriveTick(UP, LEFT, 60, false, true),
      touchDriveTick(ZERO, RIGHT, 60, true, true),
    ]) {
      expect(tick.holdSteering).toBe(false)
    }
  })
})

describe('the deadman is the desktop overlay’s', () => {
  it('is the one constant both consoles import, not a second 60', () => {
    // It now lives in lib/teleop. This asserts identity rather than equality:
    // two separate 60s that happen to match today would pass an equality test
    // and drift tomorrow, and the touch shell never mounts the overlay, so
    // nothing else would notice.
    expect(AUTO_RELEASE_SECONDS).toBe(TELEOP_AUTO_RELEASE_SECONDS)
    expect(AUTO_RELEASE_SECONDS).toBe(60)
  })
})
