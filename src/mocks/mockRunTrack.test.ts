import { describe, expect, it } from 'vitest'
import { TRACE_COLUMNS } from '@/types'
import { mockMissionLibrary } from './mockMissionLibrary'
import { mockRunTrack } from './mockRunTrack'

const run = (i: number) => ({
  run_id: 'r1', started_at: '2026-11-27T01:00:00Z', ended_at: '2026-11-27T01:14:00Z', mission: mockMissionLibrary[i],
})

describe('mockRunTrack', () => {
  it('a trace carries every TRACE_COLUMN, all the same length, plans, legs and video', () => {
    const t = mockRunTrack(run(1), 'trace')
    expect(Object.keys(t.columns).sort()).toEqual([...TRACE_COLUMNS].sort())
    const n = t.columns.t!.length
    expect(n).toBe(14 * 60 * 5 + 1)
    for (const c of Object.values(t.columns)) expect(c).toHaveLength(n)
    expect(t.legs).toHaveLength(mockMissionLibrary[1].waypoints.length)
    expect(t.plans.length).toBeGreaterThan(t.legs.length)
    expect(t.video.front.offset_s).toBeGreaterThan(0)
    expect(t.columns.x!.some((v) => v === null)).toBe(true)
  })
  it('history carries only what the 5 s samples have', () => {
    const t = mockRunTrack(run(0), 'history')
    expect(Object.keys(t.columns).sort()).toEqual(['control_owner', 'meas_vx', 'state', 't', 'x', 'y', 'yaw'])
    expect(t.video).toEqual({})
  })
  it('none has no samples', () => {
    expect(mockRunTrack(run(0), 'none').columns).toEqual({})
  })
})
