import type { RobotState } from '@/types'
import type { Point2D } from '@/types/maps'
import type { CameraSet, StartSurveyParams, StopSurveyParams, SurveyMapFrame, SurveyStatus } from '@/types/survey'
import { bytesToBase64, encodeGreyPng } from '@/survey/surveyPng'
import type { SurveyFeed } from '@/survey/surveyFeed'

/**
 * A survey in demo mode: an office floor of about 36 x 24 m that the "robot"
 * walks through in about two minutes, revealed by a simulated lidar as it
 * goes, so the Survey screen has a map that grows with gaps, a path, coverage
 * and a lidar rate. Stop & save runs the post-survey stages and makes a real
 * draft map in the mock's map store, so "Open in the map editor" works.
 *
 * The survey frame is FAST-LIO2's start pose: the robot starts at (0, 0)
 * facing +x, in the corridor.
 */

export const MOCK_SURVEY_RESOLUTION_M = 0.1
/** The grid's top-left corner in the survey frame, and its size in cells. */
export const MOCK_SURVEY_ORIGIN: Point2D = [-3.5, 12.5]
export const MOCK_SURVEY_SIZE: [number, number] = [370, 250]
/** Metres per second along the scripted path. */
const SPEED_MPS = 1.0
const TICK_MS = 500
const STATUS_EVERY_TICKS = 2
const FRAME_EVERY_TICKS = 4
const STARTING_MS = 2500
const LIDAR_RANGE_M = 9
const LIDAR_RAYS = 240

/** The walk: along the corridor, into a room on each side, and back out. */
const PATH: Point2D[] = [
  [0, 0], [3, 0], [3, 5], [1, 8], [4, 9.5], [3, 5], [3, 0],
  [10, 0], [10, -5], [12, -9.5], [8, -9.5], [10, -5], [10, 0],
  [18, 0], [18, 6], [20, 9.5], [16, 9.5], [18, 6], [18, 0],
  [26, 0], [26, -6], [29, -9.5], [26, -6], [26, 0], [31, 0],
]

type Rect = [number, number, number, number] // x0, y0, x1, y1 (metres)

/** Walls 0.2 m thick, doorways 1.2 m wide, desks and a cabinet or two. */
function officeLayout(): { walls: Rect[]; doors: Rect[]; furniture: Rect[] } {
  const walls: Rect[] = [
    [-3, -12, 33, -11.8], [-3, 11.8, 33, 12], [-3, -12, -2.8, 12], [32.8, -12, 33, 12], // outside
    [-3, 1.4, 33, 1.6], [-3, -1.6, 33, -1.4], // the corridor
  ]
  for (const x of [6, 14, 22]) walls.push([x - 0.1, 1.5, x + 0.1, 12], [x - 0.1, -12, x + 0.1, -1.5])
  // Doorways cut through the corridor walls: four rooms are walked into, the
  // others are only glimpsed through their doors.
  const door = (x: number, upper: boolean): Rect => (upper ? [x - 0.6, 1.3, x + 0.6, 1.7] : [x - 0.6, -1.7, x + 0.6, -1.3])
  const doors = [door(3, true), door(10, true), door(18, true), door(27, true), door(1, false), door(10, false), door(18, false), door(26, false)]
  const furniture: Rect[] = [
    [-2.2, 3, 0, 4], [-2.2, 6, 0, 7], [4.5, 10.6, 5.6, 11.6], // room 1
    [12, -5, 13.5, -3], [7, -6, 8.2, -3.5], // room 2
    [20, 3, 21.5, 5], [15, 3, 16, 4.2], // room 3
    [30, -5, 32, -3], [23, -10.5, 24.5, -8], // room 4
    [8, 4, 12, 5], [-2, -9, 2, -8], [15, -8, 20, -7], [24, 5, 31, 6], // rooms glimpsed only
    [12.6, -0.7, 13.2, -0.1], // a pillar in the corridor
  ]
  return { walls, doors, furniture }
}

/** The ground truth: true where something solid stands. */
function truthGrid(): Uint8Array {
  const [w, h] = MOCK_SURVEY_SIZE
  const grid = new Uint8Array(w * h)
  const { walls, doors, furniture } = officeLayout()
  const fill = (r: Rect, v: number) => {
    const [c0, r0] = cellOf(r[0], r[3]), [c1, r1] = cellOf(r[2], r[1])
    for (let y = Math.max(0, Math.floor(r0)); y <= Math.min(h - 1, Math.floor(r1)); y++) {
      for (let x = Math.max(0, Math.floor(c0)); x <= Math.min(w - 1, Math.floor(c1)); x++) grid[y * w + x] = v
    }
  }
  for (const r of walls) fill(r, 1)
  for (const r of furniture) fill(r, 1)
  for (const r of doors) fill(r, 0)
  return grid
}

function cellOf(x: number, y: number): [number, number] {
  return [(x - MOCK_SURVEY_ORIGIN[0]) / MOCK_SURVEY_RESOLUTION_M, (MOCK_SURVEY_ORIGIN[1] - y) / MOCK_SURVEY_RESOLUTION_M]
}

function pathLength(path: Point2D[]): number {
  let total = 0
  for (let i = 1; i < path.length; i++) total += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1])
  return total
}

/** The pose `d` metres along the scripted path, facing along it. */
export function poseAlong(d: number): { x: number; y: number; yaw: number; done: boolean } {
  let left = Math.max(0, d)
  for (let i = 1; i < PATH.length; i++) {
    const [ax, ay] = PATH[i - 1], [bx, by] = PATH[i]
    const len = Math.hypot(bx - ax, by - ay)
    const yaw = Math.atan2(by - ay, bx - ax)
    if (left <= len) return { x: ax + ((bx - ax) * left) / len, y: ay + ((by - ay) * left) / len, yaw, done: false }
    left -= len
  }
  const [px, py] = PATH[PATH.length - 2], [lx, ly] = PATH[PATH.length - 1]
  return { x: lx, y: ly, yaw: Math.atan2(ly - py, lx - px), done: true }
}

/** Seconds the scripted walk takes. */
export const MOCK_SURVEY_WALK_S = pathLength(PATH) / SPEED_MPS

interface Running {
  robotId: string
  siteId: string
  params: StartSurveyParams
  startedAt: number
  /** 0 unseen, 128 open, 255 occupied: what the simulated lidar has seen. */
  seen: Uint8Array
  path: Point2D[]
  walked: number
  ticks: number
  seq: number
  stopped: boolean
  timers: Set<ReturnType<typeof setTimeout>>
  interval: ReturnType<typeof setInterval> | null
}

export interface MockSurveyHooks {
  /** Makes the draft map the post-survey pipeline would upload; resolves to its id. */
  createDraft: (req: { siteId: string; name: string; mapId: string | null; floor: number }) => Promise<string>
  /** Mock post-survey stage lengths (ms); tests shorten them. */
  stageMs?: { saving: number; processing: number }
}

/** The refusal code the mock bridge uses while a survey holds the lidar. */
export const MOCK_SURVEY_REFUSAL = 'REJECTED_SURVEY_ACTIVE'

export class MockSurveySim {
  private truth: Uint8Array | null = null
  private runs = new Map<string, Running>()
  /** robot_id -> the last status sent, for refusals once a survey ended. */
  private latest = new Map<string, SurveyStatus>()

  constructor(private readonly feed: SurveyFeed, private readonly hooks: MockSurveyHooks) {}

  /** What the mock bridge says to `type` now, or null to go ahead. */
  refusal(robot: RobotState | undefined, type: string, params: Record<string, unknown> | undefined, operatorId: string): string | null {
    if (!robot) return null
    const run = this.runs.get(robot.robot_id)
    const holdsLidar = run && !run.stopped
    if (type === 'START_SURVEY') {
      if (holdsLidar || this.isFinishing(robot.robot_id)) return 'REJECTED_SURVEY_BUSY: a survey is already running or being saved on this robot'
      if (robot.abstract_state === 'E_STOP') return 'REJECTED_ESTOP'
      if (robot.control_owner && robot.control_owner !== operatorId) return `REJECTED_CONTROL_HELD: control is held by ${robot.control_owner}`
      if (typeof params?.survey_id !== 'string' || typeof params?.name !== 'string') return 'REJECTED_INVALID_PARAMS: survey_id and name are required'
      return null
    }
    if (type === 'STOP_SURVEY') {
      if (!run || run.stopped || run.params.survey_id !== params?.survey_id) return 'REJECTED_INVALID_PARAMS: no such survey is recording'
      return null
    }
    if (holdsLidar && (type === 'NAV_GOTO' || type === 'START_MISSION' || type === 'RESET_POSITION')) {
      return `${MOCK_SURVEY_REFUSAL}: the robot is surveying; stop the survey first`
    }
    return null
  }

  /** The bridge accepted `type`: act on it. */
  accept(robot: RobotState, type: string, params: Record<string, unknown> | undefined): void {
    if (type === 'START_SURVEY') this.start(robot, params as unknown as StartSurveyParams)
    else if (type === 'STOP_SURVEY') this.stop(robot.robot_id, params as unknown as StopSurveyParams)
  }

  private isFinishing(robotId: string): boolean {
    const s = this.latest.get(robotId)?.state
    return s === 'saving' || s === 'processing' || s === 'uploading'
  }

  private start(robot: RobotState, params: StartSurveyParams): void {
    this.truth ??= truthGrid()
    const [w, h] = MOCK_SURVEY_SIZE
    const run: Running = {
      robotId: robot.robot_id, siteId: robot.site_id, params: { ...params, cameras: params.cameras ?? 'off' },
      startedAt: Date.now(), seen: new Uint8Array(w * h), path: [[0, 0]], walked: 0, ticks: 0, seq: 0,
      stopped: false, timers: new Set(), interval: null,
    }
    this.runs.set(robot.robot_id, run)
    this.status(run, 'starting')
    this.later(run, STARTING_MS, () => {
      if (run.stopped) return
      this.reveal(run)
      this.status(run, 'recording')
      this.frame(run)
      run.interval = setInterval(() => this.tick(run), TICK_MS)
    })
  }

  private tick(run: Running): void {
    run.ticks++
    const pose = poseAlong(run.walked)
    if (!pose.done) {
      run.walked += (SPEED_MPS * TICK_MS) / 1000
      const next = poseAlong(run.walked)
      run.path.push([round2(next.x), round2(next.y)])
      if (run.path.length > 1000) run.path.splice(0, run.path.length - 1000)
    }
    this.reveal(run)
    if (run.ticks % STATUS_EVERY_TICKS === 0) this.status(run, 'recording')
    if (run.ticks % FRAME_EVERY_TICKS === 0) this.frame(run)
  }

  /** Cast the simulated lidar's rays from where the robot is now. */
  private reveal(run: Running): void {
    const truth = this.truth!
    const [w, h] = MOCK_SURVEY_SIZE
    const { x, y } = poseAlong(run.walked)
    const step = MOCK_SURVEY_RESOLUTION_M / 2
    for (let i = 0; i < LIDAR_RAYS; i++) {
      const a = (i / LIDAR_RAYS) * Math.PI * 2
      const dx = Math.cos(a), dy = Math.sin(a)
      for (let r = 0; r <= LIDAR_RANGE_M; r += step) {
        const [cx, cy] = cellOf(x + dx * r, y + dy * r)
        const c = Math.floor(cx), rr = Math.floor(cy)
        if (c < 0 || rr < 0 || c >= w || rr >= h) break
        const k = rr * w + c
        if (truth[k]) { run.seen[k] = 255; break }
        if (run.seen[k] !== 255) run.seen[k] = 128
      }
    }
  }

  private coveredM2(run: Running): number {
    let open = 0
    for (let i = 0; i < run.seen.length; i++) if (run.seen[i] === 128) open++
    return open * MOCK_SURVEY_RESOLUTION_M * MOCK_SURVEY_RESOLUTION_M
  }

  private frame(run: Running): void {
    const [w, h] = MOCK_SURVEY_SIZE
    const pose = poseAlong(run.walked)
    const frame: SurveyMapFrame = {
      robot_id: run.robotId, site_id: run.siteId, survey_id: run.params.survey_id, seq: run.seq++,
      captured_at: new Date().toISOString(), resolution_m: MOCK_SURVEY_RESOLUTION_M,
      origin_x_m: MOCK_SURVEY_ORIGIN[0], origin_y_m: MOCK_SURVEY_ORIGIN[1], width: w, height: h,
      cells_png_b64: bytesToBase64(encodeGreyPng(w, h, run.seen)),
      pose: { x_m: round2(pose.x), y_m: round2(pose.y), yaw_rad: Math.round(pose.yaw * 1000) / 1000 },
      path: run.path.slice(),
    }
    this.feed.pushFrame(frame)
  }

  private status(run: Running, state: SurveyStatus['state'], extra: Partial<SurveyStatus> = {}): void {
    const elapsed = (Date.now() - run.startedAt) / 1000
    const recording = state === 'recording'
    const cameras: CameraSet = run.params.cameras
    const status: SurveyStatus = {
      robot_id: run.robotId, site_id: run.siteId, state, survey_id: run.params.survey_id, name: run.params.name,
      started_at: new Date(run.startedAt).toISOString(), elapsed_s: Math.round(elapsed * 10) / 10,
      covered_m2: Math.round(this.coveredM2(run) * 10) / 10,
      path_length_m: Math.round(Math.min(run.walked, pathLength(PATH)) * 10) / 10,
      lidar_hz: recording ? 10 - (run.ticks % 7 === 3 ? 0.4 : 0) : null,
      odometry_hz: recording ? 10 : null,
      drift: !recording ? 'unknown' : elapsed < 15 ? 'unknown' : 'good',
      bag_mb: Math.round(elapsed * (cameras === 'off' ? 2.4 : cameras === 'front' ? 6.1 : 11.8) * 10) / 10,
      cameras, stage: null, progress: null, map_id: null, moved_spots: null, error: null,
      updated_at: new Date().toISOString(),
      ...extra,
    }
    this.latest.set(run.robotId, status)
    this.feed.pushStatus(status)
  }

  private stop(robotId: string, params: StopSurveyParams): void {
    const run = this.runs.get(robotId)
    if (!run || run.stopped) return
    run.stopped = true
    if (run.interval) clearInterval(run.interval)
    run.interval = null
    if (!params.save) {
      this.status(run, 'discarded')
      return
    }
    const ms = this.hooks.stageMs ?? { saving: 3000, processing: 6000 }
    this.status(run, 'saving', { stage: 'Saving the map', progress: 0 })
    this.later(run, ms.saving / 2, () => this.status(run, 'saving', { stage: 'Saving the map', progress: 0.5 }))
    this.later(run, ms.saving, () => this.status(run, 'processing', { stage: 'Finding moving things', progress: 0.1 }))
    this.later(run, ms.saving + ms.processing / 2, () => this.status(run, 'processing', { stage: 'Building the planning grid', progress: 0.6 }))
    this.later(run, ms.saving + ms.processing, () => {
      this.status(run, 'uploading', { stage: 'Uploading the draft map', progress: 0.2 })
      const { siteId, params: p } = run
      this.hooks.createDraft({ siteId, name: p.name, mapId: p.map_id, floor: p.floor_index }).then(
        (mapId) => this.status(run, 'done', { stage: null, progress: 1, map_id: mapId, moved_spots: 6 }),
        (e: unknown) => this.status(run, 'failed', { stage: null, progress: null, error: `The upload failed: ${e instanceof Error ? e.message : String(e)}` }),
      )
    })
  }

  private later(run: Running, ms: number, fn: () => void): void {
    const timer = setTimeout(() => { run.timers.delete(timer); fn() }, ms)
    run.timers.add(timer)
  }

  dispose(): void {
    for (const run of this.runs.values()) {
      if (run.interval) clearInterval(run.interval)
      for (const t of run.timers) clearTimeout(t)
    }
    this.runs.clear()
    this.latest.clear()
  }
}

const round2 = (v: number) => Math.round(v * 100) / 100
