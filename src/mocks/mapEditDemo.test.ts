import { describe, expect, it } from 'vitest'
import { parsePgm } from '@/missions/floorCells'
import { encodePgm, PGM_FREE, PGM_OCCUPIED } from '@/components/maps/editor/gridEdit'
import { parsePcd } from '@/components/maps/editor/pcd'
import type { SiteMap } from '@/types/maps'
import { demoFloorFiles } from './mapEditDemo'
import { MockMapPipeline } from './mapPipeline'
import { mockMaps } from './maps'

function setup() {
  let now = Date.parse('2026-11-16T05:00:00Z')
  const maps = new Map<string, SiteMap>(mockMaps.map((m) => [m.map_id, m]))
  const pipeline = new MockMapPipeline({ get: (id) => maps.get(id) ?? null, put: (m) => { maps.set(m.map_id, m) } }, { now: () => now, uploadStepMs: 0 })
  return { pipeline, maps, advance: (ms: number) => { now += ms } }
}
const venue = mockMaps[0]

describe('the demo floor', () => {
  it('has six people in the moved layer, biggest first, each blocked in the survey grid', () => {
    const files = demoFloorFiles(venue.floors[0])
    const [w, h] = venue.floors[0].size_cells
    expect(files.grid).toHaveLength(w * h)
    expect(files.moved.blobs.map((b) => b.id)).toEqual(['b001', 'b002', 'b003', 'b004', 'b005', 'b006'])
    const f = venue.floors[0]
    for (const b of files.moved.blobs) {
      const i = Math.floor((b.centroid[0] - f.origin_xy_m[0]) / f.resolution_m)
      const j = Math.floor((b.centroid[1] - f.origin_xy_m[1]) / f.resolution_m)
      expect(files.grid[(h - 1 - j) * w + i]).toBe(PGM_OCCUPIED)
    }
    expect(files.movedCloud.length).toBeGreaterThan(0)
  })
})

describe('editing in demo mode', () => {
  it('serves the files, with a planning grid that blocks the desks the survey slice misses', () => {
    const { pipeline } = setup()
    const grid = parsePgm(new Uint8Array(pipeline.floorFile(venue.map_id, 0, 'grid')!))!
    const planning = parsePgm(new Uint8Array(pipeline.floorFile(venue.map_id, 0, 'planning')!))!
    expect(grid.width).toBe(400)
    expect([planning.width, planning.height]).toEqual([grid.width, grid.height])
    const desks = [...planning.pixels].filter((v, k) => v === PGM_OCCUPIED && grid.pixels[k] === PGM_FREE).length
    expect(desks).toBeGreaterThan(0)
    expect(parsePcd(pipeline.floorFile(venue.map_id, 0, 'moved_cloud')!)!.length).toBeGreaterThan(0)
    expect(pipeline.movedLayer(venue.map_id, 0)!.blobs).toHaveLength(6)
  })

  it('makes a version per save, drops the active map to draft, and frees the cells under a removed spot', () => {
    const { pipeline, maps, advance } = setup()
    const grid = parsePgm(new Uint8Array(pipeline.floorFile(venue.map_id, 0, 'planning')!))!
    const saved = pipeline.putPlanning(venue.map_id, 0, encodePgm(grid.width, grid.height, grid.pixels), 0.2)
    expect(saved.status).toBe('draft')
    expect(saved.floors[0].planning?.free_cells).toBeGreaterThan(0)
    expect(pipeline.listVersions(venue.map_id).map((v) => [v.version, v.source])).toEqual([[3, 'planning'], [2, 'survey'], [1, 'upload']])

    const b = pipeline.movedLayer(venue.map_id, 0)!.blobs[0]
    const job = pipeline.cloudEdits(venue.map_id, 0, { delete_boxes: [], resolve_moved: [b.id], keep_moved: ['b002'] })
    advance(5000)
    const done = pipeline.getJob(job.job_id)
    expect(done.status).toBe('succeeded')
    expect(done.result).toMatchObject({ resolved_moved: [b.id], kept_moved: ['b002'], moved_blobs_left: 4, planning: { rerasterised: true } })
    expect((done.result!.planning as { freed_cells: number }).freed_cells).toBeGreaterThan(0)
    const planning = parsePgm(new Uint8Array(pipeline.floorFile(venue.map_id, 0, 'planning')!))!
    const f = maps.get(venue.map_id)!.floors[0]
    const i = Math.floor((b.centroid[0] - f.origin_xy_m[0]) / f.resolution_m)
    const j = Math.floor((b.centroid[1] - f.origin_xy_m[1]) / f.resolution_m)
    expect(planning.pixels[(planning.height - 1 - j) * planning.width + i]).toBe(PGM_FREE)
    expect(pipeline.movedLayer(venue.map_id, 0)!.blobs.map((x) => x.id)).not.toContain('b002')
    expect(pipeline.listVersions(venue.map_id)[0]).toMatchObject({ version: 4, source: 'cloud_edit' })
  })

  it('restoring a version brings its files back', () => {
    const { pipeline } = setup()
    const read = () => parsePgm(new Uint8Array(pipeline.floorFile(venue.map_id, 0, 'planning')!))!
    const before = read()
    pipeline.putPlanning(venue.map_id, 0, encodePgm(before.width, before.height, new Uint8Array(before.pixels.length).fill(PGM_OCCUPIED)))
    expect(read().pixels.every((v) => v === PGM_OCCUPIED)).toBe(true)
    pipeline.restore(venue.map_id, 2)
    expect([...read().pixels]).toEqual([...before.pixels])
  })
})
