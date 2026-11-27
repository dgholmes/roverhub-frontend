import { describe, expect, it, vi } from 'vitest'
import { createRunCursor } from './runCursor'

describe('createRunCursor', () => {
  it('tells subscribers who moved it, and not when nothing changed', () => {
    const c = createRunCursor()
    const fn = vi.fn()
    const off = c.subscribe(fn)
    c.set(3, 'video')
    c.set(3, 'user')
    c.set(Number.NaN)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith('video')
    expect(c.get()).toBe(3)
    off()
    c.set(4)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
