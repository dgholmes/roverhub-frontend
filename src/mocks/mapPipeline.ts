import { ApiError } from '@/lib/realtime/apiError'
import { hasTrackHeader } from '@/components/maps/mapPipeline'
import type { MapFloor, MapStatus, SiteMap } from '@/types/maps'
import {
  MAX_SURVEY_BYTES, type FreezeOverride, type MapJob, type MapJobKind, type MapQualityReport, type MapVersion,
  type QualityCheck, type QualityComparison, type SurveyUpload, type SurveyUploadOptions,
} from '@/types/mapPipeline'

/**
 * The survey pipeline in demo mode: survey uploads that become draft maps,
 * quality reports that gate freezing, and kept versions that can be restored.
 * It behaves like roverhub-backend maps/router.py, jobs.py and quality.py --
 * the same job stages, the same check ids and thresholds, the same 409 codes --
 * so every state of the Maps page can be reached without a backend.
 *
 * Jobs advance on the clock rather than on timers: each call first settles
 * every job whose time has come (`settle`), so a test moves time by changing
 * `now` and nothing runs in the background.
 *
 * The sample Venue survey is seeded with two versions and a FAILED report (its
 * free area is 4.5 m², under the 10 m² a patrol needs) -- it is active because
 * a supervisor froze it with an override. Restoring its earlier version puts it
 * back to draft, so the gate and the override can be tried by hand; a new
 * survey upload produces a map whose report passes.
 */

/** maps/quality.py THRESHOLDS. */
export const MOCK_THRESHOLDS: Record<string, [QualityComparison, number | null, boolean]> = {
  level_evidence: ['present', null, true],
  floor_tilt_deg: ['max', 1.0, true],
  track_tilt_deg: ['max', 1.0, true],
  floor_below_fraction: ['max', 0.05, true],
  floor_residual_p95_m: ['info', null, false],
  track_drift_p95_m: ['max', 0.10, false],
  track_breaks: ['max', 0, false],
  free_area_m2: ['min', 10.0, true],
  surveyed_fraction: ['info', null, false],
  track_inside_grid: ['min', 0.99, true],
  track_on_occupied: ['info', null, false],
  planning_grid: ['present', null, false],
  path_coverage: ['min', 0.95, true],
  replay: ['info', null, false],
}

/** maps/survey.py's stages, at ms after the job was queued. */
const SURVEY_PLAN: [string, number][] = [
  ['reading the cloud', 600], ['levelling', 1600], ['building the grid', 2600],
  ['storing', 3400], ['checking quality', 4000],
]
const SURVEY_DONE_MS = 5000
const QUALITY_PLAN: [string, number][] = [['checking quality', 400]]
const QUALITY_DONE_MS = 1800
const BAD_TRACK_FAILS_MS = 1200
const TRACK_HEADER_ERROR = "the track's first line must be the header t,x,y,z"

function check(id: string, floor: number | null, value: number | boolean | null, detail: string,
  status?: QualityCheck['status']): QualityCheck {
  const [comparison, threshold, blocking] = MOCK_THRESHOLDS[id]
  let s = status
  if (!s) {
    if (value === null) s = 'skipped'
    else if (comparison === 'max') s = (value as number) <= threshold! ? 'pass' : blocking ? 'fail' : 'warn'
    else if (comparison === 'min') s = (value as number) >= threshold! ? 'pass' : blocking ? 'fail' : 'warn'
    else s = 'info'
  }
  return { id, floor, value, comparison, threshold, blocking, status: s, detail }
}

/** A report for `map` as quality.py would write it, with plausible figures for
 *  a levelled survey: what fails is decided by the map itself (its free area,
 *  whether a planning grid is stored). */
export function mockQualityReport(map: SiteMap, version: number, computedAt: string): Omit<MapQualityReport, 'current'> {
  const checks: QualityCheck[] = []
  for (const f of [...map.floors].sort((a, b) => a.index - b.index)) {
    const cell = f.resolution_m * f.resolution_m
    const total = f.free_cells + f.occupied_cells + f.unknown_cells
    const planning = f.planning ?? null
    checks.push(
      check('level_evidence', f.index, true, 'a floor plane from the cloud or a plane through the track', 'pass'),
      check('floor_tilt_deg', f.index, 0.062, 'floor plane fitted to the cloud sample'),
      check('track_tilt_deg', f.index, 0.114, 'plane through the walked path'),
      check('floor_below_fraction', f.index, 0.0118, 'cells more than 8 cm below the fitted floor'),
      check('floor_residual_p95_m', f.index, 0.0213, "floor cells' distance from the plane, 95th percentile"),
      check('track_drift_p95_m', f.index, 0.0384, 'path height off its own plane, 95th percentile: vertical drift'),
      check('track_breaks', f.index, 0, 'path steps over 1.0 m (tracking lost and snapped back)'),
      check('free_area_m2', f.index, Math.round((planning ? planning.free_cells : f.free_cells) * cell * 100) / 100,
        planning ? 'free area of the planning grid' : 'observed floor in the survey grid (no planning grid)'),
      check('surveyed_fraction', f.index, total ? Math.round(((f.free_cells + f.occupied_cells) / total) * 1e4) / 1e4 : 0,
        'free + occupied share of the survey grid'),
      check('track_inside_grid', f.index, 1, 'path samples inside the grid'),
      check('track_on_occupied', f.index, 0.0041, 'path samples on occupied survey-grid cells'),
      check('planning_grid', f.index, planning !== null,
        planning ? 'a planning grid is stored' : 'no planning grid: nothing can plan a walk on this floor',
        planning ? 'pass' : 'warn'),
      check('path_coverage', f.index, planning ? 0.9712 : null,
        planning ? "path samples on the planning grid's largest free area" : 'no planning grid'),
      check('replay', f.index, null, 'not computed: the upload carries no recorded scans to match', 'skipped'),
    )
  }
  if (map.floors.length === 0) checks.push(check('level_evidence', null, false, 'the map has no floors', 'fail'))
  const failed = [...new Set(checks.filter((c) => c.status === 'fail').map((c) => c.id))].sort()
  const warnings = [...new Set(checks.filter((c) => c.status === 'warn').map((c) => c.id))].sort()
  return {
    report_version: 1, map_id: map.map_id, version, computed_at: computedAt,
    passed: failed.length === 0, failed, warnings, checks,
    thresholds: Object.fromEntries(Object.entries(MOCK_THRESHOLDS).map(([k, [comparison, threshold, blocking]]) =>
      [k, { comparison, threshold, blocking }])),
  }
}

/** Where the pipeline reads and writes the provider's maps. */
export interface MockMapStore {
  get(mapId: string): SiteMap | null
  put(map: SiteMap): void
}

interface Kept {
  version: number
  map: SiteMap
  source: string
  created_at: string
  restored_from: number | null
  detail: Record<string, unknown>
  quality: Omit<MapQualityReport, 'current'> | null
}

interface MapRecord {
  live: Omit<Kept, 'map'>
  kept: Kept[]
}

interface JobRecord {
  job: MapJob
  queuedAt: number
  plan: [string, number][]
  doneMs: number
  /** Runs once at doneMs; throws a sentence to fail the job. */
  work: (at: string) => Record<string, unknown>
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class MockMapPipeline {
  private records = new Map<string, MapRecord>()
  private jobs: JobRecord[] = []
  private nextJob = 1
  private readonly now: () => number
  private readonly uploadStepMs: number

  constructor(private readonly store: MockMapStore, options: { now?: () => number; uploadStepMs?: number } = {}) {
    this.now = options.now ?? (() => Date.now())
    this.uploadStepMs = options.uploadStepMs ?? 140
  }

  private iso(ms = this.now()): string {
    return new Date(ms).toISOString()
  }

  /** The record for a map, seeding one for a map the pipeline has not seen:
   *  the live bundle as version 2 from a survey, an earlier upload kept as
   *  version 1, and a report computed when the live one arrived. */
  private record(map: SiteMap): MapRecord {
    let rec = this.records.get(map.map_id)
    if (!rec) {
      const earlier: SiteMap = {
        ...map,
        updated_at: shiftDays(map.updated_at, -2),
        floors: map.floors.map((f) => ({ ...f, free_cells: Math.round(f.free_cells * 0.6), occupied_cells: Math.round(f.occupied_cells * 0.7),
          unknown_cells: f.unknown_cells + Math.round(f.free_cells * 0.4) + Math.round(f.occupied_cells * 0.3) })),
      }
      rec = {
        live: { version: 2, source: 'survey', created_at: map.updated_at, restored_from: null,
          detail: { floor: map.floors[0]?.index ?? 0, cloud: `${map.map_id}.pcd`, points: 2_412_880, levelled_deg: 5.71 },
          quality: mockQualityReport(map, 2, map.updated_at) },
        kept: [{ version: 1, map: earlier, source: 'upload', created_at: earlier.updated_at, restored_from: null, detail: {},
          quality: mockQualityReport(earlier, 1, earlier.updated_at) }],
      }
      this.records.set(map.map_id, rec)
    }
    return rec
  }

  private mapOr404(mapId: string, what: string): SiteMap {
    const map = this.store.get(mapId)
    if (!map) throw new ApiError(404, { detail: 'map not found' }, `${what} answered 404: map not found`)
    return map
  }

  /** Finish every job whose time has come, in the order they were queued. */
  settle(): void {
    const now = this.now()
    for (const j of this.jobs) {
      if (j.job.status === 'succeeded' || j.job.status === 'failed') continue
      const elapsed = now - j.queuedAt
      if (elapsed >= j.doneMs) {
        const at = this.iso(j.queuedAt + j.doneMs)
        j.job.started_at ??= this.iso(j.queuedAt + (j.plan[0]?.[1] ?? 0))
        j.job.finished_at = at
        try {
          j.job.result = j.work(at)
          j.job.status = 'succeeded'
          j.job.stage = 'done'
        } catch (e) {
          j.job.status = 'failed'
          j.job.error = e instanceof Error ? e.message : String(e)
        }
        continue
      }
      const reached = j.plan.filter(([, ms]) => elapsed >= ms)
      if (reached.length) {
        j.job.status = 'running'
        j.job.started_at ??= this.iso(j.queuedAt + reached[0][1])
        j.job.stage = reached[reached.length - 1][0]
      }
    }
  }

  private submit(kind: MapJobKind, map_id: string, site_id: string | null, plan: [string, number][], doneMs: number,
    work: JobRecord['work'], detail: Record<string, unknown> = {}): MapJob {
    const job: MapJob = {
      job_id: `mjob-mock${String(this.nextJob++).padStart(4, '0')}`, kind, map_id, site_id,
      status: 'queued', stage: 'queued', created_at: this.iso(), started_at: null, finished_at: null,
      error: null, result: null, requested_by: 'operator-dev', detail,
    }
    this.jobs.push({ job, queuedAt: this.now(), plan, doneMs, work })
    return { ...job }
  }

  private queueQuality(map: SiteMap): MapJob {
    const waiting = this.jobs.find((j) => j.job.kind === 'quality' && j.job.map_id === map.map_id && j.job.status === 'queued')
    if (waiting) return { ...waiting.job }
    return this.submit('quality', map.map_id, map.site_id, QUALITY_PLAN, QUALITY_DONE_MS, (at) => {
      const current = this.store.get(map.map_id)
      if (!current) throw new Error(`map ${map.map_id} was deleted before it could be checked`)
      const rec = this.record(current)
      rec.live.quality = mockQualityReport(current, rec.live.version, at)
      const q = rec.live.quality
      return { map_id: map.map_id, version: rec.live.version, passed: q.passed, failed: q.failed, warnings: q.warnings }
    })
  }

  // --- surveys ----------------------------------------------------------------

  async uploadSurvey(upload: SurveyUpload, options: SurveyUploadOptions = {}): Promise<MapJob> {
    const { onProgress, signal } = options
    const aborted = () => new DOMException('The upload was cancelled', 'AbortError')
    if (signal?.aborted) throw aborted()
    if (upload.cloud.size + upload.track.size > MAX_SURVEY_BYTES) {
      throw new ApiError(413, { detail: `upload exceeds ${MAX_SURVEY_BYTES} bytes` }, 'POST /map-surveys answered 413')
    }
    // The bytes "leaving", in steps, so the progress bar has something to show.
    for (let step = 1; step <= 5; step++) {
      if (this.uploadStepMs > 0) await sleep(this.uploadStepMs)
      if (signal?.aborted) throw aborted()
      onProgress?.(step / 5)
    }
    const name = upload.name.trim()
    if (!upload.siteId.trim()) throw new ApiError(400, { detail: 'site_id is required' }, 'POST /map-surveys answered 400')
    if (!name) throw new ApiError(400, { detail: 'name is required' }, 'POST /map-surveys answered 400')
    if (!(upload.floor >= 0 && upload.floor <= 999)) {
      throw new ApiError(400, { detail: 'floor must be between 0 and 999' }, 'POST /map-surveys answered 400')
    }
    const trackOk = await hasTrackHeader(upload.track)
    this.settle()
    const replaces = this.store.get(upload.mapId) !== null
    return this.submit('survey', upload.mapId, upload.siteId,
      trackOk ? SURVEY_PLAN : SURVEY_PLAN.slice(0, 1), trackOk ? SURVEY_DONE_MS : BAD_TRACK_FAILS_MS,
      (at) => {
        if (!trackOk) throw new Error(TRACK_HEADER_ERROR)
        return this.storeSurvey(upload, name, at)
      },
      { name, floor: upload.floor, cloud: upload.cloudName, track: upload.trackName, replaces })
  }

  /** What process_survey stores: a levelled floor, the map's other floors and
   *  zones carried over, always a draft; then its quality report. */
  private storeSurvey(upload: SurveyUpload, name: string, at: string): Record<string, unknown> {
    const existing = this.store.get(upload.mapId)
    const floor: MapFloor = {
      index: upload.floor, label: null, floor_z_m: -0.31, resolution_m: 0.05,
      origin_xy_m: [-8.2, -6.4], size_cells: [520, 380],
      free_cells: 41_000, occupied_cells: 14_500, unknown_cells: 520 * 380 - 41_000 - 14_500, planning: null,
    }
    const floors = [...(existing?.floors.filter((f) => f.index !== upload.floor) ?? []), floor].sort((a, b) => a.index - b.index)
    const map: SiteMap = {
      map_id: upload.mapId, site_id: upload.siteId, name, source: 'slam',
      extent_min: [-8.2, -6.4], extent_max: [-8.2 + 26, -6.4 + 19],
      created_at: existing?.created_at ?? at, updated_at: at, geodetic_anchor: existing?.geodetic_anchor ?? null,
      floors, status: 'draft', zones: existing?.zones ?? [],
    }
    const detail = { floor: upload.floor, cloud: upload.cloudName, points: 1_873_204, levelled_deg: 4.84 }
    let version = 1
    if (existing) {
      const rec = this.record(existing)
      rec.kept.unshift({ ...rec.live, map: existing })
      version = rec.live.version + 1
      rec.live = { version, source: 'survey', created_at: at, restored_from: null, detail, quality: null }
    } else {
      this.records.set(map.map_id, { live: { version, source: 'survey', created_at: at, restored_from: null, detail, quality: null }, kept: [] })
    }
    this.store.put(map)
    const report = mockQualityReport(map, version, at)
    this.records.get(map.map_id)!.live.quality = report
    return {
      map_id: map.map_id, version, floor: upload.floor, points: detail.points, levelled: true, levelled_deg: 4.84,
      track_frame: 'raw', tilt_after_deg: 0.062, size_cells: floor.size_cells,
      free_cells: floor.free_cells, occupied_cells: floor.occupied_cells,
      quality: { map_id: map.map_id, version, passed: report.passed, failed: report.failed, warnings: report.warnings },
    }
  }

  // --- jobs -------------------------------------------------------------------

  getJob(jobId: string): MapJob {
    this.settle()
    const j = this.jobs.find((x) => x.job.job_id === jobId)
    if (!j) throw new ApiError(404, { detail: 'job not found' }, 'GET /map-jobs answered 404: job not found')
    return { ...j.job }
  }

  listJobs(mapId?: string): MapJob[] {
    this.settle()
    return this.jobs.filter((j) => !mapId || j.job.map_id === mapId).map((j) => ({ ...j.job })).reverse()
  }

  // --- quality ----------------------------------------------------------------

  getQuality(mapId: string): MapQualityReport | null {
    this.settle()
    const map = this.store.get(mapId)
    if (!map) return null
    const rec = this.record(map)
    const q = rec.live.quality
    return q ? { ...q, current: q.version === rec.live.version } : null
  }

  recheck(mapId: string): MapJob {
    this.settle()
    return this.queueQuality(this.mapOr404(mapId, 'POST /maps/quality'))
  }

  /** maps/router.py `_quality_gate`: freezing a draft needs a current, passed
   *  report, or an override. Throws the backend's 409s. */
  freezeGate(map: SiteMap, status: MapStatus, override?: FreezeOverride): void {
    this.settle()
    if (status !== 'active' || map.status === 'active' || map.floors.length === 0) return
    const rec = this.record(map)
    const q = rec.live.quality
    const refuse = (detail: Record<string, unknown>) => {
      throw new ApiError(409, { detail }, `PUT /maps/status answered 409: ${String(detail.message)}`)
    }
    if (!q) refuse({ code: 'quality_missing', message: `this map has no quality report; run one (POST /maps/${map.map_id}/quality) first` })
    else if (q.version !== rec.live.version) refuse({ code: 'quality_stale', message: 'the quality report was made from files this map no longer holds; run it again' })
    else if (!q.passed && !override) {
      refuse({ code: 'quality_failed', failed: q.failed,
        message: `the quality report failed (${q.failed.join(', ')}); freezing it anyway needs an override` })
    }
  }

  // --- versions ---------------------------------------------------------------

  listVersions(mapId: string): MapVersion[] {
    this.settle()
    const map = this.mapOr404(mapId, 'GET /maps/versions')
    const rec = this.record(map)
    return [{ ...rec.live, map }, ...rec.kept].map((k, i) => versionEntry(k, i === 0))
  }

  restore(mapId: string, version: number): SiteMap {
    this.settle()
    const current = this.mapOr404(mapId, 'POST /maps/versions/restore')
    const rec = this.record(current)
    const from = rec.kept.find((k) => k.version === version)
    if (!from) {
      throw new ApiError(404, { detail: `map ${mapId} has no version ${version}` }, 'POST /maps/versions/restore answered 404')
    }
    const at = this.iso()
    const restored: SiteMap = { ...from.map, zones: current.zones, status: 'draft', created_at: current.created_at, updated_at: at }
    rec.kept.unshift({ ...rec.live, map: current })
    rec.live = { version: rec.live.version + 1, source: 'restore', created_at: at, restored_from: version, detail: {},
      quality: rec.live.quality }
    this.store.put(restored)
    this.queueQuality(restored)
    return restored
  }
}

function versionEntry(k: Kept, current: boolean): MapVersion {
  return {
    version: k.version, current, source: k.source, created_at: k.created_at, restored_from: k.restored_from,
    detail: k.detail, name: k.map.name, updated_at: k.map.updated_at, zones: k.map.zones.length,
    floors: k.map.floors.map((f) => ({
      index: f.index, size_cells: f.size_cells, resolution_m: f.resolution_m, origin_xy_m: f.origin_xy_m,
      free_cells: f.free_cells, occupied_cells: f.occupied_cells, unknown_cells: f.unknown_cells,
      has_planning: f.planning != null, has_track: true,
    })),
    quality: k.quality ? { passed: k.quality.passed, computed_at: k.quality.computed_at, failed: k.quality.failed } : null,
  }
}

function shiftDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString()
}
