import { describe, expect, it } from 'vitest'
import { hashForMissionsMaps, hashForSiteWorkspace } from '@/app/routes'
import { viewForHash } from './missionsView'

const maps = hashForMissionsMaps('s1')
const plain = hashForSiteWorkspace('s1', 'Missions')

describe('viewForHash', () => {
  it("goes to Maps when the hash is Maps'", () => {
    expect(viewForHash(maps, 'missions')).toBe('maps')
    expect(viewForHash(maps, 'schedule')).toBe('maps')
  })

  it('leaves Maps for the library when the hash is the plain Missions one (Back, or the sidebar item)', () => {
    expect(viewForHash(plain, 'maps')).toBe('missions')
  })

  it('leaves Schedule and the library where they are', () => {
    expect(viewForHash(plain, 'schedule')).toBe('schedule')
    expect(viewForHash(plain, 'missions')).toBe('missions')
  })
})
