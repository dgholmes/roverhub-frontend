import { describe, expect, it } from 'vitest'
import { siteThumbnailMap } from './siteRecords'

const m = (map_id: string, status: string, updated_at: string) => ({ map_id, status, updated_at })
const maps = [
  m('older-active', 'active', '2026-11-20T06:00:00Z'),
  m('newer-active', 'active', '2026-11-24T06:00:00Z'),
  m('newest-draft', 'draft', '2026-11-25T06:00:00Z'),
]

describe('siteThumbnailMap', () => {
  it('pictures the map the site\'s robots have loaded, so their dots land on it', () => {
    expect(siteThumbnailMap(maps, ['older-active', null])?.map_id).toBe('older-active')
  })
  it('takes the map most robots carry when they differ', () => {
    expect(siteThumbnailMap(maps, ['newer-active', 'older-active', 'older-active'])?.map_id).toBe('older-active')
  })
  it('ignores a robot map the site does not have', () => {
    expect(siteThumbnailMap(maps, ['elsewhere'])?.map_id).toBe('newer-active')
  })
  it('falls back to the newest active map, then the newest map', () => {
    expect(siteThumbnailMap(maps)?.map_id).toBe('newer-active')
    expect(siteThumbnailMap([m('a', 'draft', '2026-11-01T00:00:00Z'), m('b', 'draft', '2026-11-02T00:00:00Z')])?.map_id).toBe('b')
    expect(siteThumbnailMap([])).toBeNull()
  })
})
