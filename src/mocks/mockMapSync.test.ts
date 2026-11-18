import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Command } from '@/types'
import { MOCK_VENUE_HASH, MOCK_VENUE_OLD_HASH, mockContentHash } from './maps'
import { MockDataProvider } from './mockDataProvider'

/** Send to robot (SYNC_MAP, 0.0.26) through the mock provider, as demo mode runs it. */

let provider: MockDataProvider
beforeEach(() => {
  vi.useFakeTimers()
  provider = new MockDataProvider()
})
afterEach(() => {
  provider.dispose()
  vi.useRealTimers()
})

const sync = (robotId: string, params: Record<string, unknown>) => {
  const seen: Command[] = []
  provider.dispatchCommand(robotId, 'SYNC_MAP', 'Send map to robot', (c) => seen.push(c), params)
  return seen
}
const hashOf = (robotId: string) => provider.getRobots().find((r) => r.robot_id === robotId)?.bridge?.nav_map_hash
const venue = { map_id: 'map-venue-survey', floor_index: 0, map_hash: MOCK_VENUE_HASH }

describe('mock SYNC_MAP', () => {
  it('seeds a robot on an older version of the venue floor', () => {
    expect(hashOf('zaezae-x1-002')).toBe(MOCK_VENUE_OLD_HASH)
    expect(MOCK_VENUE_HASH).toMatch(/^[0-9a-f]{64}$/)
    expect(MOCK_VENUE_HASH).not.toBe(MOCK_VENUE_OLD_HASH)
  })

  it("makes the robot's hash the floor's after about 2 s, and says it must be placed again", async () => {
    const seen = sync('zaezae-x1-002', venue)
    await vi.advanceTimersByTimeAsync(2000)
    expect(hashOf('zaezae-x1-002')).toBe(MOCK_VENUE_OLD_HASH)
    await vi.advanceTimersByTimeAsync(600)
    const last = seen[seen.length - 1]
    expect(last.current_stage).toBe('execution_completed')
    expect(last.result).toEqual({ map_hash: MOCK_VENUE_HASH, changed: ['localisation', 'planning', 'zones'], relocalise: true })
    expect(hashOf('zaezae-x1-002')).toBe(MOCK_VENUE_HASH)
  })

  it('refuses a robot on a mission, as the bridge would', async () => {
    const seen = sync('zaezae-x1-001', venue)
    await vi.advanceTimersByTimeAsync(500)
    expect(seen[seen.length - 1].current_stage).toBe('execution_failed')
    expect(seen[seen.length - 1].failure_reason).toMatch(/^REJECTED_RUN_ACTIVE/)
    expect(hashOf('zaezae-x1-001')).toBe(MOCK_VENUE_OLD_HASH)
  })

  it('refuses another map, and a hash the floor no longer has', async () => {
    const other = sync('zaezae-x1-002', { ...venue, map_id: 'map-elsewhere' })
    const stale = sync('zaezae-x1-002', { ...venue, map_hash: mockContentHash('gone') })
    await vi.advanceTimersByTimeAsync(500)
    expect(other[other.length - 1].failure_reason).toMatch(/^REJECTED_NAV_MAP_MISMATCH: this robot is set up for map map-venue-survey/)
    expect(stale[stale.length - 1].failure_reason).toMatch(/^sending the map failed: .*nothing was changed$/)
    expect(hashOf('zaezae-x1-002')).toBe(MOCK_VENUE_OLD_HASH)
  })

  it('gives the floor a new hash when its zones change', async () => {
    const before = (await provider.getMap('map-venue-survey'))!.floors[0].content_hash
    const after = (await provider.saveMapZones('map-venue-survey', []))!.floors[0].content_hash
    expect(after).toMatch(/^[0-9a-f]{64}$/)
    expect(after).not.toBe(before)
  })
})
