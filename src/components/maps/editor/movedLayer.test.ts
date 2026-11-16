import { describe, expect, it } from 'vitest'
import { blobAt, blobOutline, cloudEditsResult, parseMovedLayer, withoutBlobs } from './movedLayer'
import { parsePcd } from './pcd'

const raw = {
  version: 1, source: 'transient_filter 0.1', params: { voxel_m: 0.1 },
  blobs: [
    { id: 'b002', centroid: [1, 1], bbox: [0.9, 0.9, 1.1, 1.1], z_range: [0, 1], area_m2: 0.04, points: 10, hits: 3, pass_through: 12 },
    { id: 'b001', centroid: [2, 2], bbox: [2.3, 2.3, 1.7, 1.7], z_range: [1.6, 0.1], area_m2: 0.36, points: 400, hits: 37, pass_through: 41,
      polygon: [[1.7, 1.7], [2.3, 1.7], [2.3, 2.3]] },
    { id: 'bad', centroid: [1], bbox: [0, 0, 1, 1], z_range: [0, 1] },
    { id: 'b001', centroid: [9, 9], bbox: [9, 9, 9, 9], z_range: [0, 1], area_m2: 5 },
  ],
}

describe('the moved layer', () => {
  it('sorts biggest first, puts boxes in order, and drops malformed or repeated blobs', () => {
    const layer = parseMovedLayer(raw)!
    expect(layer.blobs.map((b) => b.id)).toEqual(['b001', 'b002'])
    expect(layer.blobs[0].bbox).toEqual([1.7, 1.7, 2.3, 2.3])
    expect(layer.blobs[0].z_range).toEqual([0.1, 1.6])
    expect(layer.blobs[0].polygon).toHaveLength(3)
    expect(parseMovedLayer({ nope: true })).toBeNull()
    expect(parseMovedLayer(null)).toBeNull()
  })

  it('outlines a blob by its polygon, else its box; picks the smallest under a point', () => {
    const layer = parseMovedLayer(raw)!
    expect(blobOutline(layer.blobs[1])).toEqual([[0.9, 0.9], [1.1, 0.9], [1.1, 1.1], [0.9, 1.1]])
    expect(blobAt(layer.blobs, 1.05, 1.05)?.id).toBe('b002')
    expect(blobAt(layer.blobs, 1.18, 1.0)?.id).toBe('b002')  // within the 10 cm margin
    expect(blobAt(layer.blobs, 5, 5)).toBeNull()
    expect(withoutBlobs(layer, ['b001']).blobs.map((b) => b.id)).toEqual(['b002'])
  })

  it("reads the backend's cloud-edits result", () => {
    const r = cloudEditsResult({ result: {
      map_id: 'm', floor: 0, version: 5, previous_version: 4, status: 'draft', points_removed: 812,
      resolved_moved: ['b001', 'b002'], kept_moved: ['b003'], moved_blobs_left: 3, quality_job_id: 'q',
      planning: { rerasterised: true, reason: null, freed_cells: 40, kept_no_evidence_cells: 6 },
    } })
    expect(r).toEqual({ pointsDeleted: 812, blobsResolved: 2, cellsChanged: 40, keptNoEvidence: 6, defaultsUsed: false, note: null })
    const none = cloudEditsResult({ result: { points_removed: 3, planning: { rerasterised: false, reason: 'the floor has no planning grid' } } })
    expect(none.note).toBe('the floor has no planning grid')
    expect(cloudEditsResult({ result: null })).toMatchObject({ pointsDeleted: null, keptNoEvidence: 0 })
  })
})

const enc = (s: string) => new TextEncoder().encode(s)

describe('reading a .pcd', () => {
  const head = (data: string, n: number, fields = 'x y z intensity', size = '4 4 4 4', type = 'F F F F') =>
    `# .PCD v0.7\nVERSION 0.7\nFIELDS ${fields}\nSIZE ${size}\nTYPE ${type}\nCOUNT 1 1 1 1\nWIDTH ${n}\nHEIGHT 1\nPOINTS ${n}\nDATA ${data}\n`

  it('reads ascii x, y, z and ignores other fields', () => {
    const xyz = parsePcd(enc(head('ascii', 2) + '1 2 3 9\n4 5 6 9\n').buffer)!
    expect([...xyz]).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('reads binary with the fields at their offsets', () => {
    const h = enc(head('binary', 2))
    const buf = new Uint8Array(h.length + 2 * 16)
    buf.set(h)
    const v = new DataView(buf.buffer, h.length)
    ;[1, 2, 3, 7, 4, 5, 6, 7].forEach((x, k) => v.setFloat32(k * 4, x, true))
    expect([...parsePcd(buf.buffer)!]).toEqual([1, 2, 3, 4, 5, 6])
  })

  it('refuses what it cannot read rather than guess', () => {
    expect(parsePcd(enc(head('binary_compressed', 1)).buffer)).toBeNull()
    expect(parsePcd(enc(head('ascii', 2) + '1 2 3 9\n').buffer)).toBeNull()         // short
    expect(parsePcd(enc(head('binary', 2)).buffer)).toBeNull()                       // no body
    expect(parsePcd(enc(head('ascii', 1, 'x y i j', '4 4 4 4') + '1 2 3 4\n').buffer)).toBeNull() // no z
    expect(parsePcd(enc('not a pcd').buffer)).toBeNull()
  })
})
