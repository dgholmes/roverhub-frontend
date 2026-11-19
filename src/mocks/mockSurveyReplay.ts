import {
  SEGMENT_S, type PathSample, type ReplayTake, type SegmentVerdict, type SurveyDetail, type SurveyQuery, type SurveyRecord,
  type SurveySummary, type TakePaths, type TakeSegment,
} from '@/types/surveyReplay'

/**
 * Sample survey replays for Data › Surveys on mock data. Marked `sample` by the
 * provider; nothing here came from a robot. Deterministic: every path is a
 * closed-form function of time, so two calls (and two test runs) agree.
 *
 * - SAMPLE_SURVEY, 1,355 s: the live "original" take matches the legs, wobbles
 *   in heading from 540 s (the "degraded from minute 9" of the 11-18 survey),
 *   and runs away from 980 s, ending hundreds of metres off and far below the
 *   floor. A manual "A · stock 0.8×" take over 925-1215 s and a manual
 *   "E · stock 1×" take over 0-1200 s, neither with a runaway. A fourth take,
 *   over 925-1165 s, whose paths.json is there but whose segments.json was
 *   never uploaded.
 *
 * One time axis per survey (ruling R8): every take's path `t`, segment
 * start_s/end_s and first_bad_s are seconds since the ORIGINAL take's first
 * pose, so a take over a window starts at its window_start_s, and its 20 s
 * segments run from there.
 * - A second, older survey whose recording had no /foot_odom/data: no legs,
 *   every segment `no_data`, and its bag already gone from the device.
 *
 * Segments are judged from the paths with the design's thresholds (ratio,
 * heading, z range, largest step, standing), so they agree with what is drawn.
 */

/** The mock's sample site (see mockRobots / mockRuns). */
export const SAMPLE_SITE = 'site-north-yard'
/** The 1,355 s survey with the runaway. */
export const SAMPLE_SURVEY = 'sample-survey-20261118-ground-floor'
const NO_LEGS_SURVEY = 'sample-survey-20261111-gatehouse'

const HZ = 10
const RUNAWAY_S = 980
const WOBBLE_FROM_S = 540
const LIVE_S = 1355

// --- The legs: a figure-of-eight walk at 0.2-0.4 m/s, after 20 s standing ---

const STAND_S = 20
const OMEGA = (2 * Math.PI) / 250

function legsAt(t: number): PathSample {
  const u = Math.max(0, t - STAND_S)
  const th = OMEGA * u
  const yaw = Math.atan2(12 * Math.cos(2 * th), 12 * Math.cos(th))
  return [t, 12 * Math.sin(th), 6 * Math.sin(2 * th), 0, yaw]
}

/** FAST-LIO2's small, slow disagreement with the legs while all is well. */
function settled(t: number): [number, number, number] {
  return [0.15 * Math.sin(t / 90), 0.15 * Math.cos(t / 70) - 0.15, 0.02 * Math.sin(t / 7)]
}

type TakeShape = (legs: PathSample, recordingT: number) => [number, number, number, number]

const steady: TakeShape = ([, x, y, , yaw], rt) => {
  const [ex, ey, ez] = settled(rt)
  return [x + ex, y + ey, ez, yaw]
}

/** The live take: steady, then a heading wobble from 540 s, then the runaway. */
const live: TakeShape = (legs, rt) => {
  const [x, y, z, yaw] = steady(legs, rt)
  const wobble = rt >= WOBBLE_FROM_S ? 0.08 * Math.sin((2 * Math.PI * (rt - WOBBLE_FROM_S)) / 60) : 0
  if (rt <= RUNAWAY_S) return [x, y, z, yaw + wobble]
  const k = rt - RUNAWAY_S
  const d = 0.004 * k * k
  return [x + d * Math.cos(0.6), y + d * Math.sin(0.6), z - 0.01 * k * k, yaw + wobble + 0.002 * k * k]
}

function buildPaths(takeId: string, windowStart: number, duration: number, shape: TakeShape, withLegs: boolean): TakePaths {
  const take: PathSample[] = []
  const legs: PathSample[] = []
  const n = Math.round(duration * HZ)
  for (let i = 0; i <= n; i++) {
    // One time axis per survey (ruling R8): t is seconds since the ORIGINAL
    // take's first pose, so a take over a window starts at window_start_s.
    const t = windowStart + i / HZ
    const l = legsAt(t)
    const [x, y, z, yaw] = shape(l, t)
    take.push([t, x, y, z, yaw])
    if (withLegs) legs.push([t, l[1], l[2], l[3], l[4]])
  }
  return { take_id: takeId, take, legs }
}

// --- Judging, with the design's thresholds ---------------------------------

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const DEG = 180 / Math.PI
const RANK: Record<SegmentVerdict, number> = { no_data: 0, standing: 0, good: 1, watch: 2, bad: 3 }
const worst = (...vs: SegmentVerdict[]) => vs.reduce((a, b) => (RANK[b] > RANK[a] ? b : a))

function length2d(rows: PathSample[]): number {
  let m = 0
  for (let i = 1; i < rows.length; i++) m += Math.hypot(rows[i][1] - rows[i - 1][1], rows[i][2] - rows[i - 1][2])
  return m
}

/** Lateness per segment, for a take whose FAST-LIO2 ran live (by recording time). */
type Lateness = (startRt: number) => { p50: number; p95: number } | null

function judge(paths: TakePaths, duration: number, windowStart: number, lateness: Lateness): TakeSegment[] {
  const out: TakeSegment[] = []
  const count = Math.ceil(duration / SEGMENT_S)
  for (let k = 0; k < count; k++) {
    // The 20 s grid runs from the take's own first pose, on the survey's axis.
    const from = k * SEGMENT_S
    const to = Math.min((k + 1) * SEGMENT_S, duration)
    const start = windowStart + from
    const end = windowStart + to
    const take = paths.take.slice(Math.round(from * HZ), Math.round(to * HZ) + 1)
    const legs = paths.legs.slice(Math.round(from * HZ), Math.round(to * HZ) + 1)
    const take_m = length2d(take)
    const zs = take.map((r) => r[3])
    const z_range_m = Math.max(...zs) - Math.min(...zs)
    let max_step_m = 0
    for (let i = 1; i < take.length; i++) {
      max_step_m = Math.max(max_step_m, Math.hypot(take[i][1] - take[i - 1][1], take[i][2] - take[i - 1][2], take[i][3] - take[i - 1][3]))
    }
    const late = lateness(start)
    const base = {
      start_s: start, end_s: end, take_m, z_range_m, max_step_m,
      late_p50_s: late?.p50 ?? null, late_p95_s: late?.p95 ?? null, late: !!late && late.p95 > 0.2,
    }
    if (legs.length < 2) {
      out.push({ ...base, legs_m: 0, ratio: null, heading_diff_deg: null, verdict: 'no_data' })
      continue
    }
    const legs_m = length2d(legs)
    if (legs_m < 0.3) {
      out.push({ ...base, legs_m, ratio: null, heading_diff_deg: null, verdict: 'standing' })
      continue
    }
    const ratio = take_m / legs_m
    const dTake = take[take.length - 1][4] - take[0][4]
    const dLegs = legs[legs.length - 1][4] - legs[0][4]
    const heading_diff_deg = wrap(dTake - dLegs) * DEG
    const byRatio: SegmentVerdict = ratio >= 0.8 && ratio <= 1.25 ? 'good' : (ratio >= 0.6 && ratio <= 2.0) ? 'watch' : 'bad'
    const absH = Math.abs(heading_diff_deg)
    const byHeading: SegmentVerdict = absH <= 5 ? 'good' : absH <= 15 ? 'watch' : 'bad'
    const byShape: SegmentVerdict = z_range_m > 0.5 || max_step_m > 1.0 ? 'bad' : 'good'
    out.push({ ...base, legs_m, ratio, heading_diff_deg, verdict: worst(byRatio, byHeading, byShape) })
  }
  return out
}

// --- The samples -----------------------------------------------------------

interface SampleTake { take: ReplayTake; paths: () => TakePaths; segments: (() => TakeSegment[]) | null }
interface SampleSurvey { record: SurveyRecord; takes: SampleTake[] }

/** Builds once, on first use: the live take alone is 13,551 poses. */
function lazy<T>(make: () => T): () => T {
  let value: T | undefined
  return () => (value ??= make())
}

/** The live take fell behind as the survey went on (the 11-18 survey's load). */
const liveLateness: Lateness = (rt) => (rt < WOBBLE_FROM_S ? { p50: 0.03, p95: 0.06 } : rt < 900 ? { p50: 0.06, p95: 0.14 } : { p50: 0.12, p95: 0.34 })
/** A replay on a quiet device keeps up throughout. */
const quietLateness: Lateness = () => ({ p50: 0.02, p95: 0.05 })

function makeTake(
  meta: Omit<ReplayTake, 'poses' | 'first_bad_s' | 'late_segments' | 'take_m' | 'legs_m' | 'has_legs'>,
  duration: number, shape: TakeShape, withLegs: boolean, lateness: Lateness, segmentsUploaded: boolean,
): SampleTake {
  const paths = lazy(() => buildPaths(meta.take_id, meta.window_start_s, duration, shape, withLegs))
  const segments = lazy(() => judge(paths(), duration, meta.window_start_s, lateness))
  const take = lazy((): ReplayTake => {
    const p = paths()
    // The backend reads these from take.json, written with the segments; a take
    // whose segments never arrived still has its take.json.
    const segs = segments()
    return {
      ...meta,
      poses: p.take.length,
      first_bad_s: withLegs ? segs.find((s) => s.verdict === 'bad')?.start_s ?? null : null,
      late_segments: segs.filter((s) => s.late).length,
      take_m: length2d(p.take),
      legs_m: length2d(p.legs),
      has_legs: withLegs,
    }
  })
  return {
    get take() { return take() },
    paths,
    segments: segmentsUploaded ? segments : null,
  }
}

const groundFloor: SurveyRecord = {
  survey_id: SAMPLE_SURVEY, name: 'North Yard, ground floor', site_id: SAMPLE_SITE, robot_id: 'zaezae-x1-001',
  started_at: '2026-11-18T05:12:00+00:00', stopped_at: '2026-11-18T05:34:35+00:00', duration_s: LIVE_S,
  floor_index: 0, map_id: null, cameras: 'off', recording_kept: true,
}

const gatehouse: SurveyRecord = {
  survey_id: NO_LEGS_SURVEY, name: 'Gatehouse loop', site_id: SAMPLE_SITE, robot_id: 'zaezae-x1-002',
  started_at: '2026-11-11T02:30:00+00:00', stopped_at: '2026-11-11T02:36:52+00:00', duration_s: 412,
  floor_index: 0, map_id: null, cameras: 'off', recording_kept: false,
}

const SAMPLES: SampleSurvey[] = [
  {
    record: groundFloor,
    takes: [
      makeTake({
        take_id: 'original', survey_id: SAMPLE_SURVEY, source: 'live', label: 'Live', preset: 'stock',
        window_start_s: 0, window_duration_s: null, rate: null, status: 'done', progress: null, error: null,
        scans_in_window: 13554, kept_up: true, fit: 'legs', fit_residual_m: 0.03,
        created_at: '2026-11-18T05:41:10+00:00', warnings: [],
      }, LIVE_S, live, true, liveLateness, true),
      // Like the 11-19 hand-run replay A: a window past the live take's
      // degradation, played slower, which kept up and found no runaway.
      makeTake({
        take_id: 'manual-a', survey_id: SAMPLE_SURVEY, source: 'manual', label: 'A · stock 0.8×', preset: 'stock',
        window_start_s: 925, window_duration_s: 290, rate: 0.8, status: 'done', progress: null, error: null,
        scans_in_window: 2900, kept_up: true, fit: 'original', fit_residual_m: 0.04,
        created_at: '2026-11-19T04:40:00+00:00', warnings: [],
      }, 290, steady, true, quietLateness, true),
      makeTake({
        take_id: 'manual-e', survey_id: SAMPLE_SURVEY, source: 'manual', label: 'E · stock 1×', preset: 'stock',
        window_start_s: 0, window_duration_s: 1200, rate: 1, status: 'done', progress: null, error: null,
        scans_in_window: 12000, kept_up: true, fit: 'original', fit_residual_m: 0.04,
        created_at: '2026-11-19T05:02:00+00:00', warnings: [],
      }, 1200, steady, true, quietLateness, true),
      makeTake({
        take_id: 'manual-d', survey_id: SAMPLE_SURVEY, source: 'manual', label: 'D · stock 1× under load (incomplete)',
        preset: 'stock', window_start_s: 925, window_duration_s: 240, rate: 1, status: 'done', progress: null, error: null,
        scans_in_window: 2400, kept_up: null, fit: 'original', fit_residual_m: 0.05,
        created_at: '2026-11-19T05:04:00+00:00', warnings: [],
      }, 240, steady, true, quietLateness, false),
    ],
  },
  {
    record: gatehouse,
    takes: [
      makeTake({
        take_id: 'original', survey_id: NO_LEGS_SURVEY, source: 'live', label: 'Live', preset: 'stock',
        window_start_s: 0, window_duration_s: null, rate: null, status: 'done', progress: null, error: null,
        scans_in_window: 4121, kept_up: true, fit: 'none', fit_residual_m: null,
        created_at: '2026-11-11T02:40:00+00:00', warnings: ['the recording has no /foot_odom/data: no leg odometry to compare with'],
      }, 412, steady, false, () => null, true),
    ],
  },
]

function summarise(s: SampleSurvey): SurveySummary {
  const original = s.takes.find((t) => t.take.take_id === 'original')?.take
  return {
    ...s.record,
    take_count: s.takes.length,
    first_bad_s: original?.first_bad_s ?? null,
    has_legs: original?.has_legs ?? false,
    legs_m: original?.legs_m ?? null,
  }
}

/** GET /surveys on sample data: newest first, filtered like the backend. */
export function sampleSurveyList(q: SurveyQuery): SurveySummary[] {
  return SAMPLES
    .filter((s) => !q.site_id || s.record.site_id === q.site_id)
    .filter((s) => !q.robot_id || s.record.robot_id === q.robot_id)
    .map(summarise)
    .sort((a, b) => b.started_at.localeCompare(a.started_at))
}

/** GET /surveys/{id}; undefined where the backend answers 404. */
export function sampleSurveyDetail(surveyId: string): SurveyDetail | undefined {
  const s = SAMPLES.find((x) => x.record.survey_id === surveyId)
  return s && { record: s.record, takes: s.takes.map((t) => t.take) }
}

function sampleTake(surveyId: string, takeId: string): SampleTake | undefined {
  return SAMPLES.find((x) => x.record.survey_id === surveyId)?.takes.find((t) => t.take.take_id === takeId)
}

/** A take's paths.json; null where the backend answers 404. */
export function sampleTakePaths(surveyId: string, takeId: string): TakePaths | null {
  return sampleTake(surveyId, takeId)?.paths() ?? null
}

/** A take's segments.json; null where the backend answers 404 (never uploaded). */
export function sampleTakeSegments(surveyId: string, takeId: string): TakeSegment[] | null {
  return sampleTake(surveyId, takeId)?.segments?.() ?? null
}
