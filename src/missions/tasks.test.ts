import { describe, expect, it } from 'vitest'
import { moveTask, newTask, removeTask, updateTask } from './tasks'

describe('tasks', () => {
  const list = [newTask('snapshot', 'Photo'), newTask('video_clip', 'Video'), newTask('wait', 'Wait')]
  it('creates tasks with their defaults', () => {
    expect(list[0].params).toEqual({ camera: 'front' })
    expect(list[1].params).toEqual({ camera: 'front', seconds: 15 })
    expect(newTask('voice_prompt', 'A').params).toEqual({ volume: 100 })
  })
  it('allows the same type twice', () => {
    expect([...list, newTask('snapshot', 'Photo')].filter((a) => a.type === 'snapshot')).toHaveLength(2)
  })
  it('moves, removes and updates by index without mutating', () => {
    expect(moveTask(list, 2, 0).map((a) => a.type)).toEqual(['wait', 'snapshot', 'video_clip'])
    expect(moveTask(list, 0, 5)).toBe(list)
    expect(removeTask(list, 1).map((a) => a.type)).toEqual(['snapshot', 'wait'])
    expect(updateTask(list, 1, { seconds: 30 })[1].params).toEqual({ camera: 'front', seconds: 30 })
    expect(list[1].params).toEqual({ camera: 'front', seconds: 15 })
  })
})
