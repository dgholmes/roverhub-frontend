/**
 * Mirrors shared/schemas/survey.py (schema 0.0.23). Hand-maintained -- change
 * both together; `src/missions/missionTasks.test.ts` reads that file and fails
 * on drift (skipped, with a warning, while the shared/ clone it reads predates
 * survey.py).
 *
 * Surveying a site from the console, with the map growing live. Commands
 * START_SURVEY / STOP_SURVEY (wired, through the generic command route; see
 * src/survey/surveyCommands.ts) and two topics under
 * `roverhub/{site}/{robot}/`:
 *   - `survey/status` (edge -> backend and browser, QoS 1, RETAINED): a
 *     SurveyStatus about once a second while a survey is active and on every
 *     change; an idle device publishes "idle" once at start.
 *   - `survey/map` (edge -> browser, QoS 0, not retained): a SurveyMapFrame
 *     about every 2 s while recording.
 *
 * The live map is in the SURVEY's own frame (FAST-LIO2's start pose,
 * unlevelled), not a site map's: it shows coverage while driving, nothing more.
 */
import type { Point2D } from './maps'

export const SURVEY_STATES = [
  'idle', 'starting', 'recording', 'saving', 'processing', 'uploading',
  'done', 'failed', 'discarded',
] as const
export type SurveyState = typeof SURVEY_STATES[number]

export const CAMERA_SETS = ['off', 'front', 'front+depth'] as const
export type CameraSet = typeof CAMERA_SETS[number]

export const DRIFT_LEVELS = ['good', 'watch', 'bad', 'unknown'] as const
export type DriftLevel = typeof DRIFT_LEVELS[number]

/** Mirrors `MAX_SURVEY_PATH_POINTS`. */
export const MAX_SURVEY_PATH_POINTS = 1000
/** Mirrors `MAX_SURVEY_MAP_PNG_B64`: base64 characters of the map PNG. */
export const MAX_SURVEY_MAP_PNG_B64 = 600_000
/** Mirrors `MAX_SURVEY_MAP_CELLS_PER_SIDE`. */
export const MAX_SURVEY_MAP_CELLS_PER_SIDE = 4000

/** START_SURVEY's params. */
export interface StartSurveyParams {
  /** 1-64 characters; the console makes it (src/survey/surveyModel.ts newSurveyId). */
  survey_id: string
  /** 1-80 characters: the draft map's name. */
  name: string
  /** 0-50. */
  floor_index: number
  /** An existing map to replace (a re-survey); null makes a new map. */
  map_id: string | null
  /** Cameras are an optional add-on, off by default (operator, 2026-11-16). */
  cameras: CameraSet
}

/** STOP_SURVEY's params. Never expires on the backend: a late stop is a stop. */
export interface StopSurveyParams {
  survey_id: string
  /** False discards the recording and makes no map. */
  save: boolean
}

/** FIND_MOVING's params (Console B sends it; mirrored here with its siblings). */
export interface FindMovingParams {
  survey_id: string
  map_id: string
  floor_index: number
  /** 0 = only the clearest cases, 1 = anything with some evidence. */
  sensitivity: number
}

export interface SurveyStatus {
  robot_id: string
  site_id: string
  state: SurveyState
  survey_id?: string | null
  name?: string | null
  started_at?: string | null
  elapsed_s: number
  covered_m2: number
  path_length_m: number
  lidar_hz?: number | null
  odometry_hz?: number | null
  /** How much FAST-LIO2's map disagrees with itself where the robot has been
   * before; "unknown" until it can tell. */
  drift: DriftLevel
  bag_mb?: number | null
  cameras: CameraSet
  /** While saving/processing/uploading: the step in plain words, and 0..1. */
  stage?: string | null
  progress?: number | null
  /** When done: the draft map made, and how many moved spots were found. */
  map_id?: string | null
  moved_spots?: number | null
  /** When failed: why, in plain words. */
  error?: string | null
  updated_at: string
}

export interface SurveyPose {
  x_m: number
  y_m: number
  yaw_rad: number
}

export interface SurveyMapFrame {
  robot_id: string
  site_id: string
  survey_id: string
  seq: number
  captured_at: string
  /** Metres per cell, (0, 1]. */
  resolution_m: number
  /** World position of cell (0, 0)'s outer corner; +x right, +y up, row 0 at
   * the TOP of the image (as an image, not as a ROS OccupancyGrid). */
  origin_x_m: number
  origin_y_m: number
  width: number
  height: number
  /** 8-bit greyscale PNG, base64: 0 = not seen, 128 = seen and open,
   * 255 = something there (wall, furniture, a person). */
  cells_png_b64: string
  pose?: SurveyPose | null
  path: Point2D[]
}
