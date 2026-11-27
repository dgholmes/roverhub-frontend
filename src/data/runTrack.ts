import type { MissionWaypoint, RunTrack, TraceColumn, TraceLeg, TracePlan } from '@/types'

/**
 * The run page's view of GET /runs/{id}/track (the mission run log): pure
 * helpers over the samples, so the figure, the timeline lanes and the legs
 * table read one parsed model and the cursor `t` (seconds since the run
 * started) picks a moment in it. A null cell means "not known then" -- an
 * AMCL pose missing for a while is a gap in the walked line, never a jump to 0,0.
 */

export interface Pose { x: number; y: number; yaw: number }
export type XY = [number, number]

export interface TrackModel {
  /** Sample times, ascending. */
  t: number[]
  x: (number | null)[]
  y: (number | null)[]
  yaw: (number | null)[]
  ask_vx: (number | null)[]
  sent_vx: (number | null)[]
  meas_vx: (number | null)[]
  meas_wz: (number | null)[]
  controller: (string | null)[]
  fwd_dropped: (number | null)[]
  /** Largest gap between two samples that is still interpolated across. */
  maxGapS: number
}

function numeric(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

function text(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v)
  return s === '' ? null : s
}

/** Parse a track's columns; a column the source did not carry is all null. */
export function trackModel(track: Pick<RunTrack, 'columns'>): TrackModel {
  const raw = track.columns.t ?? []
  const n = raw.length
  const num = (name: TraceColumn) => {
    const col = track.columns[name]
    return Array.from({ length: n }, (_, i) => numeric(col?.[i]))
  }
  const t = raw.map((v) => numeric(v) ?? NaN)
  const ctrl = track.columns.controller
  // The usual spacing, so a 5 Hz trace and 5 s history samples both
  // interpolate between neighbours but not across a real outage.
  const dts: number[] = []
  for (let i = 1; i < n; i++) if (t[i] > t[i - 1]) dts.push(t[i] - t[i - 1])
  dts.sort((a, b) => a - b)
  const median = dts.length ? dts[Math.floor(dts.length / 2)] : 1
  return {
    t, x: num('x'), y: num('y'), yaw: num('yaw'),
    ask_vx: num('ask_vx'), sent_vx: num('sent_vx'), meas_vx: num('meas_vx'), meas_wz: num('meas_wz'),
    controller: Array.from({ length: n }, (_, i) => text(ctrl?.[i])),
    fwd_dropped: num('fwd_dropped'),
    maxGapS: Math.max(1, median * 3),
  }
}

/** Index of the last sample at or before `t`, or -1. */
export function sampleIndexAt(times: readonly number[], t: number): number {
  let lo = 0
  let hi = times.length - 1
  let best = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (times[mid] <= t) { best = mid; lo = mid + 1 } else hi = mid - 1
  }
  return best
}

function poseAt(m: TrackModel, i: number): Pose | null {
  const x = m.x[i]
  const y = m.y[i]
  return x === null || y === null ? null : { x, y, yaw: m.yaw[i] ?? 0 }
}

function lerpAngle(a: number, b: number, f: number): number {
  let d = b - a
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return a + d * f
}

/**
 * Where the robot was at `t`: interpolated between the samples around it,
 * held from the last known one up to the next sample, and null before the
 * first pose, inside a gap, or across a gap longer than the trace's spacing.
 */
export function positionAt(m: TrackModel, t: number): Pose | null {
  const i = sampleIndexAt(m.t, t)
  if (i < 0) return null
  const a = poseAt(m, i)
  if (!a) return null
  const j = i + 1
  if (j >= m.t.length) return t - m.t[i] <= m.maxGapS ? a : null
  const span = m.t[j] - m.t[i]
  if (span > m.maxGapS) return t - m.t[i] <= m.maxGapS ? a : null
  const b = poseAt(m, j)
  if (!b || span <= 0) return a
  const f = (t - m.t[i]) / span
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, yaw: lerpAngle(a.yaw, b.yaw, f) }
}

/** The walked line as runs of known poses; a null cell or a long gap splits it. */
export function walkedRuns(m: TrackModel, upTo = Infinity): XY[][] {
  const runs: XY[][] = []
  let cur: XY[] = []
  let lastT = -Infinity
  for (let i = 0; i < m.t.length && m.t[i] <= upTo; i++) {
    const p = poseAt(m, i)
    if (!p || m.t[i] - lastT > m.maxGapS) {
      if (cur.length) runs.push(cur)
      cur = []
    }
    if (p) { cur.push([p.x, p.y]); lastT = m.t[i] }
  }
  if (cur.length) runs.push(cur)
  return runs
}

/** The walked line up to the cursor, ending exactly where the robot is at `t`. */
export function walkedUpTo(m: TrackModel, t: number): XY[][] {
  const runs = walkedRuns(m, t)
  const here = positionAt(m, t)
  if (here && runs.length) {
    const last = runs[runs.length - 1]
    const end = last[last.length - 1]
    if (end[0] !== here.x || end[1] !== here.y) last.push([here.x, here.y])
  }
  return runs
}

/** The plan Nav2 was following at `t`: the last one made at or before it, or -1. */
export function planIndexAt(plans: readonly Pick<TracePlan, 't'>[], t: number): number {
  return sampleIndexAt(plans.map((p) => p.t), t)
}

/** The leg (nav goal) under the cursor, or -1 between legs. */
export function legIndexAt(legs: readonly Pick<TraceLeg, 't_start' | 't_end'>[], t: number): number {
  return legs.findIndex((l) => l.t_start <= t && t <= l.t_end)
}

export interface ControllerSegment { t0: number; t1: number; name: string }

/** Bars for the Controller lane: one per run of the same controller, each
 * ending where the next sample says something else (or the samples end). */
export function controllerSegments(m: TrackModel): ControllerSegment[] {
  const out: ControllerSegment[] = []
  let open: ControllerSegment | null = null
  for (let i = 0; i < m.t.length; i++) {
    const name = m.controller[i]
    if (open && open.name !== name) { open.t1 = m.t[i]; out.push(open); open = null }
    if (name && !open) open = { t0: m.t[i], t1: m.t[i], name }
  }
  if (open) { open.t1 = m.t[m.t.length - 1]; out.push(open) }
  return out
}

/** One speed line as runs of [t, v]; a blank cell breaks the line. */
export type Series = XY[][]

function series(times: readonly number[], values: readonly (number | null)[]): Series {
  const runs: Series = []
  let cur: XY[] = []
  values.forEach((v, i) => {
    if (v === null) { if (cur.length) runs.push(cur); cur = [] } else cur.push([times[i], v])
  })
  if (cur.length) runs.push(cur)
  return runs
}

export interface SpeedSeries {
  ask: Series
  sent: Series
  meas: Series
  wz: Series
  /** Times of rows where forward asks were dropped as too slow to walk. */
  dropped: number[]
  /** The largest |vx| across the three lines, at least 0.1 m/s, for the lane's scale. */
  maxV: number
  maxW: number
}

export function speedSeries(m: TrackModel): SpeedSeries {
  const absMax = (vals: (number | null)[][], floor: number) => {
    let mx = floor
    for (const col of vals) for (const v of col) if (v !== null && Math.abs(v) > mx) mx = Math.abs(v)
    return mx
  }
  return {
    ask: series(m.t, m.ask_vx),
    sent: series(m.t, m.sent_vx),
    meas: series(m.t, m.meas_vx),
    wz: series(m.t, m.meas_wz),
    dropped: m.t.filter((_, i) => (m.fwd_dropped[i] ?? 0) > 0),
    maxV: absMax([m.ask_vx, m.sent_vx, m.meas_vx], 0.1),
    maxW: absMax([m.meas_wz], 0.2),
  }
}

/** The run video's position for cursor `t` (video time = t - offset_s), or
 * null before the video's first frame. */
export function videoTimeAt(t: number, offsetS: number): number | null {
  const v = t - offsetS
  return v < 0 ? null : v
}

/** The cursor for a video position: the inverse of videoTimeAt. */
export function trackTimeFromVideo(videoS: number, offsetS: number): number {
  return videoS + offsetS
}

/** The track's span: the run's duration, or the last sample if it runs longer. */
export function trackDurationS(track: Pick<RunTrack, 'duration_s'>, m: TrackModel): number {
  const last = m.t.length ? m.t[m.t.length - 1] : 0
  return Math.max(track.duration_s || 0, Number.isFinite(last) ? last : 0)
}

/** The first known pose: where the route as drawn starts. */
export function firstPose(m: TrackModel): Pose | null {
  for (let i = 0; i < m.t.length; i++) {
    const p = poseAt(m, i)
    if (p) return p
  }
  return null
}

/** What the figure frames: the route, every plan and the walk, plus a metre
 * (as the backend's figure crops). Leaflet CRS.Simple [[y, x], [y, x]]; null
 * when there is nothing to frame. */
export function figureBounds(
  m: TrackModel, plans: readonly TracePlan[], waypoints: readonly Pick<MissionWaypoint, 'x_m' | 'y_m'>[], marginM = 1,
): [[number, number], [number, number]] | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity
  const add = (x: number, y: number) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y) }
  for (let i = 0; i < m.t.length; i++) { const p = poseAt(m, i); if (p) add(p.x, p.y) }
  for (const p of plans) for (const [x, y] of p.points) add(x, y)
  for (const w of waypoints) add(w.x_m, w.y_m)
  if (!Number.isFinite(x0)) return null
  return [[y0 - marginM, x0 - marginM], [y1 + marginM, x1 + marginM]]
}

/** Seconds into the run as m:ss, or h:mm:ss past an hour. */
export function formatRunClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}
