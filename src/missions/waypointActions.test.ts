import { describe, expect, it } from 'vitest'
import { followOpen, moveWaypointAction, newWaypointAction, removeWaypointAction, updateWaypointAction } from './waypointActions'

describe('waypoint actions', () => {
  const list = [newWaypointAction('snapshot', 'Photo'), newWaypointAction('video_clip', 'Video'), newWaypointAction('wait', 'Wait')]
  it('creates actions with their defaults', () => {
    expect(list[0].params).toEqual({ camera: 'front' })
    expect(list[1].params).toEqual({ camera: 'front', seconds: 15 })
    expect(newWaypointAction('voice_prompt', 'A').params).toEqual({ volume: 100 })
  })
  it('allows the same type twice', () => {
    expect([...list, newWaypointAction('snapshot', 'Photo')].filter((a) => a.type === 'snapshot')).toHaveLength(2)
  })
  it('moves, removes and updates by index without mutating', () => {
    expect(moveWaypointAction(list, 2, 0).map((a) => a.type)).toEqual(['wait', 'snapshot', 'video_clip'])
    expect(moveWaypointAction(list, 0, 5)).toBe(list)
    expect(removeWaypointAction(list, 1).map((a) => a.type)).toEqual(['snapshot', 'wait'])
    expect(updateWaypointAction(list, 1, { seconds: 30 })[1].params).toEqual({ camera: 'front', seconds: 30 })
    expect(list[1].params).toEqual({ camera: 'front', seconds: 15 })
  })
})

describe('followOpen', () => {
  it('keeps the expanded panel on the action it belongs to', () => {
    expect(followOpen(2, 2, 0)).toBe(0)
    expect(followOpen(0, 2, 0)).toBe(1)
    expect(followOpen(1, 2, 0)).toBe(2)
    expect(followOpen(1, 0, 2)).toBe(0)
    expect(followOpen(3, 2, 0)).toBe(3)
    expect(followOpen(null, 2, 0)).toBeNull()
  })
})
