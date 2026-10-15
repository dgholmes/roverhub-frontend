import { describe, expect, it } from 'vitest'
import { otherSitesWithRobots, robotsForSite } from './siteRobots'

const robots = [
  { robot_id: 'a', site_id: 'north' },
  { robot_id: 'b', site_id: 'harbour' },
  { robot_id: 'c', site_id: 'north' },
  { robot_id: 'd', site_id: 'unknown' },
  { robot_id: 'e', site_id: 'dev' },
]

describe('robotsForSite', () => {
  it('keeps only robots reporting that site, in order', () => {
    expect(robotsForSite(robots, 'north').map((r) => r.robot_id)).toEqual(['a', 'c'])
  })
  it('is empty for a site no robot reports', () => {
    expect(robotsForSite(robots, 'plant-3')).toEqual([])
  })
})

describe('otherSitesWithRobots', () => {
  it('lists the other sites with counts, skipping unknown', () => {
    expect(otherSitesWithRobots(robots, 'north')).toEqual([
      { siteId: 'dev', count: 1 },
      { siteId: 'harbour', count: 1 },
    ])
  })
})
