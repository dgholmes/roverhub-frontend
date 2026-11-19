import { color } from '@/design-system/tokens'
import type { PathSample, SegmentVerdict, TakePaths, TakeSegment } from '@/types/surveyReplay'

/**
 * Pure helpers for the survey replay page: paths as typed arrays the scene can
 * draw, how many samples have happened by a time, where to frame the view, and
 * the clock. Time is the survey's one axis (seconds since the original take's
 * first pose), so every take and the legs share it.
 */

/** One path as the scene draws it: times (ascending) and x, y, z per sample. */
export interface PathBuffer {
  t: Float64Array
  xyz: Float32Array
}

export interface ViewBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

function buffer(rows: PathSample[]): PathBuffer {
  // A sample with a non-finite value would put NaN into the line's geometry
  // (and its bounding sphere), so it is dropped rather than drawn.
  const ok = rows.filter((r) => Number.isFinite(r[0]) && Number.isFinite(r[1]) && Number.isFinite(r[2]) && Number.isFinite(r[3]))
  const t = new Float64Array(ok.length)
  const xyz = new Float32Array(ok.length * 3)
  ok.forEach((r, i) => {
    t[i] = r[0]
    xyz[i * 3] = r[1]
    xyz[i * 3 + 1] = r[2]
    xyz[i * 3 + 2] = r[3]
  })
  return { t, xyz }
}

/** A paths.json as typed arrays: the take's path and the legs fitted to it. */
export function toBuffers(paths: TakePaths): { take: PathBuffer; legs: PathBuffer } {
  return { take: buffer(paths.take), legs: buffer(paths.legs) }
}

/** How many samples of `t` (ascending) are at or before `time`. */
export function countUpTo(t: Float64Array, time: number): number {
  let lo = 0
  let hi = t.length
  while (lo < hi) {
    const mid = (lo + hi) >>> 1
    if (t[mid] <= time) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** Finite x and y values of a buffer. */
function finiteXY(b: PathBuffer | null | undefined): { xs: number[]; ys: number[] } {
  const xs: number[] = []
  const ys: number[] = []
  if (!b) return { xs, ys }
  for (let i = 0; i + 1 < b.xyz.length; i += 3) {
    const x = b.xyz[i]
    const y = b.xyz[i + 1]
    if (Number.isFinite(x) && Number.isFinite(y)) { xs.push(x); ys.push(y) }
  }
  return { xs, ys }
}

/** The p-th quantile (0-1) of sorted values, by nearest rank. */
function quantile(sorted: number[], p: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.round(p * (sorted.length - 1))))]
}

/**
 * Where to frame the top-down view: the legs' bounds plus `margin` metres, or,
 * without legs, the take's 5th-95th percentile bounds plus the margin. Never
 * the take's extremes: a runaway take can end kilometres away, and framing it
 * would shrink the real walk to a dot. Always finite.
 */
export function viewBounds(legs: PathBuffer | null | undefined, take: PathBuffer | null | undefined, margin = 10): ViewBounds {
  const l = finiteXY(legs)
  if (l.xs.length > 0) {
    // Loops, not Math.min(...xs): a long survey's legs overflow the argument limit.
    let minX = Infinity; let maxX = -Infinity; let minY = Infinity; let maxY = -Infinity
    for (let i = 0; i < l.xs.length; i++) {
      minX = Math.min(minX, l.xs[i]); maxX = Math.max(maxX, l.xs[i])
      minY = Math.min(minY, l.ys[i]); maxY = Math.max(maxY, l.ys[i])
    }
    return { minX: minX - margin, maxX: maxX + margin, minY: minY - margin, maxY: maxY + margin }
  }
  const k = finiteXY(take)
  if (k.xs.length > 0) {
    const xs = k.xs.sort((a, b) => a - b)
    const ys = k.ys.sort((a, b) => a - b)
    return {
      minX: quantile(xs, 0.05) - margin, maxX: quantile(xs, 0.95) + margin,
      minY: quantile(ys, 0.05) - margin, maxY: quantile(ys, 0.95) + margin,
    }
  }
  return { minX: -margin, maxX: margin, minY: -margin, maxY: margin }
}

/** Seconds into the survey as m:ss, or h:mm:ss past an hour: 980 -> "16:20",
 * 3725 -> "1:02:05". Floored, so a playhead reads the second it is in. */
export function formatClock(s: number): string {
  const total = Math.max(0, Math.floor(Number.isFinite(s) ? s : 0))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const sec = String(total % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

const VERDICT_COLOUR: Record<SegmentVerdict, string> = {
  good: color.green,
  watch: color.amber,
  bad: color.red,
  standing: color.t3,
  no_data: color.surface,
}

/** A drift-strip segment's colour: status tokens, muted for standing, and the
 * bare surface where there was nothing to judge. */
export function verdictColour(v: SegmentVerdict): string {
  return VERDICT_COLOUR[v]
}

/** Whether any segment was judged against the legs (good, watch or bad):
 * standing and no_data are not a judgement of drift, so a take with none of
 * these must not read as "no drift found". */
export function anyJudged(segments: readonly TakeSegment[]): boolean {
  return segments.some((s) => s.verdict === 'good' || s.verdict === 'watch' || s.verdict === 'bad')
}
