import { parsePgm } from '@/missions/floorCells'
import { isJobActive, type CloudEditBox, type CloudEdits, type MapFloorFileKind, type MapJob, type MovedBlob } from '@/types/mapPipeline'
import type { SiteMap } from '@/types/maps'
import { errorText } from '../mapPipeline'
import { encodePgm } from './gridEdit'
import { cloudEditsResult, type CloudEditsResult } from './movedLayer'

/**
 * What an edit session holds besides the brush, and how one "Save version"
 * turns it into requests.
 *
 * Nothing is sent until Save: Remove and Keep in the list, and Delete in 3D,
 * only stage a change. Save then sends up to two requests, in this order:
 *
 * 1. Remove, Keep and the 3D boxes: ONE POST /cloud-edits (`resolve_moved`,
 *    `keep_moved`, `delete_boxes`), followed until its job ends. The job
 *    re-rasterises the planning grid under what it removed;
 * 2. the brush: the planning grid is read AGAIN (step 1 changed it), the
 *    brush's cells are laid over it, and the result goes to PUT /planning.
 *    Painting over the copy the page loaded would undo step 1's cells.
 *
 * A floor with no planning grid has no brush, so it sends only step 1.
 *
 * Each request makes a version on the backend, so one save adds one or two.
 * A failed step stops the rest; what was saved before it stays saved.
 */

export type BlobDecision = 'remove' | 'keep'

export interface StagedBox {
  id: string
  /** Map frame, map z. */
  box: CloudEditBox
}

export interface Staged {
  decisions: Readonly<Record<string, BlobDecision>>
  boxes: readonly StagedBox[]
}

export const EMPTY_STAGED: Staged = Object.freeze({ decisions: Object.freeze({}), boxes: Object.freeze([]) as readonly StagedBox[] })

/** Set (or with null, clear) one blob's decision. */
export function decide(staged: Staged, id: string, decision: BlobDecision | null): Staged {
  const decisions = { ...staged.decisions }
  if (decision) decisions[id] = decision
  else delete decisions[id]
  return { ...staged, decisions }
}

/** "Remove all": every blob not already kept is removed. */
export function removeAll(staged: Staged, blobs: readonly MovedBlob[]): Staged {
  const decisions = { ...staged.decisions }
  for (const b of blobs) if (decisions[b.id] !== 'keep') decisions[b.id] = 'remove'
  return { ...staged, decisions }
}

let boxSeq = 0
export function addBox(staged: Staged, box: CloudEditBox): Staged {
  boxSeq += 1
  return { ...staged, boxes: [...staged.boxes, { id: `box-${boxSeq}`, box }] }
}

export function dropBox(staged: Staged, id: string): Staged {
  return { ...staged, boxes: staged.boxes.filter((b) => b.id !== id) }
}

export const idsWith = (staged: Staged, decision: BlobDecision): string[] =>
  Object.entries(staged.decisions).filter(([, d]) => d === decision).map(([id]) => id).sort()

/** The brush's changes, as cells and the values they were painted to, so they
 *  can be laid over a grid read again after the cloud job (replayBrush). */
export interface BrushDiff {
  w: number
  h: number
  /** PGM indices (row 0 at the top). */
  indices: Uint32Array
  values: Uint8Array
  /** The planning grid as the page loaded it. */
  base: Uint8Array
}

/** What one save will send. */
export interface SavePlan {
  brush: BrushDiff | null
  cloudEdits: CloudEdits | null
}

export function planSave(args: { brush: BrushDiff | null; staged: Staged }): SavePlan {
  const remove = idsWith(args.staged, 'remove')
  const keep = idsWith(args.staged, 'keep')
  const boxes = args.staged.boxes.map((b) => b.box)
  const cloudEdits: CloudEdits | null = remove.length || keep.length || boxes.length
    ? { delete_boxes: boxes, resolve_moved: remove, keep_moved: keep, reason: editReason(remove.length, keep.length, boxes.length) }
    : null
  const brush = args.brush && args.brush.indices.length > 0 ? args.brush : null
  return { brush, cloudEdits }
}

/** The audit log's line for a cloud edit. English: the log is not translated. */
function editReason(spots: number, kept: number, boxes: number): string {
  const parts = []
  if (spots) parts.push(`removed ${spots} moved spot${spots === 1 ? '' : 's'}`)
  if (kept) parts.push(`kept ${kept} moved spot${kept === 1 ? '' : 's'}`)
  if (boxes) parts.push(`deleted ${boxes} box${boxes === 1 ? '' : 'es'} of points`)
  return `Map editor in the console: ${parts.join(', ')}`
}

export const planIsEmpty = (plan: SavePlan): boolean => !plan.brush && !plan.cloudEdits

/** Unsaved changes, counted as the operator would see them: the brush as one,
 *  each spot decided and each box. */
export function pendingChanges(plan: SavePlan): number {
  const c = plan.cloudEdits
  return (plan.brush ? 1 : 0) + (c ? c.resolve_moved.length + (c.keep_moved?.length ?? 0) + c.delete_boxes.length : 0)
}

/** The brush's cells laid over `base` (a copy; `base` is not changed). */
export function replayBrush(base: Uint8Array, diff: Pick<BrushDiff, 'indices' | 'values'>): Uint8Array {
  const out = Uint8Array.from(base)
  diff.indices.forEach((k, n) => { if (k < out.length) out[k] = diff.values[n] })
  return out
}

// --- running a save -----------------------------------------------------------

/** The provider methods a save uses (a subset of dataProvider's). */
export interface EditApi {
  putMapPlanning(mapId: string, floorIndex: number, pgm: Uint8Array, clearanceM?: number): Promise<SiteMap>
  postCloudEdits(mapId: string, floorIndex: number, edits: CloudEdits): Promise<MapJob>
  getMapJob(jobId: string): Promise<MapJob>
  getMapFloorFile(mapId: string, floorIndex: number, kind: MapFloorFileKind): Promise<ArrayBuffer | null>
  getMap(mapId: string): Promise<SiteMap | null>
}

export type SaveStepId = 'cloud' | 'planning'
export type SaveStepStatus = 'waiting' | 'running' | 'done' | 'failed'

export interface SaveStep {
  id: SaveStepId
  status: SaveStepStatus
  /** The job's stage while it runs (cloud). */
  stage?: string
  error?: string
  /** cloud: what the job reports. */
  result?: CloudEditsResult
}

export interface SaveOutcome {
  ok: boolean
  steps: SaveStep[]
  /** The map as stored after the save (null if it could not be read). */
  map: SiteMap | null
}

/** The steps a plan will run, in order, all waiting: the cloud edit first. */
export function stepsFor(plan: SavePlan): SaveStep[] {
  const ids: SaveStepId[] = ['cloud', 'planning']
  return ids
    .filter((id) => (id === 'cloud' ? plan.cloudEdits !== null : plan.brush !== null))
    .map((id) => ({ id, status: 'waiting' as const }))
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * Run a save. `onSteps` hears every change to the steps (for the progress
 * list). The map is read again at the end whatever happened, so the page shows
 * what the server now holds -- a failed brush step leaves the cloud edit saved.
 */
export async function runSave(api: EditApi, args: {
  mapId: string
  floorIndex: number
  plan: SavePlan
  clearanceM?: number
  pollMs?: number
  onSteps?: (steps: SaveStep[]) => void
}): Promise<SaveOutcome> {
  const { mapId, floorIndex, plan, pollMs = 1500 } = args
  let steps = stepsFor(plan)
  const set = (id: SaveStepId, patch: Partial<SaveStep>) => {
    steps = steps.map((s) => (s.id === id ? { ...s, ...patch } : s))
    args.onSteps?.(steps)
  }
  args.onSteps?.(steps)
  let ok = true
  let cleaned = false
  const cloud = async (edits: CloudEdits) => {
    set('cloud', { status: 'running', stage: 'queued' })
    let job = await api.postCloudEdits(mapId, floorIndex, edits)
    while (isJobActive(job)) {
      set('cloud', { stage: job.stage })
      await wait(pollMs)
      job = await api.getMapJob(job.job_id)
    }
    // The job's own sentence, verbatim (e.g. the map changed meanwhile).
    if (job.status !== 'succeeded') throw new StepFailure('cloud', job.error || job.status)
    set('cloud', { status: 'done', stage: job.stage, result: cloudEditsResult(job) })
    cleaned = true
  }
  const brushStep = async (brush: BrushDiff) => {
    set('planning', { status: 'running' })
    // The cloud job rebuilt cells under what it removed: paint over the grid
    // as it is now, not the copy the page loaded.
    let base = brush.base
    if (cleaned) {
      const bytes = await api.getMapFloorFile(mapId, floorIndex, 'planning')
      const now = bytes ? parsePgm(new Uint8Array(bytes)) : null
      if (now && now.width === brush.w && now.height === brush.h) base = now.pixels
    }
    await api.putMapPlanning(mapId, floorIndex, encodePgm(brush.w, brush.h, replayBrush(base, brush)), args.clearanceM)
    set('planning', { status: 'done' })
  }
  try {
    for (const step of stepsFor(plan)) {
      if (step.id === 'cloud' && plan.cloudEdits) await cloud(plan.cloudEdits)
      if (step.id === 'planning' && plan.brush) await brushStep(plan.brush)
    }
  } catch (e) {
    ok = false
    const running = steps.find((s) => s.status === 'running')
    const id = e instanceof StepFailure ? e.step : running?.id
    if (id) set(id, { status: 'failed', error: e instanceof StepFailure ? e.message : errorText(e) })
  }
  let map: SiteMap | null = null
  try { map = await api.getMap(mapId) } catch { /* the page keeps what it had */ }
  return { ok, steps, map }
}

class StepFailure extends Error {
  constructor(readonly step: SaveStepId, message: string) { super(message) }
}
