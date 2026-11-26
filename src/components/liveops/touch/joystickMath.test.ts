import { describe, expect, it } from 'vitest'
import { leftStickAxes, rightStickAxes, stickVector, STICK_DEAD_ZONE } from './joystickMath'
import { FULL_STICK, velocityFor } from '../hero/manualControlMath'
import type { Direction, DriveLimits } from '../hero/manualControlMath'

/**
 * The signs are deliberately NOT restated here. Screen y points down while
 * forward is `+vx`, strafe-left is `+vy` and turn-left is `+vyaw`, and a test
 * that spells those out would keep passing while this module drifted away from
 * the keyboard mapping a real robot already obeys. So every sign assertion
 * below compares against `velocityFor`'s own output for the equivalent held
 * key.
 *
 * Which stick owns which axis is the robot's handheld remote, measured off
 * `/joy`: left walks and turns, right steps sideways. The two were the other
 * way round until 2026-11-26, so each stick is asserted to do its own job AND
 * to leave the other's alone -- swapping them back would otherwise still pass
 * half of these.
 */
/**
 * A full stick throw IS a held key, so the sticks scale to the same limits the
 * keyboard sends (`FULL_STICK`) and the robot caps motion at the speed % the
 * DRIVE carries -- `store/useDriveSpeedStore.ts`, exactly as the handheld
 * remote works. There is no per-tier m/s cap in this console, and these limits
 * are deliberately asymmetric: strafe is half of forward.
 */
const limits: DriveLimits = FULL_STICK

const ORIGIN = { x: 100, y: 100 }
const RADIUS = 60

/** A pointer `dx`,`dy` px from the stick's centre, in screen pixels (y down). */
const at = (dx: number, dy: number) => ({ x: ORIGIN.x + dx, y: ORIGIN.y + dy })

describe('stickVector', () => {
  it('inside the dead zone is exactly zero', () => {
    // 0.1 of the radius, under the 0.12 dead zone, on both axes and diagonally.
    expect(stickVector(ORIGIN, at(6, 0), RADIUS)).toEqual({ x: 0, y: 0 })
    expect(stickVector(ORIGIN, at(0, -6), RADIUS)).toEqual({ x: 0, y: 0 })
    expect(stickVector(ORIGIN, at(4, -4), RADIUS)).toEqual({ x: 0, y: 0 })
    // A finger that has not moved at all.
    expect(stickVector(ORIGIN, ORIGIN, RADIUS)).toEqual({ x: 0, y: 0 })
    // Exactly zero, never a signed zero that reads as a direction.
    const v = stickVector(ORIGIN, at(-4, 4), RADIUS)
    expect(Object.is(v.x, 0)).toBe(true)
    expect(Object.is(v.y, 0)).toBe(true)
  })

  it('the dead zone defaults to 0.12 and is overridable', () => {
    expect(STICK_DEAD_ZONE).toBe(0.12)
    // Half a radius out is live by default, and dead under a 0.9 dead zone.
    expect(stickVector(ORIGIN, at(0, -30), RADIUS).y).toBeLessThan(0)
    expect(stickVector(ORIGIN, at(0, -30), RADIUS, 0.9)).toEqual({ x: 0, y: 0 })
  })

  it('a diagonal at full throw is clamped to the unit circle', () => {
    // A corner push: 1.41 radii of travel on the diagonal.
    const v = stickVector(ORIGIN, at(RADIUS, -RADIUS), RADIUS)
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 10)
    // ...so a corner is no faster than a straight push, on either axis.
    expect(Math.abs(v.x)).toBeLessThan(1)
    expect(Math.abs(v.y)).toBeLessThan(1)
    // And a straight push well past the radius is still exactly full.
    const straight = stickVector(ORIGIN, at(0, -RADIUS * 3), RADIUS)
    expect(Math.hypot(straight.x, straight.y)).toBeCloseTo(1, 10)
  })

  it('grows from zero at the dead-zone edge to full at the rim', () => {
    const justOut = stickVector(ORIGIN, at(0, -RADIUS * 0.13), RADIUS)
    expect(Math.hypot(justOut.x, justOut.y)).toBeGreaterThan(0)
    expect(Math.hypot(justOut.x, justOut.y)).toBeLessThan(0.05)
    const rim = stickVector(ORIGIN, at(0, -RADIUS), RADIUS)
    expect(Math.hypot(rim.x, rim.y)).toBeCloseTo(1, 10)
  })
})

describe('leftStickAxes', () => {
  it('pushing the left stick up matches velocityFor({forward})', () => {
    const v = stickVector(ORIGIN, at(0, -RADIUS), RADIUS)
    expect(leftStickAxes(v, limits)).toEqual(velocityFor(new Set<Direction>(['forward']), limits))
  })

  it('pushing the left stick down matches velocityFor({back})', () => {
    const v = stickVector(ORIGIN, at(0, RADIUS), RADIUS)
    expect(leftStickAxes(v, limits)).toEqual(velocityFor(new Set<Direction>(['back']), limits))
  })

  it('pushing the left stick left matches velocityFor({turnLeft})', () => {
    const v = stickVector(ORIGIN, at(-RADIUS, 0), RADIUS)
    expect(leftStickAxes(v, limits)).toEqual(velocityFor(new Set<Direction>(['turnLeft']), limits))
  })

  it('pushing the left stick right matches velocityFor({turnRight})', () => {
    const v = stickVector(ORIGIN, at(RADIUS, 0), RADIUS)
    expect(leftStickAxes(v, limits)).toEqual(velocityFor(new Set<Direction>(['turnRight']), limits))
  })

  it('never steps sideways, however it is pushed', () => {
    for (const [dx, dy] of [
      [RADIUS, -RADIUS],
      [-RADIUS, RADIUS],
      [0, -RADIUS],
      [RADIUS, 0],
    ]) {
      expect(leftStickAxes(stickVector(ORIGIN, at(dx, dy), RADIUS), limits).vy).toBe(0)
    }
  })

  it('walks and turns together on a diagonal, which is one arc', () => {
    // Forward and left at once is a turning walk, not a choice between them.
    const v = stickVector(ORIGIN, at(-RADIUS, -RADIUS), RADIUS)
    const { vx, vyaw } = leftStickAxes(v, limits)
    expect(vx).toBeGreaterThan(0)
    expect(vyaw).toBeGreaterThan(0)
  })

  it('a centred stick is a stop', () => {
    expect(leftStickAxes({ x: 0, y: 0 }, limits)).toEqual({ vx: 0, vy: 0, vyaw: 0 })
  })

  it('caps each axis at its own limit', () => {
    const v = stickVector(ORIGIN, at(RADIUS, -RADIUS), RADIUS)
    const { vx, vyaw } = leftStickAxes(v, limits)
    expect(Math.abs(vx)).toBeLessThanOrEqual(limits.forward + 1e-12)
    expect(Math.abs(vyaw)).toBeLessThanOrEqual(limits.turn + 1e-12)
    // A full throw sideways is the turn limit, never the forward one.
    expect(leftStickAxes(stickVector(ORIGIN, at(-RADIUS * 3, 0), RADIUS), limits).vyaw)
      .toBeCloseTo(limits.turn, 12)
  })
})

describe('rightStickAxes', () => {
  it('pushing the right stick left matches velocityFor({strafeLeft})', () => {
    const v = stickVector(ORIGIN, at(-RADIUS, 0), RADIUS)
    expect(rightStickAxes(v, limits)).toEqual(velocityFor(new Set<Direction>(['strafeLeft']), limits))
  })

  it('pushing the right stick right matches velocityFor({strafeRight})', () => {
    const v = stickVector(ORIGIN, at(RADIUS, 0), RADIUS)
    expect(rightStickAxes(v, limits)).toEqual(velocityFor(new Set<Direction>(['strafeRight']), limits))
  })

  it('the right stick ignores its vertical axis', () => {
    // Straight up and straight down are both nothing at all.
    expect(rightStickAxes(stickVector(ORIGIN, at(0, -RADIUS), RADIUS), limits)).toEqual({
      vx: 0,
      vy: 0,
      vyaw: 0,
    })
    expect(rightStickAxes(stickVector(ORIGIN, at(0, RADIUS), RADIUS), limits)).toEqual({
      vx: 0,
      vy: 0,
      vyaw: 0,
    })
    // And a diagonal steps exactly as its horizontal component alone would.
    const diagonal = stickVector(ORIGIN, at(-RADIUS, -RADIUS), RADIUS)
    expect(rightStickAxes(diagonal, limits)).toEqual(rightStickAxes({ x: diagonal.x, y: 0 }, limits))
  })

  it('never walks and never turns, however it is pushed', () => {
    const v = rightStickAxes(stickVector(ORIGIN, at(-RADIUS, -RADIUS), RADIUS), limits)
    expect(v.vx).toBe(0)
    expect(v.vyaw).toBe(0)
  })

  it('caps at the strafe limit, which is half the forward one', () => {
    const v = rightStickAxes(stickVector(ORIGIN, at(-RADIUS * 3, 0), RADIUS), limits)
    expect(Math.abs(v.vy)).toBeLessThanOrEqual(limits.strafe + 1e-12)
    expect(Math.abs(v.vy)).toBeCloseTo(limits.strafe, 12)
    // Driving sideways at the forward limit would be twice what every other
    // surface asks for; the two differ by half and must stay apart.
    expect(limits.strafe).toBeLessThan(limits.forward)
  })
})
