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

describe('the Schedule view of Missions', () => {
  it('has its own hash, which still opens the Missions workspace', async () => {
    const { hashForMissionsSchedule, scheduleViewFromHash } = await import('./routes')
    const hash = hashForMissionsSchedule('site a')
    expect(hash).toBe('#/site/site%20a/missions/schedule')
    expect(parseRoute(hash)).toEqual({ kind: 'site', siteId: 'site a', workspace: 'Missions' })
    expect(scheduleViewFromHash(hash)).toBe('runs')
  })
  it('names the Tasks and Calendar views, with Runs as the default', async () => {
    const { hashForMissionsSchedule, scheduleViewFromHash } = await import('./routes')
    expect(hashForMissionsSchedule('s', 'runs')).toBe('#/site/s/missions/schedule')
    expect(hashForMissionsSchedule('s', 'tasks')).toBe('#/site/s/missions/schedule/tasks')
    expect(hashForMissionsSchedule('s', 'calendar')).toBe('#/site/s/missions/schedule/calendar')
    expect(scheduleViewFromHash('#/site/s/missions/schedule/tasks')).toBe('tasks')
    expect(scheduleViewFromHash('#/site/s/missions/schedule/calendar')).toBe('calendar')
    // A view this build does not have opens the default rather than nothing.
    expect(scheduleViewFromHash('#/site/s/missions/schedule/gantt')).toBe('runs')
  })
  it('is not named by other hashes', async () => {
    const { scheduleViewFromHash } = await import('./routes')
    expect(scheduleViewFromHash('#/site/a/missions')).toBeNull()
    expect(scheduleViewFromHash('#/site/a/missions/maps')).toBeNull()
    expect(scheduleViewFromHash('#/site/a/missions/schedulex')).toBeNull()
    expect(scheduleViewFromHash('#/site/a/data/missions/schedule')).toBeNull()
  })
})

describe('mission editor links', () => {
  it('names the open mission, and its tab when given', async () => {
    const { hashForMissionEditor, missionEditorFromHash } = await import('./routes')
    const hash = hashForMissionEditor('site a', 'mission/1 x')
    expect(hash).toBe('#/site/site%20a/missions/edit/mission%2F1%20x')
    expect(parseRoute(hash)).toEqual({ kind: 'site', siteId: 'site a', workspace: 'Missions' })
    expect(missionEditorFromHash(hash)).toEqual({ missionId: 'mission/1 x', tab: null })
    const withTab = hashForMissionEditor('s', 'm1', 'settings')
    expect(withTab).toBe('#/site/s/missions/edit/m1/settings')
    expect(missionEditorFromHash(withTab)).toEqual({ missionId: 'm1', tab: 'settings' })
  })
  it('reads an unknown tab as no tab, so the editor picks its own', async () => {
    const { missionEditorFromHash } = await import('./routes')
    expect(missionEditorFromHash('#/site/s/missions/edit/m1/nonsense')).toEqual({ missionId: 'm1', tab: null })
  })
  it('names no mission on the other Missions hashes', async () => {
    const { missionEditorFromHash } = await import('./routes')
    expect(missionEditorFromHash('#/site/s/missions')).toBeNull()
    expect(missionEditorFromHash('#/site/s/missions/edit')).toBeNull()
    expect(missionEditorFromHash('#/site/s/missions/edit/')).toBeNull()
    expect(missionEditorFromHash('#/site/s/missions/schedule')).toBeNull()
    expect(missionEditorFromHash('#/site/s/data/missions/edit/m1')).toBeNull()
  })
})
