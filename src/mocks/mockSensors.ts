import { LidarMountFeed } from '@/lib/realtime/lidarMountFeed'
import { mountInBounds } from '@/sensors/lidarMount'
import {
  CALIBRATION_MODES, DIFFERS_MIN_DEG, DIFFERS_MIN_M, MAX_MOUNT_HISTORY,
  type CalibrationMode, type LidarMount, type LidarMountEstimate, type LidarMountStatus,
} from '@/types/sensors'

/**
 * The mock bridge's lidar calibration (sensors.py, schema 0.0.23), so
 * Systems › Sensors and the bell's "the lidar seems to have moved" can be
 * tried in demo mode: the first robot is in Suggest with a clearly different
 * offset (a lidar typed at 0.200 m that measures 0.251 m), and a tilt measured
 * standing still (5.3°) a little under the walking value in use (5.9°), as
 * on the robot; the second is in Auto and agrees with itself. SET_LIDAR_MOUNT and SET_CALIBRATION_MODE change them as
 * the bridge would, and every change lands in the history, newest first.
 */

const iso = (msAgo: number, now: number) => new Date(now - msAgo).toISOString()
const HOUR = 3_600_000

/** What the bridge counts as clearly different (sensors.py `differs`). */
export function estimateDiffers(inUse: LidarMount, m: LidarMountEstimate | null): boolean {
  if (!m) return false
  const far = (a: number | null, b: number, limit: number) => a !== null && Math.abs(a - b) > limit
  return far(m.x_m, inUse.x_m, DIFFERS_MIN_M) || far(m.y_m, inUse.y_m, DIFFERS_MIN_M)
    || far(m.pitch_deg, inUse.pitch_deg, DIFFERS_MIN_DEG) || far(m.roll_deg, inUse.roll_deg, DIFFERS_MIN_DEG)
}

export function seedLidarMounts(robots: { robot_id: string; site_id: string }[], now = Date.now()): LidarMountStatus[] {
  return robots.slice(0, 2).map((r, k) => {
    if (k === 0) {
      const inUse: LidarMount = { x_m: 0.2, y_m: 0.015, z_m: 0.25, roll_deg: 0.0, pitch_deg: 5.9, yaw_deg: 0.0 }
      const measured: LidarMountEstimate = {
        x_m: 0.251, y_m: 0.012, sd_x_m: 0.008, sd_y_m: 0.006, roll_deg: 0.2, pitch_deg: 5.3, sd_tilt_deg: 0.3,
        turns: 184, still_samples: 5120, since: iso(50 * HOUR, now), updated_at: iso(10 * 60_000, now),
      }
      return {
        robot_id: r.robot_id, site_id: r.site_id, mode: 'suggest', in_use: inUse, measured,
        differs: estimateDiffers(inUse, measured),
        history: [
          { at: iso(72 * HOUR, now), mount: inUse, source: 'manual', by: 'operator-dev' },
          { at: iso(120 * HOUR, now), mount: { x_m: 0, y_m: 0, z_m: 0.25, roll_deg: 0, pitch_deg: 0, yaw_deg: 0 }, source: 'default', by: null },
        ],
        updated_at: iso(10 * 60_000, now),
      }
    }
    const inUse: LidarMount = { x_m: 0.188, y_m: -0.004, z_m: 0.21, roll_deg: -0.4, pitch_deg: 1.1, yaw_deg: 0.0 }
    const measured: LidarMountEstimate = {
      x_m: 0.19, y_m: -0.002, sd_x_m: 0.005, sd_y_m: 0.004, roll_deg: -0.3, pitch_deg: 1.2, sd_tilt_deg: 0.2,
      turns: 61, still_samples: 1840, since: iso(26 * HOUR, now), updated_at: iso(2 * HOUR, now),
    }
    return {
      robot_id: r.robot_id, site_id: r.site_id, mode: 'auto', in_use: inUse, measured, differs: false,
      history: [
        { at: iso(25 * HOUR, now), mount: inUse, source: 'auto', by: null },
        { at: iso(30 * HOUR, now), mount: { ...inUse, x_m: 0.15, pitch_deg: 0 }, source: 'manual', by: 'operator-dev' },
      ],
      updated_at: iso(2 * HOUR, now),
    }
  })
}

export class MockLidarMounts {
  readonly feed = new LidarMountFeed()
  private readonly now: () => number

  constructor(robots: { robot_id: string; site_id: string }[], options: { now?: () => number } = {}) {
    this.now = options.now ?? (() => Date.now())
    for (const s of seedLidarMounts(robots, this.now())) this.feed.publish(s)
  }

  /** Why the mock bridge refuses this command, or null: no status (a robot
   * that does not calibrate), or params the schema would reject. */
  refusal(robotId: string, type: string, params: Record<string, unknown> | undefined): string | null {
    if (type !== 'SET_LIDAR_MOUNT' && type !== 'SET_CALIBRATION_MODE') return null
    if (!this.feed.get(robotId)) return 'REJECTED_NO_LIDAR: this robot has no lidar calibration'
    if (type === 'SET_CALIBRATION_MODE') {
      return (CALIBRATION_MODES as readonly unknown[]).includes(params?.mode) ? null : 'REJECTED_INVALID_PARAMS: mode must be off, suggest or auto'
    }
    const mount = params?.mount as LidarMount | undefined
    const source = params?.source
    if (!mount || (source !== 'manual' && source !== 'measured') || !mountInBounds(mount)) {
      return 'REJECTED_INVALID_PARAMS: the lidar mount is outside what the robot accepts'
    }
    return null
  }

  /** A command that completed: change the status as the bridge would. */
  apply(robotId: string, type: string, params: Record<string, unknown> | undefined, by: string | null): void {
    const current = this.feed.get(robotId)
    if (!current) return
    const at = new Date(this.now()).toISOString()
    if (type === 'SET_LIDAR_MOUNT') {
      const mount = { ...(params?.mount as LidarMount) }
      const source = params?.source === 'measured' ? 'measured' : 'manual'
      this.feed.publish({
        ...current, in_use: mount, differs: current.mode === 'off' ? false : estimateDiffers(mount, current.measured),
        history: [{ at, mount, source, by }, ...current.history].slice(0, MAX_MOUNT_HISTORY), updated_at: at,
      } as LidarMountStatus)
    } else if (type === 'SET_CALIBRATION_MODE') {
      const mode = params?.mode as CalibrationMode
      // Off measures nothing; turning it back on starts a fresh estimate.
      const measured: LidarMountEstimate | null = mode === 'off' ? null : current.measured ?? {
        x_m: null, y_m: null, sd_x_m: null, sd_y_m: null, roll_deg: null, pitch_deg: null, sd_tilt_deg: null,
        turns: 0, still_samples: 0, since: at, updated_at: null,
      }
      this.feed.publish({ ...current, mode, measured, differs: mode === 'off' ? false : estimateDiffers(current.in_use, measured), updated_at: at })
    }
  }
}
