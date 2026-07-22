import { describe, expect, it } from 'vitest'
import {
  applyMouseYaw,
  clamp,
  KEY_TO_DIRECTION,
  MOUSE_YAW_SENSITIVITY,
  velocityFor,
  type Direction,
} from './manualControlMath'

describe('KEY_TO_DIRECTION mapping', () => {
  it('maps W/S (and arrows) to forward/back, unchanged', () => {
    expect(KEY_TO_DIRECTION.w).toBe('forward')
    expect(KEY_TO_DIRECTION.ArrowUp).toBe('forward')
    expect(KEY_TO_DIRECTION.s).toBe('back')
    expect(KEY_TO_DIRECTION.ArrowDown).toBe('back')
  })

  it('maps A/D (and arrows) to strafe left/right', () => {
    expect(KEY_TO_DIRECTION.a).toBe('strafeLeft')
    expect(KEY_TO_DIRECTION.ArrowLeft).toBe('strafeLeft')
    expect(KEY_TO_DIRECTION.d).toBe('strafeRight')
    expect(KEY_TO_DIRECTION.ArrowRight).toBe('strafeRight')
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
