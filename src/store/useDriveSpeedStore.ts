import { create } from 'zustand'

/**
 * The operator's manual-drive speed, per robot. It works like the handheld
 * remote: this sets the ROBOT'S OWN speed %, a held key asks for full stick
 * (manualControlMath's FULL_STICK), and the robot caps motion at its speed %, so
 * pushing harder can never go faster than what is set. Every DRIVE carries it
 * as its speed ratio and the bridge sets the robot to it.
 *
 * A local setting: choosing a speed needs no control and sends nothing by
 * itself. Remembered per robot in localStorage, as a per-viewer convenience --
 * every read and write is wrapped, and a browser that refuses storage simply
 * starts on Normal each time.
 */

/** Mirrors the bridge's default SAFETY_MAX_SPEED_RATIO (robot_bridge/config.py),
 * which clamps any higher speed % to it -- so the console never offers more. */
export const MAX_SPEED_PCT = 80
export const MIN_SPEED_PCT = 10
/** The Custom slider's step. The store itself takes any whole %. */
export const CUSTOM_SPEED_STEP = 5

export type SpeedTier = 'slow' | 'normal' | 'fast' | 'custom'
export const SPEED_TIERS: readonly SpeedTier[] = ['slow', 'normal', 'fast', 'custom']

export const SPEED_TIER_PCT: Record<Exclude<SpeedTier, 'custom'>, number> = {
  slow: 30,
  normal: 60,
  fast: MAX_SPEED_PCT,
}

export interface DriveSpeed {
  tier: SpeedTier
  /** What Custom is set to, kept while a preset is chosen so Custom comes back
   * where it was left. */
  customPct: number
}

export const DEFAULT_DRIVE_SPEED: DriveSpeed = { tier: 'normal', customPct: SPEED_TIER_PCT.normal }

const STORAGE_KEY = 'rh.driveSpeed'

/** A whole % within what the bridge allows. Anything unreadable is Normal. */
export function clampSpeedPct(pct: number): number {
  if (!Number.isFinite(pct)) return SPEED_TIER_PCT.normal
  return Math.max(MIN_SPEED_PCT, Math.min(MAX_SPEED_PCT, Math.round(pct)))
}

/** The speed % a setting puts the robot at. */
export function speedPctOf(speed: DriveSpeed): number {
  return speed.tier === 'custom' ? clampSpeedPct(speed.customPct) : SPEED_TIER_PCT[speed.tier]
}

/**
 * A tapped walk's top speed, m/s, per tier (NavGotoParams.max_speed_mps,
 * schema 0.0.18). The same Speed control, read differently: a walk never sets
 * the robot's own % (the bridge holds it fixed while Nav2 walks, because Nav2's
 * m/s only mean what it asks at the % the /joy curves were measured at -- at
 * 10 % on 2026-11-11 the robot barely turned), so the tier becomes a LIMIT
 * handed to Nav2 instead.
 */
export const WALK_SPEED_MPS: Record<Exclude<SpeedTier, 'custom'>, number> = {
  slow: 0.2,
  normal: 0.35,
  fast: 0.5,
}
/** The floor (Slow's limit): below it Nav2's own slow-downs near goals and
 * obstacles have no room to work, and the walk crawls or stalls. */
export const MIN_WALK_SPEED_MPS = WALK_SPEED_MPS.slow
/** The ceiling (Fast's limit, at MAX_SPEED_PCT). */
export const MAX_WALK_SPEED_MPS = WALK_SPEED_MPS.fast

/**
 * ONE table for both readings: each preset's % (SPEED_TIER_PCT) paired with its
 * walk limit (WALK_SPEED_MPS), slowest first. A preset reads its own point;
 * Custom interpolates between neighbouring points and holds the end values
 * outside them -- so Custom at 30/60/80 % walks exactly like Slow/Normal/Fast.
 */
const WALK_SPEED_POINTS: readonly (readonly [pct: number, mps: number])[] = (['slow', 'normal', 'fast'] as const)
  .map((tier) => [SPEED_TIER_PCT[tier], WALK_SPEED_MPS[tier]] as const)

/** The top speed, m/s to 0.01, a walk takes from this setting: a preset's own
 * limit, or Custom piecewise-linear through WALK_SPEED_POINTS (Slow's limit
 * below 30 %, Fast's above 80 %). An unreadable Custom % is Normal's 60. */
export function walkSpeedMpsOf(speed: DriveSpeed): number {
  if (speed.tier !== 'custom') return WALK_SPEED_MPS[speed.tier]
  const pct = clampSpeedPct(speed.customPct)
  const first = WALK_SPEED_POINTS[0], last = WALK_SPEED_POINTS[WALK_SPEED_POINTS.length - 1]
  if (pct <= first[0]) return first[1]
  if (pct >= last[0]) return last[1]
  const i = WALK_SPEED_POINTS.findIndex(([p]) => p >= pct)
  const [p0, v0] = WALK_SPEED_POINTS[i - 1], [p1, v1] = WALK_SPEED_POINTS[i]
  // In hundredths, so a half (0.275, 0.425) rounds up rather than down on a
  // float that lands at 27.4999...
  const lo = Math.round(v0 * 100), hi = Math.round(v1 * 100)
  return Math.round(lo + ((hi - lo) * (pct - p0)) / (p1 - p0)) / 100
}

/** What this browser remembered, keeping only well-formed entries. */
export function loadDriveSpeeds(): Record<string, DriveSpeed> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    const speeds: Record<string, DriveSpeed> = {}
    for (const [robotId, value] of Object.entries(parsed)) {
      const v = value as Partial<DriveSpeed> | null
      if (!v || !SPEED_TIERS.includes(v.tier as SpeedTier)) continue
      speeds[robotId] = { tier: v.tier as SpeedTier, customPct: clampSpeedPct(Number(v.customPct)) }
    }
    return speeds
  } catch {
    return {}
  }
}

function saveDriveSpeeds(speeds: Record<string, DriveSpeed>): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(speeds)) } catch { /* per-viewer convenience only */ }
}

interface DriveSpeedState {
  speeds: Record<string, DriveSpeed>
  setTier: (robotId: string, tier: SpeedTier) => void
  /** Sets Custom to `pct`, clamped to MIN_SPEED_PCT-MAX_SPEED_PCT. */
  setCustomPct: (robotId: string, pct: number) => void
}

export const useDriveSpeedStore = create<DriveSpeedState>((set, get) => {
  const update = (robotId: string, next: DriveSpeed) => {
    const speeds = { ...get().speeds, [robotId]: next }
    saveDriveSpeeds(speeds)
    set({ speeds })
  }
  return {
    speeds: loadDriveSpeeds(),
    setTier: (robotId, tier) => {
      const current = get().speeds[robotId] ?? DEFAULT_DRIVE_SPEED
      update(robotId, { ...current, tier })
    },
    setCustomPct: (robotId, pct) => update(robotId, { tier: 'custom', customPct: clampSpeedPct(pct) }),
  }
})

/** This robot's setting. Returns the stored object itself, or the shared
 * default, so it is stable between renders. */
export function useDriveSpeed(robotId: string): DriveSpeed {
  return useDriveSpeedStore((s) => s.speeds[robotId] ?? DEFAULT_DRIVE_SPEED)
}
