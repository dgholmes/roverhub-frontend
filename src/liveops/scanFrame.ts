import { MAX_SCAN_POINTS, type ScanFrame } from '@/types/scan'
import type { Point2D } from '@/types/maps'

/**
 * The live lidar layer's data rules, pure: what a /scan payload must be to be
 * drawn, and how long a frame stays on the map.
 */

/** A frame as the console holds it: the frame and when THIS browser received
 * it. Age is judged on receipt, not `captured_at`, because the robot's clock is
 * not the browser's. */
export interface ScanSample {
  frame: ScanFrame
  receivedAt: number
}

/** Without a new frame for this long the dots fade... */
export const SCAN_FADE_MS = 2000
/** ...and for this long they are gone: a scan that old says nothing about where
 * the robot is now. */
export const SCAN_HIDE_MS = 5000

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * A /scan payload (already JSON-parsed) as a ScanFrame, or null. It arrives
 * from MQTT unvalidated, so like the schema it refuses the whole frame -- not
 * just a bad point -- when anything is off: a missing id, a pose or point that
 * is not finite, or more than MAX_SCAN_POINTS points. A frame drawn half-right
 * would be worse than none: the operator is judging the position by it.
 */
export function parseScanFrame(raw: unknown): ScanFrame | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const f = raw as Record<string, unknown>
  for (const key of ['robot_id', 'site_id', 'map_id', 'captured_at'] as const) {
    if (typeof f[key] !== 'string') return null
  }
  if (!f.robot_id || !f.map_id) return null
  const pose = f.sensor_pose as Record<string, unknown> | null | undefined
  if (typeof pose !== 'object' || pose === null || !finite(pose.x_m) || !finite(pose.y_m) || !finite(pose.yaw_rad)) return null
  if (!Array.isArray(f.points) || f.points.length > MAX_SCAN_POINTS) return null
  const points: Point2D[] = []
  for (const p of f.points as unknown[]) {
    if (!Array.isArray(p) || p.length !== 2 || !finite(p[0]) || !finite(p[1])) return null
    points.push([p[0], p[1]])
  }
  return {
    robot_id: f.robot_id as string,
    site_id: f.site_id as string,
    map_id: f.map_id as string,
    captured_at: f.captured_at as string,
    sensor_pose: { x_m: pose.x_m, y_m: pose.y_m, yaw_rad: pose.yaw_rad },
    points,
  }
}

export type ScanVisibility = 'live' | 'fading' | 'hidden'

/**
 * How a sample is drawn on the map showing `mapId`: hidden when there is none,
 * when it was taken against another map (its points are in another frame), or
 * when it is SCAN_HIDE_MS old; faded from SCAN_FADE_MS; otherwise live.
 */
export function scanVisibility(sample: ScanSample | null | undefined, mapId: string | null | undefined, now: number): ScanVisibility {
  if (!sample || !mapId || sample.frame.map_id !== mapId) return 'hidden'
  const age = now - sample.receivedAt
  if (age >= SCAN_HIDE_MS) return 'hidden'
  return age >= SCAN_FADE_MS ? 'fading' : 'live'
}
