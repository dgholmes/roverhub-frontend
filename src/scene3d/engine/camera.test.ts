import { describe, expect, it } from 'vitest'
import {
  angleDiff, canStand, easeInOut, flyFrom, flyLook, flyZoom, followInput, followWant, headingTo, lerpPose,
  planPosition, planZoom, previewStep, scaleBar, stepFly, stepPlan, stepStandin, stepTilt, wheelFactor,
  type FlyCam, type FollowCam, type PlanCam,
} from './camera'

const keys = (...k: string[]) => new Set(k)
const body = (o: Partial<FollowCam> = {}): FollowCam =>
  ({ x: 0, z: 0, heading: 0, orbit: 0, pitch: 0.5, dist: 3.8, walkPhase: 0, gait: 0, ...o })

describe('Plan', () => {
  it('pans forward (screen up) at 0.7 x distance a second', () => {
    const p: PlanCam = { tx: 0, tz: 0, dist: 10, yaw: 0 }
    expect(stepPlan(p, keys('KeyW'), 1)).toBe(true)
    expect(p.tx).toBeCloseTo(0)
    expect(p.tz).toBeCloseTo(-7)   // -Z is north
  })

  it('pans right along the turned screen and rotates with Q/E', () => {
    const p: PlanCam = { tx: 0, tz: 0, dist: 10, yaw: Math.PI / 2 }
    stepPlan(p, keys('ArrowRight'), 1)
    expect(p.tx).toBeCloseTo(0)
    expect(p.tz).toBeCloseTo(-7)
    stepPlan(p, keys('KeyQ'), 0.5)
    expect(p.yaw).toBeCloseTo(Math.PI / 2 + 0.7)
  })

  it('zooms with R/F and the wheel within 3-120 m, and does nothing with no keys', () => {
    const p: PlanCam = { tx: 1, tz: 2, dist: 10, yaw: 0 }
    expect(stepPlan(p, keys(), 0.1)).toBe(false)
    stepPlan(p, keys('KeyR'), 0.5)
    expect(p.dist).toBeCloseTo(4)
    expect(planZoom(4, 0.1)).toBe(3)
    expect(planZoom(100, 2)).toBe(120)
  })

  it('looks straight down untilted and from 46 degrees fully tilted', () => {
    const p: PlanCam = { tx: 0, tz: 0, dist: 10, yaw: 0 }
    const top = planPosition(p, 0)
    expect(Math.atan2(top.y, Math.hypot(top.x, top.z)) * 180 / Math.PI).toBeCloseTo(89.4, 3)
    const tilted = planPosition(p, 1)
    expect(Math.atan2(tilted.y, Math.hypot(tilted.x, tilted.z)) * 180 / Math.PI).toBeCloseTo(46, 3)
    expect(tilted.z).toBeGreaterThan(0)   // from the south, looking north
  })

  it('animates the tilt at 1.6 a second and lands on the goal', () => {
    expect(stepTilt(0, 1, 0.25)).toBeCloseTo(0.4)
    expect(stepTilt(0.9, 1, 0.25)).toBe(1)
    expect(stepTilt(0.3, 0, 0.5)).toBe(0)
    expect(stepTilt(0.5, 0.5, 1)).toBe(0.5)
    expect(easeInOut(0)).toBe(0)
    expect(easeInOut(1)).toBe(1)
    expect(easeInOut(0.5)).toBeCloseTo(0.5)
  })
})

describe('Fly', () => {
  it('moves forward along its yaw at 3 m/s and turns with the arrows', () => {
    const f: FlyCam = { x: 0, y: 2, z: 0, yaw: 0, pitch: 0 }
    stepFly(f, keys('KeyW'), 1)
    expect(f.z).toBeCloseTo(-3)
    stepFly(f, keys('ArrowLeft'), 1)
    expect(f.yaw).toBeCloseTo(1.5)
  })

  it('rises with Space or E, sinks with Shift or Q, and stays within 0.15-25 m', () => {
    const f: FlyCam = { x: 0, y: 1, z: 0, yaw: 0, pitch: 0 }
    stepFly(f, keys('Space'), 1)
    expect(f.y).toBeCloseTo(4)
    stepFly(f, keys('ShiftLeft'), 10)
    expect(f.y).toBe(0.15)
    stepFly(f, keys('up'), 100)
    expect(f.y).toBe(25)
  })

  it('wheels along the view direction and looks with a drag, pitch held in +-1.5', () => {
    const f: FlyCam = { x: 0, y: 5, z: 0, yaw: 0, pitch: -Math.PI / 4 }
    flyZoom(f, wheelFactor(-120))
    expect(f.z).toBeLessThan(0)
    expect(f.y).toBeLessThan(5)
    flyLook(f, 0, -10000)
    expect(f.pitch).toBe(1.5)
  })

  it('takes over a camera looking the same way it did', () => {
    const dir = { x: -Math.sin(0.7) * Math.cos(-0.3), y: Math.sin(-0.3), z: -Math.cos(0.7) * Math.cos(-0.3) }
    const f = flyFrom({ x: 1, y: 2, z: 3 }, dir)
    expect(f.yaw).toBeCloseTo(0.7)
    expect(f.pitch).toBeCloseTo(-0.3)
    expect(f).toMatchObject({ x: 1, y: 2, z: 3 })
  })
})

describe('Follow', () => {
  const open = () => true

  it('reads the page keys: walk, back up at half speed, turn, side-step', () => {
    expect(followInput(keys('KeyW', 'KeyA'))).toEqual({ f: 1, side: 0, turn: 1 })
    expect(followInput(keys('ArrowDown', 'KeyE'))).toEqual({ f: -0.5, side: -1, turn: 0 })
  })

  it('walks 1.2 m/s along its heading', () => {
    const b = body()
    expect(stepStandin(b, { f: 1, side: 0, turn: 0 }, 1, open)).toBe('moved')
    expect(b.x).toBeCloseTo(1.2)
    expect(b.z).toBeCloseTo(0)
    const n = body({ heading: Math.PI / 2 })
    stepStandin(n, { f: 1, side: 0, turn: 0 }, 1, open)
    expect(n.z).toBeCloseTo(-1.2)   // heading pi/2 faces map +y, world -Z
  })

  it('slides along a wall instead of stopping, and bumps only when both axes are blocked', () => {
    const ok = (X: number) => X < 1   // a wall at X = 1
    const b = body({ x: 0.5, heading: Math.PI / 4 })
    expect(stepStandin(b, { f: 1, side: 0, turn: 0 }, 0.5, ok)).toBe('moved')
    expect(b.x).toBe(0.5)
    expect(b.z).toBeLessThan(0)
    const stuck = body({ x: 0.5 })
    expect(stepStandin(stuck, { f: 1, side: 0, turn: 0 }, 0.5, () => false)).toBe('bumped')
    expect(stuck.x).toBe(0.5)
  })

  it('checks the whole 0.6 x 0.3 m footprint, not just the centre', () => {
    const okNearWall = (X: number) => X < 1
    expect(canStand(0.5, 0, 0, okNearWall)).toBe(true)
    expect(canStand(0.75, 0, 0, okNearWall)).toBe(false)   // the nose (+0.3) is past the wall
    expect(canStand(0.75, 0, Math.PI / 2, okNearWall)).toBe(true) // turned, it is 0.15 wide that way
  })

  it('previews by turning first, then walking, and arrives within 5 cm', () => {
    const b = body({ heading: Math.PI - 0.5 })
    previewStep(b, 2, 0, 0.1)
    expect(b.x).toBe(0)                                  // facing away: turn only
    expect(b.heading).toBeCloseTo(Math.PI - 0.74)
    const facing = body()
    let result: string = 'walking'
    for (let k = 0; k < 200 && result === 'walking'; k++) result = previewStep(facing, 2, 0, 0.05)
    expect(result).toBe('arrived')
    expect(facing.x).toBeCloseTo(2, 1)
    expect(facing.gait).toBeGreaterThan(0.9)
  })

  it('puts the chase camera behind and above the body', () => {
    const w = followWant(body({ x: 5, z: 0, heading: 0, pitch: 0, dist: 4 }))
    expect(w.x).toBeCloseTo(1)
    expect(w.y).toBeCloseTo(0.45)
    expect(w.z).toBeCloseTo(0)
  })

  it('measures headings like the stand-in, CCW from +X seen from above', () => {
    expect(headingTo(0, 0, 0, -1)).toBeCloseTo(Math.PI / 2)
    expect(angleDiff(0.1, 2 * Math.PI - 0.1)).toBeCloseTo(0.2)
    expect(angleDiff(-3, 3)).toBeCloseTo(2 * Math.PI - 6)
  })
})

describe('lerpPose and scaleBar', () => {
  it('eases toward the target, snaps a long jump, and stops when there', () => {
    const shown = { x: 0, y: 0, yaw: 0 }
    expect(lerpPose(shown, { x: 1, y: 0, yaw: 0.5 }, 0.1)).toBe(true)
    expect(shown.x).toBeGreaterThan(0)
    expect(shown.x).toBeLessThan(1)
    expect(lerpPose(shown, { x: 10, y: 0, yaw: 0 }, 0.1)).toBe(false)
    expect(shown.x).toBe(10)
    expect(lerpPose(shown, { x: 10, y: 0, yaw: 0 }, 0.1)).toBe(false)
  })

  it('turns the short way round', () => {
    const shown = { x: 0, y: 0, yaw: Math.PI - 0.1 }
    lerpPose(shown, { x: 0, y: 0, yaw: -Math.PI + 0.1 }, 0.1)
    expect(shown.yaw).toBeGreaterThan(Math.PI - 0.1)
  })

  it('picks the first nice length at least 60 px long', () => {
    const sb = scaleBar(40, 600)
    expect([0.5, 1, 2, 5, 10, 20]).toContain(sb.metres)
    expect(sb.px).toBeGreaterThanOrEqual(60)
    expect(scaleBar(3, 600).metres).toBe(0.5)
  })
})
