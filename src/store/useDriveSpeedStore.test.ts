import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clampSpeedPct, DEFAULT_DRIVE_SPEED, loadDriveSpeeds, MAX_SPEED_PCT, MIN_SPEED_PCT,
  SPEED_TIER_PCT, speedPctOf, useDriveSpeedStore,
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
