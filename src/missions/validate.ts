import i18n from '@/i18n'
import { capabilitiesFor } from '@/lib/robotCapabilities'
import type { MissionLibraryEntry, MissionValidation, RobotType, ValidationIssue, ValidationSeverity } from '@/types'
import { DEFAULT_CONSTRAINTS } from '@/types'
import { pointInPolygon, pointPolygonDist, segmentPolygonDist, type P } from './geometry'
import { segmentInto } from './estimates'

export interface CheckContext {
  noGoZones: { id: string; label: string; points: P[] }[]
  /** The site boundary, if there is one. */
  geofence: P[] | null
  /** Type of the assigned robot, when one is assigned and known. */
  robotType: RobotType | null
}

/** Clearance kept from a no-go zone when the mission sets none. */
export const DEFAULT_CLEARANCE_M = 1

export type CheckCode =
  | 'noWaypoints' | 'oneWaypoint' | 'inNoGo' | 'crossesNoGo' | 'nearNoGo' | 'outsideSite'
  | 'returnNotLast' | 'gaitNotForRobot' | 'stairsOnWheel' | 'scheduleNoRobot' | 'weeklyNoDays'

function issue(severity: ValidationSeverity, code: CheckCode, params: Record<string, unknown> = {}, waypoint_id: string | null = null): ValidationIssue {
  // Messages are built in the current language; the panel re-runs checks on
  // every render, so a language switch is picked up.
  const tr = i18n.t as unknown as (key: string, options?: Record<string, unknown>) => string
  return { severity, code, message: tr(`missions.check.${code}`, params), waypoint_id }
}

/**
 * Checks a mission can be run as drawn, as far as the console can tell
 * without a site map or the executor. Errors would stop it being dispatched;
 * warnings are worth a look. Runs on every edit, so it stays cheap.
 */
export function validateMission(m: MissionLibraryEntry, ctx: CheckContext): MissionValidation {
  const out: ValidationIssue[] = []
  const wps = m.waypoints
  const c = m.constraints ?? DEFAULT_CONSTRAINTS
  const clearance = c.min_clearance_m ?? DEFAULT_CLEARANCE_M

  if (wps.length === 0) out.push(issue('error', 'noWaypoints'))
  else if (wps.length === 1) out.push(issue('warning', 'oneWaypoint'))

  wps.forEach((wp, i) => {
    const n = i + 1
    const inside = ctx.noGoZones.find((z) => pointInPolygon(wp, z.points))
    if (inside) out.push(issue('error', 'inNoGo', { n, zone: inside.label }, wp.waypoint_id))
    else {
      const near = ctx.noGoZones.find((z) => pointPolygonDist(wp, z.points) < clearance)
      if (near) out.push(issue('warning', 'nearNoGo', { n, zone: near.label, m: clearance }, wp.waypoint_id))
    }
    if (ctx.geofence && !pointInPolygon(wp, ctx.geofence)) out.push(issue('warning', 'outsideSite', { n }, wp.waypoint_id))
    if (i > 0) {
      const prev = wps[i - 1]
      const crossed = !inside && !ctx.noGoZones.some((z) => pointInPolygon(prev, z.points))
        ? ctx.noGoZones.find((z) => segmentPolygonDist(prev, wp, z.points) === 0)
        : undefined
      if (crossed) out.push(issue('error', 'crossesNoGo', { from: i, to: n, zone: crossed.label }, wp.waypoint_id))
      const gait = segmentInto(m.segments, prev, wp)?.gait
      if (gait && ctx.robotType && !capabilitiesFor(ctx.robotType).velocityGaits.includes(gait)) {
        out.push(issue('error', 'gaitNotForRobot', { n, gait }, wp.waypoint_id))
      }
    }
    if (i < wps.length - 1 && wp.actions.some((a) => a.type === 'return_to_dock')) {
      out.push(issue('warning', 'returnNotLast', { n }, wp.waypoint_id))
    }
  })

  if (c.stairs_allowed && ctx.robotType === 'wheel') out.push(issue('error', 'stairsOnWheel'))
  if (m.schedule && !m.robot_id) out.push(issue('warning', 'scheduleNoRobot'))
  if (m.schedule?.recurrence === 'weekly' && m.schedule.days_of_week.length === 0) out.push(issue('error', 'weeklyNoDays'))

  const status = out.some((x) => x.severity === 'error') ? 'invalid'
    : out.some((x) => x.severity === 'warning') ? 'warnings' : 'valid'
  return { status, issues: out }
}
