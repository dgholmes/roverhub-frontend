import { ApiError } from '@/lib/realtime/apiError'
import { MAX_SURVEY_BYTES, type QualityCheck } from '@/types/mapPipeline'

/**
 * The Maps page's survey-pipeline logic, kept out of the components so it can
 * be tested without rendering: why a freeze was refused, how a check's figure
 * reads, what a new survey's map id is, and whether its files will be taken.
 */

/** The backend's freeze refusals (409): the quality gate's three, and
 *  (0.0.29) `zones_unreviewed`, a map with no zones activated without the
 *  person saying none are needed. */
export type FreezeRefusalCode = 'quality_missing' | 'quality_stale' | 'quality_failed' | 'zones_unreviewed'

const FREEZE_REFUSAL_CODES: readonly string[] = ['quality_missing', 'quality_stale', 'quality_failed', 'zones_unreviewed']

export interface FreezeRefusal {
  code: FreezeRefusalCode
  /** The backend's own sentence (English). */
  message: string
  /** The blocking checks that failed (quality_failed only). */
  failed: string[]
}

/** What a 409 from PUT /maps/{id}/status means, or null when `e` is not the
 *  quality or zones gate's refusal. Its `detail` is an object, which ApiError.detail
 *  (a sentence) does not return. */
export function freezeRefusalOf(e: unknown): FreezeRefusal | null {
  if (!(e instanceof ApiError) || e.status !== 409) return null
  const d = (e.body as { detail?: unknown } | null)?.detail as { code?: unknown; message?: unknown; failed?: unknown } | undefined
  if (!d || typeof d !== 'object') return null
  if (typeof d.code !== 'string' || !FREEZE_REFUSAL_CODES.includes(d.code)) return null
  return {
    code: d.code as FreezeRefusalCode,
    message: typeof d.message === 'string' ? d.message : '',
    failed: Array.isArray(d.failed) ? d.failed.filter((x): x is string => typeof x === 'string') : [],
  }
}

/** The server's sentence for any failure, else the error's own message. */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.detail) return e.detail
    const refusal = freezeRefusalOf(e)
    if (refusal?.message) return refusal.message
  }
  return e instanceof Error ? e.message : String(e)
}

/** The checks the console knows a name for (maps/quality.py THRESHOLDS); an
 *  unknown id from a newer backend is shown by its id. */
export const KNOWN_CHECKS = [
  'level_evidence', 'floor_tilt_deg', 'track_tilt_deg', 'floor_below_fraction', 'floor_residual_p95_m',
  'track_drift_p95_m', 'track_breaks', 'free_area_m2', 'surveyed_fraction', 'track_inside_grid',
  'track_on_occupied', 'planning_grid', 'path_coverage', 'replay',
] as const
export type KnownCheck = typeof KNOWN_CHECKS[number]
export const isKnownCheck = (id: string): id is KnownCheck => (KNOWN_CHECKS as readonly string[]).includes(id)

type Unit = 'deg' | 'cm' | 'm2' | 'pct' | 'count' | 'yesno'

function unitOf(id: string): Unit {
  if (id.endsWith('_deg')) return 'deg'
  if (id.endsWith('_m2')) return 'm2'
  if (id.endsWith('_m')) return 'cm'
  if (id === 'track_breaks') return 'count'
  if (id === 'level_evidence' || id === 'planning_grid') return 'yesno'
  return 'pct'
}

function figure(unit: Unit, v: number): string {
  switch (unit) {
    case 'deg': return `${v.toFixed(2)}°`
    case 'cm': return `${(v * 100).toFixed(1)} cm`
    case 'm2': return `${v >= 100 ? Math.round(v).toLocaleString('en-US') : v.toFixed(1)} m²`
    case 'pct': {
      const p = v * 100
      return `${p >= 99.95 || p === 0 || Number.isInteger(p) ? p.toFixed(0) : p.toFixed(1)} %`
    }
    case 'count': return String(Math.round(v))
    default: return String(v)
  }
}

/** A check's measured figure, with its unit. Null for a yes/no or a value that
 *  was not measured: the caller words those. */
export function checkValueText(c: Pick<QualityCheck, 'id' | 'value'>): string | null {
  if (c.value === null || typeof c.value === 'boolean') return null
  return figure(unitOf(c.id), c.value)
}

/** "≤ 1.00°", "≥ 95 %", or null when the check has no threshold. */
export function checkThresholdText(c: Pick<QualityCheck, 'id' | 'comparison' | 'threshold'>): string | null {
  if ((c.comparison !== 'max' && c.comparison !== 'min') || c.threshold === null) return null
  return `${c.comparison === 'max' ? '≤' : '≥'} ${figure(unitOf(c.id), c.threshold)}`
}

/** maps/survey.py `slug`. */
export function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'map'
}

/** The id for a new map from a survey: `map-<slug>` (what the backend would
 *  pick), with a short time stamp so it can never land on a map that already
 *  exists -- the backend REPLACES a map with the same id, and this page can see
 *  only one site's maps. Replacing is a choice made by picking that map. */
export function newSurveyMapId(name: string, nowMs: number = Date.now()): string {
  const stamp = nowMs.toString(36).slice(-6)
  return `map-${slug(name).slice(0, 100)}-${stamp}`
}

export type SurveyFileProblem = 'cloudMissing' | 'cloudNotPcd' | 'trackMissing' | 'trackHeader' | 'tooLarge' | 'nameMissing'

/** What would make the backend refuse this survey, checked before the bytes
 *  go: the name, the files, the size, and the track's header line (the job
 *  would otherwise fail a minute later on it). */
export async function surveyProblem(input: { name: string; cloud: File | null; track: File | null }): Promise<SurveyFileProblem | null> {
  if (!input.name.trim()) return 'nameMissing'
  if (!input.cloud) return 'cloudMissing'
  if (!/\.pcd$/i.test(input.cloud.name)) return 'cloudNotPcd'
  if (!input.track) return 'trackMissing'
  if (input.cloud.size + input.track.size > MAX_SURVEY_BYTES) return 'tooLarge'
  if (!(await hasTrackHeader(input.track))) return 'trackHeader'
  return null
}

/** A blob as text: Blob.text where there is one, else a FileReader (jsdom's
 *  Blob has no text()). */
export function blobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsText(blob)
  })
}

/** Whether a track's first line is the t,x,y,z header maps/survey_math.py
 *  `read_track_csv` requires. A file that cannot be read is let through, for
 *  the backend to judge. */
export async function hasTrackHeader(track: Blob): Promise<boolean> {
  let head: string
  try {
    head = (await blobText(track.slice(0, 64))).split(/\r?\n/)[0]
  } catch {
    return true
  }
  return head.split(',').map((h) => h.trim().toLowerCase()).join(',') === 't,x,y,z'
}

/** The job stages maps/survey.py and quality.py write, as locale keys. */
const STAGES: Record<string, string> = {
  queued: 'queued', started: 'started', 'reading the cloud': 'reading', levelling: 'levelling',
  'building the grid': 'grid', storing: 'storing', 'checking quality': 'quality', done: 'done',
}
export function stageKey(stage: string): string | null {
  return STAGES[stage] ?? null
}

/** "37 of 88 MB". */
export function megabytes(bytes: number): string {
  const mb = bytes / (1024 * 1024)
  return mb >= 10 ? Math.round(mb).toString() : mb.toFixed(1)
}
