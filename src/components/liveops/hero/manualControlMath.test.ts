import { describe, expect, it } from 'vitest'
import {
  applyMouseYaw,
  clamp,
  compensateForSpeedRatio,
  DRIVE_SPEED_RATIO,
  hasMouseYawIntent,
  KEY_TO_DIRECTION,
  MIN_KEY_HOLD_MS,
  MOUSE_YAW_DEADZONE_PX,
  MOUSE_YAW_SENSITIVITY,
  quantizeYaw,
  STEER_MIN_INTERVAL_MS,
  steeringChangeHeld,
  steeringOnlyChange,
  tapReleaseDelayMs,
  velocityFor,
  type Direction,
} from './manualControlMath'

describe('KEY_TO_DIRECTION mapping', () => {
  it('maps W/S to forward/back', () => {
    expect(KEY_TO_DIRECTION.w).toBe('forward')
    expect(KEY_TO_DIRECTION.s).toBe('back')
  })

  it('maps A/D to strafe left/right', () => {
    expect(KEY_TO_DIRECTION.a).toBe('strafeLeft')
    expect(KEY_TO_DIRECTION.d).toBe('strafeRight')
  })

  // Arrows used to drive the robot, and the handler called preventDefault on
  // them. Arrows are *the* keyboard navigation mechanism — scrolling, select
  // traversal, Radix menus, screen-reader browse mode — so a keyboard or
  // screen-reader user navigating LiveOps was issuing real velocity commands
  // to a physical quadruped. docs/audit/2026-08-12-ui-ux-audit.md A-11.
  it('does not bind arrow keys to movement', () => {
    expect(KEY_TO_DIRECTION.ArrowUp).toBeUndefined()
    expect(KEY_TO_DIRECTION.ArrowDown).toBeUndefined()
    expect(KEY_TO_DIRECTION.ArrowLeft).toBeUndefined()
    expect(KEY_TO_DIRECTION.ArrowRight).toBeUndefined()
  })

  it('maps Q/E to turn left/right', () => {
    expect(KEY_TO_DIRECTION.q).toBe('turnLeft')
    expect(KEY_TO_DIRECTION.e).toBe('turnRight')
  })
})

describe('velocityFor', () => {
  const vMax = 0.6
  const yawMax = 0.6

  it('returns zero velocity when nothing is held', () => {
    expect(velocityFor(new Set(), vMax, yawMax)).toEqual({ vx: 0, vy: 0, vyaw: 0 })
  })

  it('drives forward/back from the forward/back directions', () => {
    expect(velocityFor(new Set(['forward']), vMax, yawMax).vx).toBe(vMax)
    expect(velocityFor(new Set(['back']), vMax, yawMax).vx).toBe(-vMax)
  })

  it('strafes from strafeLeft/strafeRight (A/D)', () => {
    expect(velocityFor(new Set(['strafeLeft']), vMax, yawMax).vy).toBe(vMax)
    expect(velocityFor(new Set(['strafeRight']), vMax, yawMax).vy).toBe(-vMax)
  })

  it('turns from turnLeft/turnRight (Q/E)', () => {
    expect(velocityFor(new Set(['turnLeft']), vMax, yawMax).vyaw).toBe(yawMax)
    expect(velocityFor(new Set(['turnRight']), vMax, yawMax).vyaw).toBe(-yawMax)
  })

  it('combines opposite directions to zero (e.g. both strafe keys held)', () => {
    const held = new Set<Direction>(['strafeLeft', 'strafeRight'])
    expect(velocityFor(held, vMax, yawMax).vy).toBe(0)
  })

  it('combines forward + strafe + turn independently', () => {
    const held = new Set<Direction>(['forward', 'strafeRight', 'turnLeft'])
    expect(velocityFor(held, vMax, yawMax)).toEqual({ vx: vMax, vy: -vMax, vyaw: yawMax })
  })
})

describe('clamp', () => {
  it('passes values through when inside range', () => {
    expect(clamp(0.3, -1, 1)).toBe(0.3)
  })
  it('clamps to the upper bound', () => {
    expect(clamp(5, -1, 1)).toBe(1)
  })
  it('clamps to the lower bound', () => {
    expect(clamp(-5, -1, 1)).toBe(-1)
  })
})

describe('applyMouseYaw', () => {
  const yawMax = 0.6

  it('returns the keyboard vyaw unchanged when there is no mouse movement', () => {
    expect(applyMouseYaw(0.3, 0, yawMax)).toBe(0.3)
  })

  it('adds a rightward mouse contribution as negative yaw (turning right)', () => {
    const result = applyMouseYaw(0, 100, yawMax)
    expect(result).toBeCloseTo(-100 * MOUSE_YAW_SENSITIVITY)
  })

  it('adds a leftward mouse contribution as positive yaw (turning left)', () => {
    const result = applyMouseYaw(0, -100, yawMax)
    expect(result).toBeCloseTo(100 * MOUSE_YAW_SENSITIVITY)
  })

  it('stacks on top of an existing keyboard-driven vyaw', () => {
    const result = applyMouseYaw(0.2, 50, yawMax)
    expect(result).toBeCloseTo(0.2 - 50 * MOUSE_YAW_SENSITIVITY)
  })

  it('clamps the combined result to yawMax even with large mouse movement', () => {
    expect(applyMouseYaw(yawMax, -100000, yawMax)).toBe(yawMax)
    expect(applyMouseYaw(-yawMax, 100000, yawMax)).toBe(-yawMax)
  })
})

describe('hasMouseYawIntent', () => {
  it('is false for zero movement', () => {
    expect(hasMouseYawIntent(0)).toBe(false)
  })

  it('is false for movement at or below the dead-zone threshold (either direction)', () => {
    expect(hasMouseYawIntent(MOUSE_YAW_DEADZONE_PX)).toBe(false)
    expect(hasMouseYawIntent(-MOUSE_YAW_DEADZONE_PX)).toBe(false)
    expect(hasMouseYawIntent(1)).toBe(false)
    expect(hasMouseYawIntent(-1)).toBe(false)
  })

  it('is true once movement clears the dead-zone (either direction)', () => {
    expect(hasMouseYawIntent(MOUSE_YAW_DEADZONE_PX + 1)).toBe(true)
    expect(hasMouseYawIntent(-(MOUSE_YAW_DEADZONE_PX + 1))).toBe(true)
  })

  it('accepts a custom dead-zone threshold', () => {
    expect(hasMouseYawIntent(5, 10)).toBe(false)
    expect(hasMouseYawIntent(15, 10)).toBe(true)
  })
})

describe('mouse steering on a segment-based drive', () => {
  // Measured 2026-10-30: mouse steering re-sent a slightly different turn rate
  // on most polls, and on gRPC each change restarts the robot's velocity
  // sequence -- a settle every time, so mouse turning felt worse than Q/E.
  it('rounds the turn rate to coarse steps, so small wobbles are no change', () => {
    expect(quantizeYaw(0.43)).toBeCloseTo(0.4)
    expect(quantizeYaw(-0.26)).toBeCloseTo(-0.3)
    expect(Object.is(quantizeYaw(-0.01), 0)).toBe(true)
  })

  it('treats a change of turn rate alone as a steering-only change', () => {
    expect(steeringOnlyChange({ vx: 0.6, vy: 0, vyaw: 0.2 }, { vx: 0.6, vy: 0, vyaw: 0.4 })).toBe(true)
  })

  it('never holds back a stop, a first send, or a change of walking speed', () => {
    expect(steeringOnlyChange({ vx: 0.6, vy: 0, vyaw: 0.2 }, { vx: 0, vy: 0, vyaw: 0 })).toBe(false)
    expect(steeringOnlyChange(null, { vx: 0, vy: 0, vyaw: 0.4 })).toBe(false)
    expect(steeringOnlyChange({ vx: 0.6, vy: 0, vyaw: 0.2 }, { vx: 0, vy: 0, vyaw: 0.4 })).toBe(false)
  })

  it('holds back a steering-only change until the steering interval has passed', () => {
    expect(steeringChangeHeld(0, STEER_MIN_INTERVAL_MS - 1)).toBe(true)
    expect(steeringChangeHeld(0, STEER_MIN_INTERVAL_MS)).toBe(false)
  })
})

describe('the robot speed setting is not applied twice', () => {
  // Measured 2026-11-05 on rover-jetson: the robot multiplies every velocity by
  // its own speed setting, so Normal (0.6 asked, robot at 60%) walked at 0.37
  // m/s and turned at 0.16-0.30 rad/s.
  it('drives at the robot speed setting the bridge allows', () => {
    expect(DRIVE_SPEED_RATIO).toBe(80)
  })

  it('divides by the live speed setting, so the robot does what was asked', () => {
    expect(compensateForSpeedRatio(0.6, 80)).toBeCloseTo(0.75)
    expect(compensateForSpeedRatio(0.6, 60)).toBeCloseTo(1.0)
    expect(compensateForSpeedRatio(-0.6, 100)).toBeCloseTo(-0.6)
  })

  it('never scales a stop into anything but zero', () => {
    expect(Object.is(compensateForSpeedRatio(0, 60), 0)).toBe(true)
  })

  it('leaves velocities alone when the speed setting is unknown or out of range', () => {
    expect(compensateForSpeedRatio(0.6, undefined)).toBe(0.6)
    expect(compensateForSpeedRatio(0.6, Number.NaN)).toBe(0.6)
    expect(compensateForSpeedRatio(0.6, 0)).toBe(0.6)
  })

  it('never more than triples a velocity, whatever the speed setting reads', () => {
    expect(compensateForSpeedRatio(0.6, 10)).toBeCloseTo(1.8)
  })
})

describe('a quick tap still makes a clean move', () => {
  // Measured 2026-11-05: the robot starts moving 0.25-0.67 s after a key goes
  // down, and taps of ~0.07 s ended before it did -- a stop/start jerk and no move.
  it('holds a short tap until the minimum hold has passed', () => {
    expect(MIN_KEY_HOLD_MS).toBe(500)
    expect(tapReleaseDelayMs(1000, 1070)).toBe(430)
  })

  it('releases a key held longer than that at once', () => {
    expect(tapReleaseDelayMs(1000, 1500)).toBe(0)
    expect(tapReleaseDelayMs(1000, 4000)).toBe(0)
  })
})
