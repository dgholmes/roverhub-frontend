import { describe, expect, it } from 'vitest'
import { mergeSites, siteLocalTime } from './sites'

describe('mergeSites', () => {
  it('adds sites that only robots know about, after the known ones', () => {
    const merged = mergeSites(
      [{ id: 'site-a', name: 'A' }],
      [{ site_id: 'site-a' }, { site_id: 'site-z' }, { site_id: 'site-b' }, { site_id: 'site-b' }],
    )
    expect(merged.map((s) => [s.id, s.discovered])).toEqual([['site-a', false], ['site-b', true], ['site-z', true]])
  })
  it('ignores robots whose site is unknown', () => {
    expect(mergeSites([], [{ site_id: 'unknown' }, { site_id: '' }])).toEqual([])
  })
})

describe('siteLocalTime', () => {
  const noonUtc = new Date('2026-10-13T12:00:00Z')
  it('formats the time in the site timezone', () => expect(siteLocalTime('Asia/Seoul', noonUtc)).toBe('21:00'))
  it('is null without a timezone', () => expect(siteLocalTime(undefined, noonUtc)).toBeNull())
  it('is null for an invalid timezone', () => expect(siteLocalTime('Mars/Base', noonUtc)).toBeNull())
})
