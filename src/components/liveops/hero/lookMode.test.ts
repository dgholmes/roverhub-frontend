import { describe, expect, it } from 'vitest'
import { driveDirectionsDuringLook } from './lookMode'
import type { Direction } from './manualControlMath'

describe('driveDirectionsDuringLook', () => {
  it('drives nothing while looking, whatever is held', () => {
    expect(driveDirectionsDuringLook(new Set<Direction>(['forward']), true).size).toBe(0)
  })

  it('drives what is held once the look ends', () => {
    expect([...driveDirectionsDuringLook(new Set<Direction>(['forward']), false)]).toEqual(['forward'])
  })

  it('resumes only keys still held at release, not ones tapped during the look', () => {
    const held = new Set<Direction>(['forward'])
    held.add('strafeLeft')
    held.delete('strafeLeft')
    expect([...driveDirectionsDuringLook(held, false)]).toEqual(['forward'])
  })
})
