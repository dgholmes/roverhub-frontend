// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { NavPathSample, NavPathView } from '@/liveops/navPath'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The provider is stood in: what this pins is how the hook reads its samples.
const feed = vi.hoisted(() => ({ listener: null as ((s: NavPathSample) => void) | null, subscribed: [] as string[] }))
vi.mock('@/lib/realtime/dataProvider', () => ({
  dataProvider: {
    subscribeNavPath: (robotId: string, l: (s: NavPathSample) => void) => {
      feed.subscribed.push(robotId)
      feed.listener = l
      return () => { feed.listener = null }
    },
  },
}))

import { useNavPath } from './useNavPath'
import { NAV_PATH_STALE_MS } from '@/liveops/navPath'

const frame = (over: Partial<NavPathSample['frame']> = {}): NavPathSample['frame'] => ({
  robot_id: 'r1', site_id: 's', map_id: 'map-office', goal_id: 'goal-1', captured_at: '',
  points: [[0, 0], [1, 1]], length_m: 1.41, planning_failed: false, ...over,
})

let host: HTMLDivElement
let root: Root
const seen: (NavPathView | null)[] = []
function Probe({ robotId, goalId, mapId }: { robotId: string | null; goalId: string | null; mapId: string }) {
  seen.push(useNavPath(robotId, goalId ? { goal_id: goalId } : null, mapId))
  return null
}
const render = (robotId: string | null = 'r1', goalId: string | null = 'goal-1', mapId = 'map-office') =>
  act(() => root.render(<Probe robotId={robotId} goalId={goalId} mapId={mapId} />))
const last = () => seen[seen.length - 1]
const send = (over: Partial<NavPathSample['frame']> = {}) => act(() => feed.listener?.({ frame: frame(over), receivedAt: Date.now() }))

beforeEach(() => {
  vi.useFakeTimers()
  seen.length = 0
  feed.listener = null
  feed.subscribed = []
  host = document.createElement('div')
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  vi.useRealTimers()
})

describe('useNavPath', () => {
  it('is the walk’s route once a frame for it arrives, and the same object until the next', () => {
    render()
    expect(last()).toBeNull()
    send()
    expect(last()).toEqual({ points: [[0, 0], [1, 1]], failed: false, lengthM: 1.41 })
    const first = last()
    render()
    expect(last()).toBe(first)
  })

  it('falls back to the dashed line on its own once the frame is NAV_PATH_STALE_MS old', () => {
    render()
    send()
    expect(last()).not.toBeNull()
    act(() => { vi.advanceTimersByTime(NAV_PATH_STALE_MS + 5) })
    expect(last()).toBeNull()
  })

  it('ignores a frame for another goal or another map, and clears on the ended frame', () => {
    render()
    send({ goal_id: 'goal-0' })
    expect(last()).toBeNull()
    send({ map_id: 'map-lab' })
    expect(last()).toBeNull()
    send()
    expect(last()).not.toBeNull()
    send({ points: [], length_m: null })
    expect(last()).toBeNull()
  })

  it('drops the path when the goal stops being active', () => {
    render()
    send()
    render('r1', null)
    expect(last()).toBeNull()
  })

  it('subscribes to nothing while the map is off', () => {
    render(null)
    expect(feed.subscribed).toEqual([])
  })
})
