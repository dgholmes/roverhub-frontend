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

describe('a map shown on the Maps page', () => {
  it('has its own hash under Maps, and reads its map back', async () => {
    const { hashForMissionsMap, mapViewFromHash, isMissionsMapsHash, mapInEditorFromHash, mapsSurveyFromHash } = await import('./routes')
    const hash = hashForMissionsMap('site a', 'map/1 2')
    expect(hash).toBe('#/site/site%20a/missions/maps/view/map%2F1%202')
    expect(parseRoute(hash)).toEqual({ kind: 'site', siteId: 'site a', workspace: 'Missions' })
    expect(isMissionsMapsHash(hash)).toBe(true)
    expect(mapViewFromHash(hash)).toBe('map/1 2')
    // It is neither the editor nor the survey page.
    expect(mapInEditorFromHash(hash)).toBeNull()
    expect(mapsSurveyFromHash(hash)).toBeNull()
  })
  it('is not named by other Maps hashes', async () => {
    const { mapViewFromHash } = await import('./routes')
    expect(mapViewFromHash('#/site/a/missions/maps')).toBeNull()
    expect(mapViewFromHash('#/site/a/missions/maps/edit/m1')).toBeNull()
    expect(mapViewFromHash('#/site/a/missions/maps/survey')).toBeNull()
  })
})

describe('the Schedule view of Missions', () => {
  it('has its own hash, which still opens the Missions workspace', async () => {
    const { hashForMissionsSchedule, scheduleViewFromHash } = await import('./routes')
    const hash = hashForMissionsSchedule('site a')
    expect(hash).toBe('#/site/site%20a/missions/schedule')
    expect(parseRoute(hash)).toEqual({ kind: 'site', siteId: 'site a', workspace: 'Missions' })
    expect(scheduleViewFromHash(hash)).toBe('tasks')
  })
  it('names the Runs and Calendar views, with Tasks as the default', async () => {
    const { hashForMissionsSchedule, scheduleViewFromHash } = await import('./routes')
    expect(hashForMissionsSchedule('s', 'tasks')).toBe('#/site/s/missions/schedule')
    expect(hashForMissionsSchedule('s', 'runs')).toBe('#/site/s/missions/schedule/runs')
    expect(hashForMissionsSchedule('s', 'calendar')).toBe('#/site/s/missions/schedule/calendar')
    expect(scheduleViewFromHash('#/site/s/missions/schedule/runs')).toBe('runs')
    expect(scheduleViewFromHash('#/site/s/missions/schedule/calendar')).toBe('calendar')
    // Links made while Runs was the default named Tasks explicitly; they still work.
    expect(scheduleViewFromHash('#/site/s/missions/schedule/tasks')).toBe('tasks')
    // A view this build does not have opens the default rather than nothing.
    expect(scheduleViewFromHash('#/site/s/missions/schedule/gantt')).toBe('tasks')
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

describe('Systems › Logs', () => {
  it('has its own hash, which still opens the Systems workspace', async () => {
    const { hashForSystemsPage, systemsPageFromHash } = await import('./routes')
    const hash = hashForSystemsPage('site a')
    expect(hash).toBe('#/site/site%20a/systems/logs')
    expect(parseRoute(hash)).toEqual({ kind: 'site', siteId: 'site a', workspace: 'Systems' })
    expect(systemsPageFromHash(hash)).toBe('logs')
  })
  it('is the page the bare workspace, and an unknown page, open', async () => {
    const { systemsPageFromHash } = await import('./routes')
    expect(parseRoute('#/site/s/systems')).toEqual({ kind: 'site', siteId: 's', workspace: 'Systems' })
    expect(systemsPageFromHash('#/site/s/systems')).toBe('logs')
    expect(systemsPageFromHash('#/site/s/systems/topology')).toBe('logs')
  })
})

describe('Systems › Sensors', () => {
  it('has its own hash, which still opens the Systems workspace', async () => {
    const { hashForSystemsPage, systemsPageFromHash } = await import('./routes')
    const hash = hashForSystemsPage('site a', 'sensors')
    expect(hash).toBe('#/site/site%20a/systems/sensors')
    expect(parseRoute(hash)).toEqual({ kind: 'site', siteId: 'site a', workspace: 'Systems' })
    expect(systemsPageFromHash(hash)).toBe('sensors')
  })
})

describe('survey links', () => {
  it('round-trips a survey hash', async () => {
    const { hashForSiteSurvey, surveyIdFromHash } = await import('./routes')
    expect(surveyIdFromHash(hashForSiteSurvey('site-dev', 'survey-20261118-222656-f936'))).toBe('survey-20261118-222656-f936')
    expect(surveyIdFromHash('#/site/x/data/missions/r1')).toBeNull()
  })
  it('opens the Data workspace on the survey', async () => {
    const { hashForSiteSurvey, surveyIdFromHash } = await import('./routes')
    const hash = hashForSiteSurvey('site a', 'survey/1 x')
    expect(hash).toBe('#/site/site%20a/data/surveys/survey%2F1%20x')
    expect(parseRoute(hash)).toEqual({ kind: 'site', siteId: 'site a', workspace: 'Data' })
    expect(surveyIdFromHash(hash)).toBe('survey/1 x')
    expect(runIdFromHash(hash)).toBeNull()
    expect(surveyIdFromHash('#/site/a/data')).toBeNull()
    expect(surveyIdFromHash('#/site/a/data/surveys')).toBeNull()
    expect(surveyIdFromHash('#/site/a/missions/surveys/s1')).toBeNull()
  })
})
