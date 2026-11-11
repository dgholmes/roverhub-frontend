import { describe, expect, it } from 'vitest'
import { hashForSiteRun, parseRoute, runIdFromHash } from './routes'

describe('run links', () => {
  it('opens the Data workspace on the run', () => {
    const hash = hashForSiteRun('site a', '20261016-080503-prog-1-robot-01')
    expect(hash).toBe('#/site/site%20a/data/missions/20261016-080503-prog-1-robot-01')
    expect(parseRoute(hash)).toEqual({ kind: 'site', siteId: 'site a', workspace: 'Data' })
    expect(runIdFromHash(hash)).toBe('20261016-080503-prog-1-robot-01')
  })
  it('names no run on a plain workspace hash', () => {
    expect(runIdFromHash('#/site/a/data')).toBeNull()
    expect(runIdFromHash('#/site/a/missions')).toBeNull()
  })
})

describe('the Maps view of Missions', () => {
  it('has its own hash, which still opens the Missions workspace', async () => {
    const { hashForMissionsMaps, isMissionsMapsHash } = await import('./routes')
    const hash = hashForMissionsMaps('site a')
    expect(hash).toBe('#/site/site%20a/missions/maps')
    expect(parseRoute(hash)).toEqual({ kind: 'site', siteId: 'site a', workspace: 'Missions' })
    expect(isMissionsMapsHash(hash)).toBe(true)
  })
  it('is not named by the plain Missions hash or another workspace', async () => {
    const { isMissionsMapsHash } = await import('./routes')
    expect(isMissionsMapsHash('#/site/a/missions')).toBe(false)
    expect(isMissionsMapsHash('#/site/a/data/missions/maps')).toBe(false)
    expect(isMissionsMapsHash('#/site/a/missions/mapsx')).toBe(false)
  })
})
