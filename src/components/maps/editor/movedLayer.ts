import type { MapJob, MovedBlob, MovedLayer } from '@/types/mapPipeline'

/**
 * The moving-object check's layer (`moved.json`, tools/map_prep/
 * transient_filter.py) as the console reads it, and the one place that reads
 * a cloud-edits job's `result`, whose fields the contract does not fix.
 */

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const nums = (v: unknown, n: number): number[] | null =>
  Array.isArray(v) && v.length === n && v.every(isNum) ? (v as number[]) : null

/** One blob, or null when it lacks what the editor needs to draw and send it.
 *  The counts the list shows default to 0 rather than dropping a blob over them. */
function parseBlob(raw: unknown): MovedBlob | null {
  if (!raw || typeof raw !== 'object') return null
  const b = raw as Record<string, unknown>
  const centroid = nums(b.centroid, 2)
  const bbox = nums(b.bbox, 4)
  const z = nums(b.z_range, 2)
  if (typeof b.id !== 'string' || !b.id || !centroid || !bbox || !z) return null
  const polygon = Array.isArray(b.polygon)
    ? (b.polygon as unknown[]).map((p) => nums(p, 2)).filter((p): p is number[] => p !== null) as [number, number][]
    : undefined
  return {
    id: b.id,
    centroid: centroid as [number, number],
    bbox: [Math.min(bbox[0], bbox[2]), Math.min(bbox[1], bbox[3]), Math.max(bbox[0], bbox[2]), Math.max(bbox[1], bbox[3])],
    z_range: [Math.min(z[0], z[1]), Math.max(z[0], z[1])],
    area_m2: isNum(b.area_m2) ? b.area_m2 : (bbox[2] - bbox[0]) * (bbox[3] - bbox[1]),
    points: isNum(b.points) ? b.points : 0,
    hits: isNum(b.hits) ? b.hits : 0,
    pass_through: isNum(b.pass_through) ? b.pass_through : 0,
    ...(polygon && polygon.length >= 3 ? { polygon } : {}),
  }
}

/**
 * A `moved.json` as the backend serves it, checked and sorted biggest first
 * (the file promises that order; the list relies on it, so it is not trusted).
 * Malformed blobs are dropped, not guessed at; null when it is not a layer at all.
 */
export function parseMovedLayer(raw: unknown): MovedLayer | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { blobs?: unknown }).blobs)) return null
  const r = raw as Record<string, unknown>
  const blobs = (r.blobs as unknown[]).map(parseBlob).filter((b): b is MovedBlob => b !== null)
  const seen = new Set<string>()
  const unique = blobs.filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true)))
  unique.sort((a, b) => b.area_m2 - a.area_m2)
  return {
    version: isNum(r.version) ? r.version : 1,
    source: typeof r.source === 'string' ? r.source : '',
    params: r.params && typeof r.params === 'object' ? r.params as Record<string, unknown> : {},
    blobs: unique,
  }
}

/** The layer without `ids`, everything else as it was: what "Keep" writes back. */
export function withoutBlobs(layer: MovedLayer, ids: Iterable<string>): MovedLayer {
  const drop = new Set(ids)
  return { ...layer, blobs: layer.blobs.filter((b) => !drop.has(b.id)) }
}

/** A blob's outline in map metres: its polygon, else its bounding box. */
export function blobOutline(blob: MovedBlob): [number, number][] {
  if (blob.polygon && blob.polygon.length >= 3) return blob.polygon
  const [x0, y0, x1, y1] = blob.bbox
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
}

/** The selection ring's radius in metres: clear of the blob, never tiny. */
export function blobRingRadius(blob: MovedBlob): number {
  const [x0, y0, x1, y1] = blob.bbox
  return Math.max(0.35, Math.hypot(x1 - x0, y1 - y0) / 2 + 0.2)
}

/** The blob whose outline box holds map point (x, y), the smallest when they
 *  overlap; null for none. A margin makes a 10 cm speck clickable. */
export function blobAt(blobs: readonly MovedBlob[], x: number, y: number, marginM = 0.1): MovedBlob | null {
  let best: MovedBlob | null = null
  for (const b of blobs) {
    const [x0, y0, x1, y1] = b.bbox
    if (x < x0 - marginM || x > x1 + marginM || y < y0 - marginM || y > y1 + marginM) continue
    if (!best || b.area_m2 < best.area_m2) best = b
  }
  return best
}

/** What the editor shows from a finished cloud-edits job. */
export interface CloudEditsResult {
  pointsDeleted: number | null
  blobsResolved: number | null
  cellsChanged: number | null
  /** Cells under what was removed that stayed blocked: the cloud alone gave
   *  no evidence they are free, so the brush has to finish them. */
  keptNoEvidence: number
  /** The grid was re-rasterised with planning_grid.py's defaults because the
   *  floor's own parameters were unknown. */
  defaultsUsed: boolean
  /** The job's own sentence, if it wrote one. */
  note: string | null
}

const first = (r: Record<string, unknown>, keys: string[]): unknown => {
  for (const k of keys) if (r[k] !== undefined) return r[k]
  return undefined
}
const countOf = (v: unknown): number | null => (isNum(v) ? v : Array.isArray(v) ? v.length : null)

/**
 * ADAPTER: the cloud-edits job's `result`. The backend's fields (2026-11-16):
 * points_removed, resolved_moved, kept_moved, moved_blobs_left, version,
 * previous_version, quality_job_id, and planning {rerasterised, reason,
 * freed_cells, kept_no_evidence_cells, ...}. Older spellings are tried after
 * them; every field name the console reads is in this function.
 */
export function cloudEditsResult(job: Pick<MapJob, 'result'>): CloudEditsResult {
  const r = (job.result ?? {}) as Record<string, unknown>
  const planning = (r.planning && typeof r.planning === 'object' ? r.planning : {}) as Record<string, unknown>
  const reason = planning.reason
  const defaultsUsed = first(r, ['defaults_used', 'used_defaults']) === true || planning.defaults_used === true
    || planning.params_source === 'defaults'
  const note = first(r, ['note', 'message'])
    ?? (planning.rerasterised === false && typeof reason === 'string' ? reason : undefined)
  return {
    pointsDeleted: countOf(first(r, ['points_removed', 'points_deleted', 'deleted_points'])),
    blobsResolved: countOf(first(r, ['resolved_moved', 'blobs_resolved'])),
    cellsChanged: countOf(planning.freed_cells ?? r.cells_changed),
    keptNoEvidence: countOf(planning.kept_no_evidence_cells) ?? 0,
    defaultsUsed,
    note: typeof note === 'string' && note ? note : null,
  }
}
