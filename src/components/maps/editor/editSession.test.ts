import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/realtime/apiError'
import { parsePgm } from '@/missions/floorCells'
import { mockMaps } from '@/mocks/maps'
import type { CloudEdits, MapJob, MovedBlob } from '@/types/mapPipeline'
import {
  EMPTY_STAGED, addBox, decide, dropBox, idsWith, pendingChanges, planIsEmpty, planSave, removeAll, replayBrush, runSave,
  stepsFor, type BrushDiff, type EditApi, type SaveStep,
} from './editSession'
import { PGM_FREE, PGM_OCCUPIED, encodePgm } from './gridEdit'

const blob = (id: string, area: number): MovedBlob => ({
  id, centroid: [0, 0], bbox: [0, 0, 1, 1], z_range: [0, 1], area_m2: area, points: 1, hits: 1, pass_through: 1,
})
const box = { min: [0, 0, 0] as [number, number, number], max: [1, 1, 1] as [number, number, number] }

describe('staging', () => {
  it('stages, changes and clears a decision per spot', () => {
    let s = decide(EMPTY_STAGED, 'b1', 'remove')
    s = decide(s, 'b2', 'keep')
    expect(idsWith(s, 'remove')).toEqual(['b1'])
    expect(idsWith(s, 'keep')).toEqual(['b2'])
    s = decide(s, 'b1', null)
    expect(idsWith(s, 'remove')).toEqual([])
    expect(EMPTY_STAGED.decisions).toEqual({})
  })

  it('"Remove all" removes every spot not kept', () => {
    const s = removeAll(decide(EMPTY_STAGED, 'b2', 'keep'), [blob('b1', 2), blob('b2', 1), blob('b3', 0.5)])
    expect(idsWith(s, 'remove')).toEqual(['b1', 'b3'])
    expect(idsWith(s, 'keep')).toEqual(['b2'])
  })

  it('adds and drops 3D boxes', () => {
    let s = addBox(EMPTY_STAGED, box)
    s = addBox(s, box)
    expect(s.boxes).toHaveLength(2)
    s = dropBox(s, s.boxes[0].id)
    expect(s.boxes).toHaveLength(1)
  })
})

const diff = (over: Partial<BrushDiff> = {}): BrushDiff => ({
  w: 2, h: 2, indices: Uint32Array.from([1]), values: Uint8Array.from([PGM_FREE]),
  base: Uint8Array.from([PGM_OCCUPIED, PGM_OCCUPIED, PGM_FREE, PGM_FREE]), ...over,
})

describe('what a save sends', () => {
  it('sends Remove, Keep and the boxes in one cloud edit, and the brush on its own', () => {
    const staged = addBox(decide(decide(EMPTY_STAGED, 'b1', 'remove'), 'b2', 'keep'), box)
    const plan = planSave({ brush: diff(), staged })
    expect(plan.cloudEdits).toMatchObject({ resolve_moved: ['b1'], keep_moved: ['b2'], delete_boxes: [box] })
    expect(plan.cloudEdits!.reason).toMatch(/removed 1 moved spot, kept 1 moved spot, deleted 1 box/)
    expect(stepsFor(plan).map((s) => s.id)).toEqual(['cloud', 'planning'])
    expect(pendingChanges(plan)).toBe(4)
  })

  it('has nothing to send for an untouched session', () => {
    expect(planIsEmpty(planSave({ brush: diff({ indices: new Uint32Array(), values: new Uint8Array() }), staged: EMPTY_STAGED }))).toBe(true)
    expect(planIsEmpty(planSave({ brush: null, staged: EMPTY_STAGED }))).toBe(true)
  })

  it('lays the brush over a grid without changing it', () => {
    const base = Uint8Array.from([0, 0, 0, 0])
    expect([...replayBrush(base, { indices: Uint32Array.from([0, 3]), values: Uint8Array.from([254, 254]) })]).toEqual([254, 0, 0, 254])
    expect([...base]).toEqual([0, 0, 0, 0])
  })
})

const map = mockMaps[0]
const job = (over: Partial<MapJob> = {}): MapJob => ({
  job_id: 'mjob-1', kind: 'cloud_edits', map_id: map.map_id, site_id: map.site_id, status: 'queued', stage: 'queued',
  created_at: '', started_at: null, finished_at: null, error: null, result: null, ...over,
})

function fakeApi(over: Partial<EditApi> = {}) {
  const calls: string[] = []
  const api: EditApi = {
    putMapPlanning: vi.fn(async () => { calls.push('putPlanning'); return map }),
    postCloudEdits: vi.fn(async () => { calls.push('postCloudEdits'); return job() }),
    getMapJob: vi.fn(async () => { calls.push('getMapJob'); return job({ status: 'succeeded', stage: 'saving a new version',
      result: { points_removed: 412, planning: { rerasterised: true, freed_cells: 30, kept_no_evidence_cells: 4 } } }) }),
    getMapFloorFile: vi.fn(async () => {
      calls.push('getPlanning')
      // The job freed cell 0 meanwhile.
      return encodePgm(2, 2, Uint8Array.from([PGM_FREE, PGM_OCCUPIED, PGM_FREE, PGM_FREE])).slice().buffer
    }),
    getMap: vi.fn(async () => { calls.push('getMap'); return map }),
    ...over,
  }
  return { api, calls }
}

describe('running a save', () => {
  it('cleans the cloud first, then paints the brush over the grid as the job left it', async () => {
    const { api, calls } = fakeApi()
    const plan = planSave({ brush: diff(), staged: decide(EMPTY_STAGED, 'b1', 'remove') })
    const seen: SaveStep[][] = []
    const out = await runSave(api, { mapId: map.map_id, floorIndex: 0, plan, pollMs: 0, clearanceM: 0.25, onSteps: (s) => seen.push(s) })
    expect(out.ok).toBe(true)
    expect(calls).toEqual(['postCloudEdits', 'getMapJob', 'getPlanning', 'putPlanning', 'getMap'])
    expect((api.postCloudEdits as ReturnType<typeof vi.fn>).mock.calls[0][2]).toMatchObject({ resolve_moved: ['b1'], keep_moved: [] })
    const [, floor, pgm, clearance] = (api.putMapPlanning as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(floor).toBe(0)
    expect(clearance).toBe(0.25)
    // Cell 0 as the job left it (free), cell 1 as the brush painted it.
    expect([...parsePgm(pgm as Uint8Array)!.pixels]).toEqual([PGM_FREE, PGM_FREE, PGM_FREE, PGM_FREE])
    expect(out.steps.map((s) => s.status)).toEqual(['done', 'done'])
    expect(out.steps[0].result).toMatchObject({ pointsDeleted: 412, cellsChanged: 30, keptNoEvidence: 4 })
    expect(seen.some((s) => s[0].status === 'running')).toBe(true)
  })

  it('sends no planning grid when there is no brush work (a floor without one)', async () => {
    const { api, calls } = fakeApi()
    const plan = planSave({ brush: null, staged: decide(EMPTY_STAGED, 'b1', 'remove') })
    expect(stepsFor(plan).map((s) => s.id)).toEqual(['cloud'])
    const out = await runSave(api, { mapId: map.map_id, floorIndex: 0, plan, pollMs: 0 })
    expect(out.ok).toBe(true)
    expect(calls).toEqual(['postCloudEdits', 'getMapJob', 'getMap'])
  })

  it('sends only the brush, over the grid it loaded, when nothing else changed', async () => {
    const { api, calls } = fakeApi()
    const out = await runSave(api, { mapId: map.map_id, floorIndex: 0, plan: planSave({ brush: diff(), staged: EMPTY_STAGED }), pollMs: 0 })
    expect(out.ok).toBe(true)
    expect(calls).toEqual(['putPlanning', 'getMap'])
    const pgm = (api.putMapPlanning as ReturnType<typeof vi.fn>).mock.calls[0][2] as Uint8Array
    expect([...parsePgm(pgm)!.pixels]).toEqual([PGM_OCCUPIED, PGM_FREE, PGM_FREE, PGM_FREE])
  })

  it('stops at a failed job with its sentence, and does not paint over a grid it could not clean', async () => {
    const msg = 'the map changed while this edit was being made; reload it and save again'
    const { api, calls } = fakeApi({ getMapJob: vi.fn(async () => job({ status: 'failed', error: msg })) })
    const plan = planSave({ brush: diff(), staged: decide(EMPTY_STAGED, 'b1', 'keep') })
    const out = await runSave(api, { mapId: map.map_id, floorIndex: 0, plan, pollMs: 0 })
    expect(out.ok).toBe(false)
    expect(out.steps).toEqual([{ id: 'cloud', status: 'failed', stage: 'queued', error: msg }, { id: 'planning', status: 'waiting' }])
    expect(calls).not.toContain('putPlanning')
    expect(calls[calls.length - 1]).toBe('getMap')
  })

  it("shows the server's refusal of a request", async () => {
    const { api } = fakeApi({ putMapPlanning: vi.fn(async () => { throw new ApiError(400, { detail: 'not a P5 PGM' }, 'PUT answered 400') }) })
    const out = await runSave(api, { mapId: map.map_id, floorIndex: 0, plan: planSave({ brush: diff(), staged: EMPTY_STAGED }), pollMs: 0 })
    expect(out.steps[0]).toMatchObject({ id: 'planning', status: 'failed', error: 'not a P5 PGM' })
  })

  it('sends Keep alone as a cloud edit with nothing to delete', async () => {
    const { api } = fakeApi()
    const plan = planSave({ brush: null, staged: decide(EMPTY_STAGED, 'b4', 'keep') })
    await runSave(api, { mapId: map.map_id, floorIndex: 0, plan, pollMs: 0 })
    const sent = (api.postCloudEdits as ReturnType<typeof vi.fn>).mock.calls[0][2] as CloudEdits
    expect(sent).toMatchObject({ delete_boxes: [], resolve_moved: [], keep_moved: ['b4'] })
    expect(api.putMapPlanning).not.toHaveBeenCalled()
  })
})
