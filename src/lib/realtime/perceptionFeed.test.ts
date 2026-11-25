import { describe, expect, it } from 'vitest'
import type { PerceptionStatus } from '@/types'
import { PerceptionFeed, parsePerceptionStatus } from './perceptionFeed'

const status = (over: Partial<PerceptionStatus> = {}): PerceptionStatus => ({
  robot_id: 'rover-a', site_id: 'site-dev', at: '2026-11-25T10:00:00+00:00', camera: 'front',
  source_state: 'live', fps: 9.8, detectors: [],
  enabled: true, selected: ['base.person'], off_reason: null,
  ...over,
})

describe('parsePerceptionStatus', () => {
  it('keeps a well-formed status as it came', () => {
    const s = status()
    expect(parsePerceptionStatus(s)).toEqual(s)
  })

  it('accepts a status from a perception older than 0.0.31 (no setting fields)', () => {
    const { enabled: _e, selected: _s, off_reason: _o, ...older } = status()
    expect(parsePerceptionStatus(older)).toEqual(older)
  })

  it.each([
    ['not an object', 'nope'],
    ['null', null],
    ['no robot_id', { ...status(), robot_id: undefined }],
    ['no detectors list', { ...status(), detectors: 'all' }],
  ])('drops %s', (_why, raw) => {
    expect(parsePerceptionStatus(raw)).toBeNull()
  })
})

describe('PerceptionFeed', () => {
  it('hands a new subscriber the latest status of its robot at once, then each change', () => {
    const feed = new PerceptionFeed()
    feed.publish(status())
    feed.publish(status({ robot_id: 'rover-b' }))
    const seen: PerceptionStatus[] = []
    const off = feed.subscribe('rover-a', (s) => seen.push(s))
    expect(seen.map((s) => s.robot_id)).toEqual(['rover-a'])
    feed.publish(status({ enabled: false, off_reason: 'switched_off' }))
    feed.publish(status({ robot_id: 'rover-b', enabled: false }))
    expect(seen).toHaveLength(2)
    expect(seen[1].enabled).toBe(false)
    off()
    feed.publish(status())
    expect(seen).toHaveLength(2)
  })

  it('answers get() with the latest status, or undefined for a robot that never sent one', () => {
    const feed = new PerceptionFeed()
    feed.handleRaw(status({ off_reason: 'survey' }))
    expect(feed.get('rover-a')?.off_reason).toBe('survey')
    expect(feed.get('rover-b')).toBeUndefined()
  })

  it('drops a malformed payload without touching the stored one', () => {
    const feed = new PerceptionFeed()
    feed.handleRaw(status())
    feed.handleRaw({ robot_id: 'rover-a' })
    expect(feed.get('rover-a')?.enabled).toBe(true)
  })

  it('clear() drops the listeners and keeps nothing', () => {
    const feed = new PerceptionFeed()
    const seen: PerceptionStatus[] = []
    feed.subscribe('rover-a', (s) => seen.push(s))
    feed.clear()
    feed.publish(status())
    expect(seen).toEqual([])
  })
})
