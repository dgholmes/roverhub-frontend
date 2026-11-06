import { describe, expect, it } from 'vitest'
import type { MissionLibraryEntry, MissionTask } from '@/types'
import { filterKey, filterLibrary, libraryCard, libraryFilters, previewed } from './libraryCards'

const wp = (id: string, snaps = 0) => ({
  waypoint_id: id, label: id, x_m: 0, y_m: 0, z_m: null, heading_deg: null, tolerance_m: 0.5, status: 'pending',
  actions: Array.from({ length: snaps }, () => ({ type: 'snapshot', label: 'Snapshot', params: {} })),
})
const m = (id: string, over: Partial<MissionLibraryEntry> = {}) => ({
  mission_id: id, name: id, type: 'patrol', kind: 'route', version: 1, creator: 'x',
  updated_at: '2026-11-01T00:00:00Z', map_id: null, segments: [], waypoints: [], ...over,
}) as unknown as MissionLibraryEntry

describe('libraryFilters', () => {
  it('offers All, the types present in order, and Program when there is one', () => {
    const fs = libraryFilters([m('a', { type: 'inspection' }), m('b', { type: 'patrol' }), m('c', { kind: 'program', type: 'inspection' })])
    expect(fs.map(filterKey)).toEqual(['all', 'type:patrol', 'type:inspection', 'program'])
  })

  it('offers no Program chip without a program', () => {
    expect(libraryFilters([m('a')]).map(filterKey)).toEqual(['all', 'type:patrol'])
  })
})

describe('filterLibrary', () => {
  const list = [
    m('Old patrol', { updated_at: '2026-10-01T00:00:00Z' }),
    m('New inspection', { type: 'inspection', updated_at: '2026-11-02T00:00:00Z' }),
    m('Lobby program', { kind: 'program', type: 'inspection', updated_at: '2026-11-03T00:00:00Z' }),
  ]

  it('sorts newest edit first', () => {
    expect(filterLibrary(list, { kind: 'all' }, '').map((x) => x.name)).toEqual(['Lobby program', 'New inspection', 'Old patrol'])
  })

  it('filters by type, by program, and by name', () => {
    expect(filterLibrary(list, { kind: 'type', type: 'inspection' }, '').map((x) => x.name)).toEqual(['Lobby program', 'New inspection'])
    expect(filterLibrary(list, { kind: 'program' }, '').map((x) => x.name)).toEqual(['Lobby program'])
    expect(filterLibrary(list, { kind: 'all' }, '  PATROL ').map((x) => x.name)).toEqual(['Old patrol'])
  })
})

describe('libraryCard', () => {
  it('counts steps and photos, and the tasks using the mission', () => {
    const tasks = [
      { mission_id: 'a', status: 'enabled' }, { mission_id: 'a', status: 'archived' }, { mission_id: 'b', status: 'paused' },
    ] as unknown as MissionTask[]
    expect(libraryCard(m('a', { waypoints: [wp('1'), wp('2', 2)] } as never), tasks)).toEqual({ steps: 2, photos: 2, taskCount: 1 })
  })

  it('makes no claim about tasks before they load', () => {
    expect(libraryCard(m('a'), null).taskCount).toBeNull()
  })
})

describe('previewed', () => {
  it('keeps the picked mission while it is listed, else falls back to the first', () => {
    const list = [m('a'), m('b')]
    expect(previewed(list, 'b')?.mission_id).toBe('b')
    expect(previewed(list, 'gone')?.mission_id).toBe('a')
    expect(previewed([], 'a')).toBeNull()
  })
})
