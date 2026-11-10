import { describe, expect, it } from 'vitest'
import { hashForMissionEditor, hashForMissionsMaps, hashForMissionsSchedule, hashForSiteWorkspace } from '@/app/routes'
import { missionsLocation, resolveMissionLink, viewForHash } from './missionsView'
import type { MissionLibraryEntry } from '@/types'

const maps = hashForMissionsMaps('s1')
const plain = hashForSiteWorkspace('s1', 'Missions')
const schedule = hashForMissionsSchedule('s1')

describe('viewForHash', () => {
  it("goes to Maps when the hash is Maps'", () => {
    expect(viewForHash(maps)).toBe('maps')
  })

  it("goes to Schedule when the hash is Schedule's, whichever of its views", () => {
    expect(viewForHash(schedule)).toBe('schedule')
    expect(viewForHash(hashForMissionsSchedule('s1', 'calendar'))).toBe('schedule')
  })

  it('goes to the library on the plain Missions hash (Back, or the sidebar item)', () => {
    expect(viewForHash(plain)).toBe('missions')
  })

  it('goes to the library under an open mission', () => {
    expect(viewForHash(hashForMissionEditor('s1', 'm1'))).toBe('missions')
  })
})

describe('missionsLocation', () => {
  it('reads the view, the schedule view and the open mission from one hash', () => {
    expect(missionsLocation(plain)).toEqual({ view: 'missions', scheduleView: null, missionId: null, tab: null })
    expect(missionsLocation(hashForMissionsSchedule('s1', 'tasks')))
      .toEqual({ view: 'schedule', scheduleView: 'tasks', missionId: null, tab: null })
    expect(missionsLocation(hashForMissionEditor('s1', 'm1', 'program')))
      .toEqual({ view: 'missions', scheduleView: null, missionId: 'm1', tab: 'program' })
  })
})

describe('resolveMissionLink', () => {
  const missions = [{ mission_id: 'm1' }] as MissionLibraryEntry[]
  it('opens a mission the library has', () => {
    expect(resolveMissionLink('m1', missions, true)).toBe('open')
  })
  it('waits while the library is still loading, rather than calling the link dead', () => {
    expect(resolveMissionLink('m1', [], false)).toBe('wait')
    expect(resolveMissionLink('gone', missions, false)).toBe('wait')
  })
  it('calls a link to a mission that no longer exists missing once the library is in', () => {
    expect(resolveMissionLink('gone', missions, true)).toBe('missing')
  })
})
