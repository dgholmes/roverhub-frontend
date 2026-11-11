import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clampSpeedPct, DEFAULT_DRIVE_SPEED, loadDriveSpeeds, MAX_SPEED_PCT, MAX_WALK_SPEED_MPS, MIN_SPEED_PCT,
  MIN_WALK_SPEED_MPS, SPEED_TIER_PCT, speedPctOf, useDriveSpeedStore, walkSpeedMpsOf,
} from './useDriveSpeedStore'

/** A localStorage that keeps what it is given, like a browser's. */
function memoryStorage() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v) },
    removeItem: (k: string) => { data.delete(k) },
  }
}

/** One that refuses everything, as a private window or blocked site data can. */
const throwingStorage = {
  getItem: () => { throw new Error('denied') },
  setItem: () => { throw new Error('denied') },
  removeItem: () => { throw new Error('denied') },
}

const pctFor = (robotId: string) =>
  speedPctOf(useDriveSpeedStore.getState().speeds[robotId] ?? DEFAULT_DRIVE_SPEED)

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
  useDriveSpeedStore.setState({ speeds: {} })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('drive speed tiers', () => {
  it('are Slow 30, Normal 60 and Fast 80, capped at the bridge maximum', () => {
    expect(SPEED_TIER_PCT).toEqual({ slow: 30, normal: 60, fast: 80 })
    expect(MAX_SPEED_PCT).toBe(80)
    expect(MIN_SPEED_PCT).toBe(10)
  })

  it('defaults every robot to Normal', () => {
    expect(pctFor('rover-pi')).toBe(60)
    expect(DEFAULT_DRIVE_SPEED.tier).toBe('normal')
  })

  it('keeps a setting per robot', () => {
    useDriveSpeedStore.getState().setTier('rover-pi', 'slow')
    useDriveSpeedStore.getState().setTier('rover-jetson', 'fast')
    expect(pctFor('rover-pi')).toBe(30)
    expect(pctFor('rover-jetson')).toBe(80)
    expect(pctFor('rover-other')).toBe(60)
  })
})

describe('custom speed', () => {
  it('clamps to 10-80 and rounds to a whole %', () => {
    const { setCustomPct } = useDriveSpeedStore.getState()
    setCustomPct('r1', 95)
    expect(pctFor('r1')).toBe(80)
    setCustomPct('r1', 2)
    expect(pctFor('r1')).toBe(10)
    setCustomPct('r1', 47.6)
    expect(pctFor('r1')).toBe(48)
    expect(clampSpeedPct(Number.NaN)).toBe(60)
  })

  it('selects Custom, and comes back where it was left after a preset', () => {
    const { setCustomPct, setTier } = useDriveSpeedStore.getState()
    setCustomPct('r1', 45)
    expect(useDriveSpeedStore.getState().speeds.r1.tier).toBe('custom')
    setTier('r1', 'fast')
    expect(pctFor('r1')).toBe(80)
    setTier('r1', 'custom')
    expect(pctFor('r1')).toBe(45)
  })
})

describe('remembered across reloads', () => {
  it('reads back what was stored, per robot', () => {
    useDriveSpeedStore.getState().setTier('rover-pi', 'slow')
    useDriveSpeedStore.getState().setCustomPct('rover-jetson', 35)
    expect(loadDriveSpeeds()).toEqual({
      'rover-pi': { tier: 'slow', customPct: 60 },
      'rover-jetson': { tier: 'custom', customPct: 35 },
    })
  })

  it('starts a freshly loaded store on the stored settings', async () => {
    useDriveSpeedStore.getState().setTier('rover-pi', 'fast')
    vi.resetModules()
    const fresh = await import('./useDriveSpeedStore')
    expect(fresh.useDriveSpeedStore.getState().speeds['rover-pi'].tier).toBe('fast')
  })

  it('drops entries it cannot read, and clamps a stored custom %', () => {
    localStorage.setItem('rh.driveSpeed', JSON.stringify({
      a: { tier: 'warp', customPct: 50 },
      b: { tier: 'custom', customPct: 400 },
      c: null,
    }))
    expect(loadDriveSpeeds()).toEqual({ b: { tier: 'custom', customPct: 80 } })
    localStorage.setItem('rh.driveSpeed', 'not json')
    expect(loadDriveSpeeds()).toEqual({})
  })

  it('works without storage when localStorage throws', () => {
    vi.stubGlobal('localStorage', throwingStorage)
    expect(loadDriveSpeeds()).toEqual({})
    expect(() => useDriveSpeedStore.getState().setTier('r1', 'slow')).not.toThrow()
    expect(pctFor('r1')).toBe(30)
  })
})

describe('walkSpeedMpsOf: the Speed tier as a walk’s top speed (m/s), never the robot’s %', () => {
  const custom = (customPct: number) => walkSpeedMpsOf({ tier: 'custom', customPct })

  it('gives each preset its limit: Slow 0.20, Normal 0.35, Fast 0.50', () => {
    expect(walkSpeedMpsOf({ tier: 'slow', customPct: 60 })).toBe(0.2)
    expect(walkSpeedMpsOf({ tier: 'normal', customPct: 60 })).toBe(0.35)
    expect(walkSpeedMpsOf({ tier: 'fast', customPct: 60 })).toBe(0.5)
    expect(walkSpeedMpsOf(DEFAULT_DRIVE_SPEED)).toBe(0.35)
  })

  it('ignores the remembered Custom % while a preset is chosen', () => {
    expect(walkSpeedMpsOf({ tier: 'slow', customPct: MAX_SPEED_PCT })).toBe(0.2)
  })

  it('walks Custom at 30/60/80 % exactly like Slow/Normal/Fast (one table)', () => {
    for (const tier of ['slow', 'normal', 'fast'] as const) {
      expect(custom(SPEED_TIER_PCT[tier])).toBe(walkSpeedMpsOf({ tier, customPct: 0 }))
    }
    expect(custom(30)).toBe(0.2)
    expect(custom(60)).toBe(0.35)
    expect(custom(MAX_SPEED_PCT)).toBe(MAX_WALK_SPEED_MPS)
  })

  it('interpolates Custom linearly between neighbouring tiers', () => {
    expect(custom(40)).toBe(0.25)
    expect(custom(50)).toBe(0.3)
    expect(custom(65)).toBe(0.39) // 0.3875
    expect(custom(75)).toBe(0.46) // 0.4625
  })

  it('rounds Custom to 0.01 m/s, a half up', () => {
    for (let pct = MIN_SPEED_PCT; pct <= MAX_SPEED_PCT; pct++) {
      const v = custom(pct)
      expect(Math.round(v * 100) / 100).toBe(v)
    }
    expect(custom(45)).toBe(0.28) // 0.275
    expect(custom(70)).toBe(0.43) // 0.425
  })

  it('never goes below 0.20 m/s, where Nav2’s slow-downs have no room', () => {
    expect(MIN_WALK_SPEED_MPS).toBe(0.2)
    expect(custom(MIN_SPEED_PCT)).toBe(0.2)
    expect(custom(20)).toBe(0.2)
    expect(custom(0)).toBe(0.2) // clamped to MIN_SPEED_PCT first
  })

  it('reads an unreadable Custom % as Normal’s 60: 0.35 m/s', () => {
    expect(custom(NaN)).toBe(0.35)
  })

  it('never goes above 0.50 m/s, whatever % is stored', () => {
    expect(custom(100)).toBe(0.5)
    expect(custom(1e6)).toBe(0.5)
  })
})
