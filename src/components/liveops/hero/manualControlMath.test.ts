import { describe, expect, it } from 'vitest'
import {
  applyMouseYaw,
  clamp,
  driveTickFor,
  FULL_STICK,
  FULL_STICK_FORWARD_MPS,
  FULL_STICK_STRAFE_MPS,
  FULL_STICK_TURN_RADPS,
  hasMouseYawIntent,
  isPointerReleaseEvent,
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
  const limits = { forward: 0.6, strafe: 0.3, turn: 0.9 }

  it('returns zero velocity when nothing is held', () => {
    expect(velocityFor(new Set(), limits)).toEqual({ vx: 0, vy: 0, vyaw: 0 })
  })

  it('drives forward/back from the forward/back directions', () => {
    expect(velocityFor(new Set(['forward']), limits).vx).toBe(0.6)
    expect(velocityFor(new Set(['back']), limits).vx).toBe(-0.6)
  })

  it('strafes from strafeLeft/strafeRight (A/D), at the strafe limit', () => {
    expect(velocityFor(new Set(['strafeLeft']), limits).vy).toBe(0.3)
    expect(velocityFor(new Set(['strafeRight']), limits).vy).toBe(-0.3)
  })

  it('turns from turnLeft/turnRight (Q/E)', () => {
    expect(velocityFor(new Set(['turnLeft']), limits).vyaw).toBe(0.9)
    expect(velocityFor(new Set(['turnRight']), limits).vyaw).toBe(-0.9)
  })

  it('combines opposite directions to zero (e.g. both strafe keys held)', () => {
    const held = new Set<Direction>(['strafeLeft', 'strafeRight'])
    expect(velocityFor(held, limits).vy).toBe(0)
  })

  it('combines forward + strafe + turn independently', () => {
    const held = new Set<Direction>(['forward', 'strafeRight', 'turnLeft'])
    expect(velocityFor(held, limits)).toEqual({ vx: 0.6, vy: -0.3, vyaw: 0.9 })
  })
})

/** Speed works like the handheld remote (owner, 2026-11-11): a held key is
 * full stick and the robot caps it at its own speed %. */
describe('a held key is full stick', () => {
  // The top of the /joy curves measured on rover-jetson 2026-10-30
  // (robot_bridge/joy_mapping.py).
  it('matches the top of the remote\'s curves', () => {
    expect(FULL_STICK_FORWARD_MPS).toBe(0.64)
    expect(FULL_STICK_STRAFE_MPS).toBe(0.32)
    expect(FULL_STICK_TURN_RADPS).toBe(1.04)
  })

  it('drives at full stick by default, with nothing scaled for the speed %', () => {
    const held = new Set<Direction>(['forward', 'strafeLeft', 'turnRight'])
    expect(velocityFor(held)).toEqual({ vx: 0.64, vy: 0.32, vyaw: -1.04 })
    expect(velocityFor(new Set(['back']), FULL_STICK).vx).toBe(-0.64)
  })

  it('caps mouse steering at the full turn rate', () => {
    expect(applyMouseYaw(0, -100000, FULL_STICK_TURN_RADPS)).toBe(1.04)
    expect(applyMouseYaw(0, 100000, FULL_STICK_TURN_RADPS)).toBe(-1.04)
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

describe('driveTickFor: one poll of the keyboard/mouse surface', () => {
  const idle = new Set<Direction>()

  it('an idle operator produces an inactive tick at the chosen speed %', () => {
    const tick = driveTickFor(idle, 0, false, 30)
    expect(tick.active).toBe(false)
    expect(tick.setpoint).toEqual({ vx: 0, vy: 0, vyaw: 0 })
    expect(tick.ratio).toBe(30)
  })

  // The void Task 1's correction, pinned: the console has ONE speed model --
  // the robot's own speed %, which rides along as the DRIVE's ratio. A held key
  // always asks for full stick and the robot caps it, exactly as the handheld
  // remote works. A tick that scaled velocities by the % would be a second,
  // invisible speed model on top of the robot's.
  it('held keys are full stick at any speed %, which rides along as the ratio', () => {
    const held = new Set<Direction>(['forward', 'strafeLeft'])
    for (const pct of [30, 60, 80]) {
      const tick = driveTickFor(held, 0, false, pct)
      expect(tick.active).toBe(true)
      expect(tick.ratio).toBe(pct)
      expect(tick.setpoint.vx).toBeCloseTo(FULL_STICK_FORWARD_MPS)
      expect(tick.setpoint.vy).toBeCloseTo(FULL_STICK_STRAFE_MPS)
      expect(tick.setpoint.vyaw).toBe(0)
    }
  })

  // The §7.4 correction, pinned. Quantising keyboard yaw would silently change
  // how a real robot turns under Q/E: 1.04 rad/s would become 1.0.
  it('mouse yaw quantises; keyboard yaw does not', () => {
    const turning = new Set<Direction>(['turnLeft'])
    expect(driveTickFor(turning, 0, false, 60).setpoint.vyaw).toBe(FULL_STICK_TURN_RADPS)

    // Mouse right yaws right (negative vyaw), rounded to MOUSE_YAW_STEP.
    const mouse = driveTickFor(idle, 60, false, 60)
    expect(mouse.active).toBe(true)
    expect(mouse.setpoint.vyaw).toBeCloseTo(-0.1)
    expect(driveTickFor(turning, 60, false, 60).setpoint.vyaw).toBeCloseTo(0.9)
  })

  it('a stray pixel of mouse movement is neither steering nor activity', () => {
    const tick = driveTickFor(idle, MOUSE_YAW_DEADZONE_PX, false, 60)
    expect(tick.active).toBe(false)
    expect(tick.holdSteering).toBe(false)
  })

  // Look-around stands the robot still and the look loop owns the deadman
  // while it lasts, so the drive side of the tick is inactive -- which is what
  // keeps an idle loop quiet instead of keepaliving zeros through the look.
  it('looking around drives nothing, whatever is held', () => {
    const tick = driveTickFor(new Set<Direction>(['forward', 'turnLeft']), 0, true, 60)
    expect(tick.setpoint).toEqual({ vx: 0, vy: 0, vyaw: 0 })
    expect(tick.active).toBe(false)
  })

  // holdSteering only ARMS the throttle; the loop decides whether this tick is
  // a steering-only change and whether one went out too recently.
  it('arms the steering throttle only while the mouse is steering', () => {
    expect(driveTickFor(new Set<Direction>(['turnLeft']), 0, false, 60).holdSteering).toBe(false)
    expect(driveTickFor(idle, 60, false, 60).holdSteering).toBe(true)
  })
})

// A finger sliding off a drive key never fires `mouseleave`, so the pad used to
// leave the robot driving until the bridge's 2 s watchdog. Every way a pointer
// can end must release the key.
describe('isPointerReleaseEvent', () => {
  it('every pointer end-path releases the key', () => {
    for (const e of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      expect(isPointerReleaseEvent(e)).toBe(true)
    }
    expect(isPointerReleaseEvent('pointermove')).toBe(false)
    expect(isPointerReleaseEvent('pointerdown')).toBe(false)
  })
})
