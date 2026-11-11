import i18n from '@/i18n'
import { capabilitiesFor } from '@/lib/robotCapabilities'
import type { MissionLibraryEntry, MissionValidation, RobotType, ValidationIssue, ValidationSeverity } from '@/types'
import { DEFAULT_CONSTRAINTS, DEFAULT_RECORDING } from '@/types'
import { pointInPolygon, pointPolygonDist, segmentPolygonDist, type P } from './geometry'
import { segmentInto } from './estimates'

export interface CheckContext {
  noGoZones: { id: string; label: string; points: P[] }[]
  /** The site boundary polygons, if there are any. A point is inside the site if
   * it is inside any one; with none there is no boundary to be outside of. */
  geofences: P[][]
  /** The zones above are empty because there is nothing to check this mission
   * against (it was planned on a map that is not loaded), not because the map
   * has none. The zone checks then say so instead of passing: see `zonesFor`. */
  zonesNotChecked?: boolean
  /** Type of the robot the mission's tasks use, when they agree on one (missionRobotType). */
  robotType: RobotType | null
}

/** Clearance kept from a no-go zone when the mission sets none. */
export const DEFAULT_CLEARANCE_M = 1

export type CheckCode =
  | 'noWaypoints' | 'oneWaypoint' | 'inNoGo' | 'crossesNoGo' | 'nearNoGo' | 'outsideSite'
  | 'returnNotLast' | 'gaitNotForRobot' | 'stairsOnWheel'
  | 'announcementNoClip' | 'videoWithoutRecording' | 'videoCameraNotRecorded' | 'recordingNoCameras'
  | 'timedNoClip' | 'zonesNotChecked'
  // What the backend's route compiler refuses (schema 0.0.16, roverhub-backend
  // missions/route_steps.py): a route that has any of these is not offered Run now.
  | 'actionNotRunnable' | 'gaitNotWalk' | 'stairsNotRunnable' | 'proximityNotRunnable' | 'announcementsNotRunnable'

/** Waypoint actions a route run cannot do on the robot yet; the backend's
 * compiler refuses them. Snapshot, wait and an announcement with a clip run. */
const NOT_RUNNABLE_ACTIONS = new Set<string>(['video_clip', 'led_signal', 'operator_approval', 'return_to_dock'])

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
  // A program has no map frame: its relative moves are not positions, so there
  // is no route to check against zones or a geofence, and none to ask for.
  // Anything that is not a program is checked as a route, so a mission whose
  // kind is somehow missing gets the stricter checks, not none.
  const isProgram = m.kind === 'program'
  const wps = isProgram ? [] : m.waypoints
  const c = m.constraints ?? DEFAULT_CONSTRAINTS
  const clearance = c.min_clearance_m ?? DEFAULT_CLEARANCE_M

  if (!isProgram && wps.length === 0) out.push(issue('error', 'noWaypoints'))
  else if (!isProgram && wps.length === 1) out.push(issue('warning', 'oneWaypoint'))

  wps.forEach((wp, i) => {
    const n = i + 1
    const inside = ctx.noGoZones.find((z) => pointInPolygon(wp, z.points))
    if (inside) out.push(issue('error', 'inNoGo', { n, zone: inside.label }, wp.waypoint_id))
    else {
      const near = ctx.noGoZones.find((z) => pointPolygonDist(wp, z.points) < clearance)
      if (near) out.push(issue('warning', 'nearNoGo', { n, zone: near.label, m: clearance }, wp.waypoint_id))
    }
    if (ctx.geofences.length > 0 && !ctx.geofences.some((g) => pointInPolygon(wp, g))) out.push(issue('warning', 'outsideSite', { n }, wp.waypoint_id))
    if (i > 0) {
      const prev = wps[i - 1]
      const crossed = !inside && !ctx.noGoZones.some((z) => pointInPolygon(prev, z.points))
        ? ctx.noGoZones.find((z) => segmentPolygonDist(prev, wp, z.points) === 0)
        : undefined
      if (crossed) out.push(issue('error', 'crossesNoGo', { from: i, to: n, zone: crossed.label }, wp.waypoint_id))
      const seg = segmentInto(m.segments, prev, wp)
      const gait = seg?.gait
      if (gait && ctx.robotType && !capabilitiesFor(ctx.robotType).velocityGaits.includes(gait)) {
        out.push(issue('error', 'gaitNotForRobot', { n, gait }, wp.waypoint_id))
      }
      // A leg is walked by Nav2 in the walk gait; only its speed carries over.
      if ((gait && gait !== 'walk') || seg?.posture || seg?.wheel_leg_mode) {
        out.push(issue('error', 'gaitNotWalk', { n }, wp.waypoint_id))
      }
    }
    const notRunnable = wp.actions.find((a) => NOT_RUNNABLE_ACTIONS.has(a.type))
    if (notRunnable) {
      const tr = i18n.t as unknown as (key: string, options?: Record<string, unknown>) => string
      out.push(issue('error', 'actionNotRunnable', { n, action: tr(`missions.actions.${notRunnable.type}`, { defaultValue: notRunnable.label }) }, wp.waypoint_id))
    }
    for (const a of wp.actions) {
      if (a.type === 'voice_prompt' && !a.params.clip_id) {
        out.push(issue('error', 'announcementNoClip', { n }, wp.waypoint_id))
        break
      }
    }
    if (i < wps.length - 1 && wp.actions.some((a) => a.type === 'return_to_dock')) {
      out.push(issue('warning', 'returnNotLast', { n }, wp.waypoint_id))
    }
  })

  const recording = m.recording ?? DEFAULT_RECORDING
  const videos = wps.flatMap((w) => w.actions.filter((a) => a.type === 'video_clip'))
  if (videos.length > 0 && !recording.enabled) {
    out.push(issue('error', 'videoWithoutRecording'))
  } else if (videos.length > 0) {
    // Clips are cut from the run recording, so their camera must be in it. A
    // clip with no camera param uses the front camera, like a new task.
    const missing = [...new Set(videos.map((a) => String(a.params.camera ?? 'front')))]
      .filter((cam) => !(recording.cameras as string[]).includes(cam))
    if (missing.length > 0) {
      const tr = i18n.t as unknown as (key: string, options?: Record<string, unknown>) => string
      const cameras = missing.map((cam) => tr(`missions.actions.${cam}`, { defaultValue: cam })).join(', ')
      out.push(issue('error', 'videoCameraNotRecorded', { cameras }))
    }
  } else if (recording.enabled && recording.cameras.length === 0) {
    out.push(issue('warning', 'recordingNoCameras'))
  }
  for (const a of m.announcements ?? []) {
    if (!a.clip_id) out.push(issue('error', 'timedNoClip', { at: a.at }))
  }
  if (c.stairs_allowed && ctx.robotType === 'wheel') out.push(issue('error', 'stairsOnWheel'))
  if (!isProgram) {
    if (c.stairs_allowed) out.push(issue('error', 'stairsNotRunnable'))
    if (c.human_proximity_policy && c.human_proximity_policy !== 'none') out.push(issue('error', 'proximityNotRunnable'))
    if ((m.announcements ?? []).length > 0) out.push(issue('error', 'announcementsNotRunnable'))
  }

  // Not "valid": a tick for zones nobody looked at is one it never earned. A
  // program has no map frame, so zones were never going to be checked for it.
  const zonesUnchecked = !isProgram && wps.length > 0 && ctx.zonesNotChecked === true
  if (zonesUnchecked) out.push(issue('info', 'zonesNotChecked'))

  const status = out.some((x) => x.severity === 'error') ? 'invalid'
    : out.some((x) => x.severity === 'warning') ? 'warnings'
    : zonesUnchecked ? 'unvalidated' : 'valid'
  return { status, issues: out }
}
