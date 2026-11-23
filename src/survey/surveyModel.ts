import { isMissionOwner, isNavOwner } from '@/liveops/controlOwner'
import { schemaAtLeast } from '@/lib/schemaVersion'
import type { RobotRunView } from '@/liveops/robotRun'
import type { RobotState } from '@/types'
import type { Point2D } from '@/types/maps'
import {
  CAMERA_SETS, DRIFT_LEVELS, MAX_SURVEY_MAP_CELLS_PER_SIDE, MAX_SURVEY_MAP_PNG_B64, MAX_SURVEY_PATH_POINTS, SURVEY_STATES,
  type CameraSet, type DriftLevel, type SurveyMapFrame, type SurveyPose, type SurveyState, type SurveyStatus,
} from '@/types/survey'

/**
 * The survey's rules, pure: what a survey/status or survey/map payload must be
 * to be shown, which robots can survey at all, when one may start, and how a
 * status reads as a phase of the screen.
 */

/** The wire contract that brought surveying (shared `version.py`). A bridge
 * older than this has no survey commands or topics: it would refuse
 * START_SURVEY as an unknown command at best. */
export const SURVEY_SCHEMA_VERSION = '0.0.23'

/** Can this robot's bridge survey at all? The console offers survey only then. */
export function robotCanSurvey(robot: Pick<RobotState, 'bridge'>): boolean {
  return schemaAtLeast(robot.bridge?.schema_version, SURVEY_SCHEMA_VERSION)
}

// --- phases ---------------------------------------------------------------

/** Driving and recording: the screen shows the live map and the drive bar. */
export function isSurveying(state: SurveyState | null | undefined): boolean {
  return state === 'starting' || state === 'recording'
}

/** The survey still has the lidar, so the robot cannot navigate: LiveOps shows
 * the survey map in the map pane and hides tap-to-walk and Set position. */
export function surveyHoldsLidar(state: SurveyState | null | undefined): boolean {
  return state === 'starting' || state === 'recording' || state === 'saving'
}

/** Stopped and being turned into a draft map on the device. */
export function isFinishing(state: SurveyState | null | undefined): boolean {
  return state === 'saving' || state === 'processing' || state === 'uploading'
}

/** A survey is under way in some form: another one cannot start. */
export function isSurveyBusy(state: SurveyState | null | undefined): boolean {
  return isSurveying(state) || isFinishing(state)
}

/** What the survey screen shows for a status. */
export type SurveyPhase = 'start' | 'surveying' | 'finishing' | 'done' | 'failed' | 'discarded'

export function surveyPhase(status: SurveyStatus | null | undefined): SurveyPhase {
  const s = status?.state
  if (isSurveying(s)) return 'surveying'
  if (isFinishing(s)) return 'finishing'
  if (s === 'done' || s === 'failed' || s === 'discarded') return s
  return 'start'
}

/** The device's words for the moving-object search after Stop & save
 * (survey_pipeline/common.py STAGE_MOVING). While survey/status says it, the
 * console offers Skip for now (SKIP_MOVING_SEARCH, 0.0.29). */
export const SURVEY_STAGE_MOVING = 'finding things that moved'

/** The survey is searching for things that moved, which Skip for now stops.
 * The stage may carry a note after the device's words -- "finding things that
 * moved (with the live map: the rebuild could not keep up)" when the rebuild
 * fell back to the live map -- so it is matched on how it starts. */
export function isFindingMoved(status: Pick<SurveyStatus, 'state' | 'stage'> | null | undefined): boolean {
  return status?.state === 'processing' && (status.stage ?? '').trim().toLowerCase().startsWith(SURVEY_STAGE_MOVING)
}

/** The post-survey stages in order, for the stepper. */
export const FINISH_STAGES = ['saving', 'processing', 'uploading', 'done'] as const
export type FinishStage = typeof FINISH_STAGES[number]

// --- starting -------------------------------------------------------------

export type StartRefusal =
  | 'offline' | 'oldBridge' | 'surveyRunning' | 'surveyFinishing' | 'estop' | 'mission' | 'navGoal' | 'controlHeld'

/**
 * Why a survey cannot start on this robot now, or null when it can. The same
 * rules the bridge applies (contract: nobody else holds control, no E-Stop, no
 * mission or nav goal running); checked here so the reason is on the button
 * before the click, not in a failed toast after it. The bridge still decides.
 */
export function surveyStartRefusal(
  robot: RobotState, status: SurveyStatus | null | undefined, run: RobotRunView, operatorId: string,
): StartRefusal | null {
  if (robot.connectivity.bridge_state !== 'connected') return 'offline'
  if (!robotCanSurvey(robot)) return 'oldBridge'
  if (isSurveying(status?.state)) return 'surveyRunning'
  if (isFinishing(status?.state)) return 'surveyFinishing'
  if (robot.abstract_state === 'E_STOP') return 'estop'
  if (run?.phase === 'running' || run?.phase === 'paused' || isMissionOwner(robot.control_owner)) return 'mission'
  if (robot.nav_goal?.state === 'active' || robot.nav_goal?.state === 'stuck' || isNavOwner(robot.control_owner)) return 'navGoal'
  const owner = robot.control_owner
  if (owner && owner !== operatorId) return 'controlHeld'
  return null
}

/** A survey id: sortable by when it started, unique enough per device. */
export function newSurveyId(now: Date = new Date(), random: () => number = Math.random): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0')
  const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`
  return `survey-${stamp}-${Math.floor(random() * 0xffff).toString(16).padStart(4, '0')}`
}

/** The name a new survey starts with: "Survey 2026-11-16 14:05". */
export function defaultSurveyName(now: Date = new Date(), word = 'Survey'): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${word} ${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())} ${p(now.getHours())}:${p(now.getMinutes())}`
}

// --- reading the wire -----------------------------------------------------

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const nonNeg = (v: unknown): v is number => finite(v) && v >= 0
const optStr = (v: unknown): string | null => (typeof v === 'string' ? v : null)
const optNonNeg = (v: unknown): number | null => (nonNeg(v) ? v : null)

/**
 * A survey/status payload (already JSON-parsed) as a SurveyStatus, or null.
 * The fields the screen keys on (robot, site, state, time stamp) must be right
 * or the whole status is dropped; a numeric reading that is off is dropped on
 * its own and reads as unknown.
 */
export function parseSurveyStatus(raw: unknown): SurveyStatus | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const s = raw as Record<string, unknown>
  if (typeof s.robot_id !== 'string' || !s.robot_id || typeof s.site_id !== 'string') return null
  if (typeof s.state !== 'string' || !(SURVEY_STATES as readonly string[]).includes(s.state)) return null
  if (typeof s.updated_at !== 'string') return null
  const progress = finite(s.progress) && s.progress >= 0 && s.progress <= 1 ? s.progress : null
  return {
    robot_id: s.robot_id,
    site_id: s.site_id,
    state: s.state as SurveyState,
    survey_id: optStr(s.survey_id),
    name: optStr(s.name),
    started_at: optStr(s.started_at),
    elapsed_s: nonNeg(s.elapsed_s) ? s.elapsed_s : 0,
    covered_m2: nonNeg(s.covered_m2) ? s.covered_m2 : 0,
    path_length_m: nonNeg(s.path_length_m) ? s.path_length_m : 0,
    lidar_hz: optNonNeg(s.lidar_hz),
    odometry_hz: optNonNeg(s.odometry_hz),
    drift: (DRIFT_LEVELS as readonly string[]).includes(s.drift as string) ? s.drift as DriftLevel : 'unknown',
    bag_mb: optNonNeg(s.bag_mb),
    cameras: (CAMERA_SETS as readonly string[]).includes(s.cameras as string) ? s.cameras as CameraSet : 'off',
    stage: optStr(s.stage),
    progress,
    map_id: optStr(s.map_id),
    moved_spots: Number.isInteger(s.moved_spots) && (s.moved_spots as number) >= 0 ? s.moved_spots as number : null,
    error: optStr(s.error),
    updated_at: s.updated_at,
  }
}

/**
 * A survey/map payload as a SurveyMapFrame, or null. Refused whole when
 * anything the drawing depends on is off -- the grid's geometry, the PNG, a
 * pose or path point that is not finite -- because a map drawn half-right is
 * what the operator would steer by.
 */
export function parseSurveyMapFrame(raw: unknown): SurveyMapFrame | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const f = raw as Record<string, unknown>
  for (const key of ['robot_id', 'site_id', 'survey_id', 'captured_at', 'cells_png_b64'] as const) {
    if (typeof f[key] !== 'string') return null
  }
  if (!f.robot_id || !f.survey_id || !f.cells_png_b64) return null
  if ((f.cells_png_b64 as string).length > MAX_SURVEY_MAP_PNG_B64) return null
  if (!Number.isInteger(f.seq) || (f.seq as number) < 0) return null
  if (!finite(f.resolution_m) || f.resolution_m <= 0 || f.resolution_m > 1) return null
  if (!finite(f.origin_x_m) || !finite(f.origin_y_m)) return null
  for (const key of ['width', 'height'] as const) {
    const v = f[key]
    if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > MAX_SURVEY_MAP_CELLS_PER_SIDE) return null
  }
  let pose: SurveyPose | null = null
  if (f.pose !== undefined && f.pose !== null) {
    const p = f.pose as Record<string, unknown>
    if (typeof p !== 'object' || !finite(p.x_m) || !finite(p.y_m) || !finite(p.yaw_rad)) return null
    pose = { x_m: p.x_m, y_m: p.y_m, yaw_rad: p.yaw_rad }
  }
  const rawPath = f.path ?? []
  if (!Array.isArray(rawPath) || rawPath.length > MAX_SURVEY_PATH_POINTS) return null
  const path: Point2D[] = []
  for (const p of rawPath as unknown[]) {
    if (!Array.isArray(p) || p.length !== 2 || !finite(p[0]) || !finite(p[1])) return null
    path.push([p[0], p[1]])
  }
  return {
    robot_id: f.robot_id as string,
    site_id: f.site_id as string,
    survey_id: f.survey_id as string,
    seq: f.seq as number,
    captured_at: f.captured_at as string,
    resolution_m: f.resolution_m,
    origin_x_m: f.origin_x_m,
    origin_y_m: f.origin_y_m,
    width: f.width as number,
    height: f.height as number,
    cells_png_b64: f.cells_png_b64 as string,
    pose,
    path,
  }
}

// --- geometry -------------------------------------------------------------

/** A world point (survey frame, metres) as a fractional cell position in the
 * image: column from the left, row from the TOP. survey.py: the origin is
 * "cell (0, 0)'s outer corner" with "row 0 at the TOP", so it is the image's
 * top-left corner, and +y (up) runs toward row 0. */
export function worldToCell(frame: Pick<SurveyMapFrame, 'origin_x_m' | 'origin_y_m' | 'resolution_m'>, x: number, y: number): [number, number] {
  return [(x - frame.origin_x_m) / frame.resolution_m, (frame.origin_y_m - y) / frame.resolution_m]
}

// --- display --------------------------------------------------------------

/** 142.4 -> "142". Coverage under 10 m² keeps a decimal. */
export function formatArea(m2: number): string {
  return m2 < 10 ? m2.toFixed(1) : String(Math.round(m2))
}

/** Lidar rate tone: a Mid-360 runs at 10 Hz; under 5 the map is starving. */
export function lidarTone(hz: number | null | undefined): 'green' | 'amber' | 'red' | 'neutral' {
  if (hz == null) return 'neutral'
  if (hz >= 8) return 'green'
  if (hz >= 4) return 'amber'
  return 'red'
}

export const DRIFT_TONE: Record<DriftLevel, 'green' | 'amber' | 'red' | 'neutral'> = {
  good: 'green', watch: 'amber', bad: 'red', unknown: 'neutral',
}
