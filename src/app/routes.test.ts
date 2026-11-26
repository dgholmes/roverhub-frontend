import { describe, expect, it } from 'vitest'
import {
  WORKSPACES, fleetRobotFromHash, hashForFleetRobot, hashForSiteRun, hashForSystemsPage, legacySystemsRedirect,
  parseRoute, runIdFromHash,
} from './routes'

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

describe('the Map workspace', () => {
  it('sits between Fleet and Missions, with the slug map', async () => {
    const { WORKSPACES, hashForSiteWorkspace } = await import('./routes')
    expect(WORKSPACES).toEqual(['LiveOps', 'Fleet', 'Map', 'Missions', 'Data'])
    expect(hashForSiteWorkspace('site a', 'Map')).toBe('#/site/site%20a/map')
    expect(parseRoute('#/site/site%20a/map')).toEqual({ kind: 'site', siteId: 'site a', workspace: 'Map' })
  })

  it('names a map, encoded, and reads it back with no tab', async () => {
    const { hashForMap, mapRouteFromHash } = await import('./routes')
    expect(hashForMap('site a')).toBe('#/site/site%20a/map')
    expect(hashForMap('site a', null)).toBe('#/site/site%20a/map')
    const hash = hashForMap('site a', 'map/1 2')
    expect(hash).toBe('#/site/site%20a/map/map%2F1%202')
    expect(parseRoute(hash)).toEqual({ kind: 'site', siteId: 'site a', workspace: 'Map' })
    expect(mapRouteFromHash(hash)).toEqual({ view: 'page', mapId: 'map/1 2', tab: null })
    expect(mapRouteFromHash(hashForMap('s'))).toEqual({ view: 'page', mapId: null, tab: null })
  })

  it('keeps a tab in ?tab=, and reads an unknown one as none', async () => {
    const { hashForMap, mapRouteFromHash } = await import('./routes')
    const hash = hashForMap('s', 'm1', 'zones')
    expect(hash).toBe('#/site/s/map/m1?tab=zones')
    expect(parseRoute(hash)).toEqual({ kind: 'site', siteId: 's', workspace: 'Map' })
    expect(mapRouteFromHash(hash)).toEqual({ view: 'page', mapId: 'm1', tab: 'zones' })
    expect(mapRouteFromHash('#/site/s/map/m1?tab=nonsense')).toEqual({ view: 'page', mapId: 'm1', tab: null })
    // A tab without a map means nothing.
    expect(hashForMap('s', null, 'zones')).toBe('#/site/s/map')
  })

  it('has the editor and the Survey page under it', async () => {
    const { hashForMapEditor, hashForMapSurvey, mapRouteFromHash } = await import('./routes')
    const edit = hashForMapEditor('s', 'map-office')
    expect(edit).toBe('#/site/s/map/map-office/edit')
    expect(mapRouteFromHash(edit)).toEqual({ view: 'edit', mapId: 'map-office' })
    const survey = hashForMapSurvey('site a', 'rover/1')
    expect(survey).toBe('#/site/site%20a/map/survey/rover%2F1')
    expect(mapRouteFromHash(survey)).toEqual({ view: 'survey', robotId: 'rover/1' })
    expect(mapRouteFromHash(hashForMapSurvey('s'))).toEqual({ view: 'survey', robotId: null })
    expect(parseRoute(survey)).toEqual({ kind: 'site', siteId: 'site a', workspace: 'Map' })
  })

  it('is not named by another workspace', async () => {
    const { mapRouteFromHash } = await import('./routes')
    expect(mapRouteFromHash('#/site/a/missions')).toBeNull()
    expect(mapRouteFromHash('#/site/a/missions/maps')).toBeNull()
    expect(mapRouteFromHash('#/site/a/mapsx')).toBeNull()
  })
})

describe('old Missions > Maps links', () => {
  it('move to their place in the Map workspace', async () => {
    const { legacyMapsRedirect } = await import('./routes')
    expect(legacyMapsRedirect('#/site/site%20a/missions/maps')).toBe('#/site/site%20a/map')
    expect(legacyMapsRedirect('#/site/s/missions/maps/view/map%2F1')).toBe('#/site/s/map/map%2F1')
    expect(legacyMapsRedirect('#/site/s/missions/maps/edit/m1')).toBe('#/site/s/map/m1/edit')
    expect(legacyMapsRedirect('#/site/s/missions/maps/survey')).toBe('#/site/s/map/survey')
    expect(legacyMapsRedirect('#/site/s/missions/maps/survey/rover-pi')).toBe('#/site/s/map/survey/rover-pi')
  })

  it('leaves every other hash alone', async () => {
    const { legacyMapsRedirect } = await import('./routes')
    expect(legacyMapsRedirect('#/site/s/missions')).toBeNull()
    expect(legacyMapsRedirect('#/site/s/missions/schedule')).toBeNull()
    expect(legacyMapsRedirect('#/site/s/missions/mapsx')).toBeNull()
    expect(legacyMapsRedirect('#/site/s/data/missions/maps')).toBeNull()
    expect(legacyMapsRedirect('#/site/s/map')).toBeNull()
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

describe('robot addresses', () => {
  it('name a robot in Fleet, with the tab after it unless it is Overview', () => {
    expect(hashForFleetRobot('site-dev', 'rover-jetson')).toBe('#/site/site-dev/fleet/rover-jetson')
    expect(hashForFleetRobot('site-dev', 'rover-jetson', 'overview')).toBe('#/site/site-dev/fleet/rover-jetson')
    expect(hashForFleetRobot('site-dev', 'rover-jetson', 'sensors')).toBe('#/site/site-dev/fleet/rover-jetson/sensors')
    expect(hashForFleetRobot('a b', 'r/1', 'logs')).toBe('#/site/a%20b/fleet/r%2F1/logs')
  })

  it('read back the robot and tab, with Overview for a missing or unknown tab', () => {
    expect(fleetRobotFromHash('#/site/site-dev/fleet/rover-jetson/logs')).toEqual({ robotId: 'rover-jetson', tab: 'logs' })
    expect(fleetRobotFromHash('#/site/site-dev/fleet/rover-jetson')).toEqual({ robotId: 'rover-jetson', tab: 'overview' })
    expect(fleetRobotFromHash('#/site/site-dev/fleet/rover-jetson/bogus')).toEqual({ robotId: 'rover-jetson', tab: 'overview' })
    expect(fleetRobotFromHash('#/site/a%20b/fleet/r%2F1/logs')).toEqual({ robotId: 'r/1', tab: 'logs' })
    expect(fleetRobotFromHash('#/site/site-dev/fleet')).toBeNull()
  })

  it('still open the Fleet workspace', () => {
    expect(parseRoute('#/site/site-dev/fleet/rover-jetson/logs')).toEqual({ kind: 'site', siteId: 'site-dev', workspace: 'Fleet' })
  })
})

// Systems folded into Fleet's robot tabs on 2026-11-26. Its pages were about
// one robot each, so an old link lands on that robot's tab.
describe('old Systems links', () => {
  it('move to the robot they name, or else the one the console is showing', () => {
    expect(legacySystemsRedirect('#/site/s/systems/sensors?robot=rover-pi', null)).toBe('#/site/s/fleet/rover-pi/sensors')
    expect(legacySystemsRedirect('#/site/s/systems/sensors?robot=rover-pi', 'rover-jetson')).toBe('#/site/s/fleet/rover-pi/sensors')
    expect(legacySystemsRedirect('#/site/s/systems/logs', 'rover-jetson')).toBe('#/site/s/fleet/rover-jetson/logs')
    expect(legacySystemsRedirect('#/site/s/systems', 'rover-jetson')).toBe('#/site/s/fleet/rover-jetson/logs')
  })

  it('open Fleet itself when no robot is known', () => {
    expect(legacySystemsRedirect('#/site/s/systems/sensors', null)).toBe('#/site/s/fleet')
  })

  it('leave every other hash alone', () => {
    expect(legacySystemsRedirect('#/site/s/fleet', 'rover-jetson')).toBeNull()
    expect(legacySystemsRedirect('#/site/s/systemsx', 'rover-jetson')).toBeNull()
    expect(legacySystemsRedirect('#/site/s/data/systems/logs', 'rover-jetson')).toBeNull()
  })

  it('include the ones the bell still builds', () => {
    const bell = `${hashForSystemsPage('site a', 'sensors')}?robot=rover%2F1`
    expect(legacySystemsRedirect(bell, null)).toBe('#/site/site%20a/fleet/rover%2F1/sensors')
  })

  it('are no longer a workspace of their own', () => {
    expect(WORKSPACES).toEqual(['LiveOps', 'Fleet', 'Map', 'Missions', 'Data'])
    expect(parseRoute('#/site/s/systems/logs')).toEqual({ kind: 'notFound', hash: '#/site/s/systems/logs' })
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
