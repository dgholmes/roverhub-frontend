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
