import { beforeAll, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import type { MapQualityReport } from '@/types/mapPipeline'
import type { SiteMap } from '@/types/maps'
import type { SurveySummary } from '@/types/surveyReplay'
import {
  mapReadiness, trackExtent, type ReadinessInput, type ReadinessRobot, type ReadinessStep, type StepId,
} from './mapReadiness'

beforeAll(async () => { await i18n.changeLanguage('en') })

const HASH = 'a'.repeat(64)
const OLD = 'b'.repeat(64)
const SURVEY = 'survey-20261120-150812-c0de'

/** Today's 15:08 map: a draft floor 58 m x 30 m, stretched by stray points
 * far past the 15 m x 12 m the robot walked. */
const todaysMap: SiteMap = {
  map_id: 'map-survey-1508', site_id: 'site-office', name: 'Survey 2026-11-20 15:08', source: 'slam',
  extent_min: [-20, -10], extent_max: [38, 20], created_at: '', updated_at: '', geodetic_anchor: null,
  status: 'draft', zones: [],
  floors: [{
    index: 0, label: 'Ground', floor_z_m: 0, resolution_m: 0.05, origin_xy_m: [-20, -10], size_cells: [1160, 600],
    free_cells: 1, occupied_cells: 1, unknown_cells: 1, content_hash: HASH,
    planning: { free_cells: 1, occupied_cells: 1, unknown_cells: 1, clearance_m: 0.2 },
  }],
}

const summary: SurveySummary = {
  survey_id: SURVEY, name: 'Office 15:08', site_id: 'site-office', robot_id: 'rover-jetson',
  started_at: '2026-11-20T06:08:12Z', stopped_at: '2026-11-20T06:25:12Z', duration_s: 1020, floor_index: 0,
  map_id: 'map-survey-1508', cameras: 'none' as SurveySummary['cameras'], recording_kept: true, map_take_id: null,
  take_count: 1, first_bad_s: null, has_legs: true, legs_m: 208,
}

const passed: MapQualityReport = {
  report_version: 1, map_id: 'map-survey-1508', version: 1, computed_at: '', passed: true, failed: [], warnings: [],
  checks: [], current: true,
}

/** rover-jetson, on 0.0.29, still running yesterday's office map. */
const jetson = (bridge: Partial<NonNullable<ReadinessRobot['bridge']>> = {}): ReadinessRobot => ({
  robot_id: 'rover-jetson', name: 'rover-jetson',
  bridge: {
    schema_version: '0.0.29', nav_map_id: 'map-office-survey2', nav_map_hash: OLD, nav_localised: true,
    recordings: [{ survey_id: SURVEY, bytes: 3e9, has_bag: true, has_cameras: false, keep: false, processing: false }],
    ...bridge,
  } as ReadinessRobot['bridge'],
})

const ALL = { configure: true, editZones: true, engineerToolsSwitch: false }

const input = (over: Partial<ReadinessInput> = {}): ReadinessInput => ({
  t: i18n.t,
  map: todaysMap,
  floorIndex: 0,
  survey: { surveyId: SURVEY, robotId: 'rover-jetson' },
  summary,
  moved: { spots: 3 },
  quality: passed,
  qualityRunning: false,
  walked: { min: [-5, -4], max: [10, 8] },
  robots: [jetson()],
  maps: [todaysMap, { ...todaysMap, map_id: 'map-office-survey2', name: 'map-office-survey2' }],
  can: ALL,
  ...over,
})

const step = (steps: ReadinessStep[], id: StepId) => steps.find((s) => s.id === id)!

describe('mapReadiness', () => {
  it('lists the nine steps in order', () => {
    expect(mapReadiness(input()).map((s) => s.id)).toEqual(
      ['mapped', 'legs', 'moved', 'quality', 'trimmed', 'zones', 'active', 'onRobot', 'placed'])
  })

  it("today's 15:08 map", () => {
    const steps = mapReadiness(input())
    expect(Object.fromEntries(steps.map((s) => [s.id, s.tone]))).toEqual({
      mapped: 'green', legs: 'green', moved: 'green', quality: 'green', trimmed: 'amber',
      zones: 'grey', active: 'grey', onRobot: 'grey', placed: 'grey',
    })
    expect(step(steps, 'mapped').detail).toBe('17 min survey, 208 m walked.')
    expect(step(steps, 'onRobot').action).toEqual({ kind: 'useOnRobot', robotId: 'rover-jetson', robotName: 'rover-jetson' })
    expect(step(steps, 'onRobot').detail).toBe('rover-jetson runs map-office-survey2.')
    expect(step(steps, 'trimmed').action).toEqual({ kind: 'trim', floorIndex: 0 })
    expect(step(steps, 'trimmed').detail).toBe('The map reaches 28 m past the walked path.')
    expect(step(steps, 'zones').action).toEqual({ kind: 'drawZones' })
    expect(step(steps, 'active').action).toEqual({ kind: 'activate' })
    expect(step(steps, 'placed').action).toBeNull()
    expect(step(steps, 'legs').action).toEqual({ kind: 'seeDrift', surveyId: SURVEY })
  })

  describe('mapped', () => {
    it('is grey on a map with no floor', () => {
      const s = step(mapReadiness(input({ map: { ...todaysMap, floors: [] } })), 'mapped')
      expect(s.tone).toBe('grey')
    })
    it('is green with no survey record, saying only that the floor is stored', () => {
      const s = step(mapReadiness(input({ survey: null, summary: null })), 'mapped')
      expect([s.tone, s.detail]).toEqual(['green', 'This floor is stored.'])
    })
  })

  describe('legs', () => {
    it('amber with first_bad_s, offers rebuild only when the robot still has the bag', () => {
      const drift = { ...summary, first_bad_s: 252 }
      const withBag = step(mapReadiness(input({ summary: drift })), 'legs')
      expect(withBag.tone).toBe('amber')
      expect(withBag.detail).toContain('4:12')
      expect(withBag.action).toEqual({ kind: 'rebuild', surveyId: SURVEY, robotId: 'rover-jetson' })

      const gone = jetson({ recordings: [{ survey_id: SURVEY, bytes: 1, has_bag: false, has_cameras: false, keep: false, processing: false }] })
      const noBag = step(mapReadiness(input({ summary: drift, robots: [gone] })), 'legs')
      expect(noBag.tone).toBe('amber')
      expect(noBag.action).toEqual({ kind: 'seeDrift', surveyId: SURVEY })

      const notListed = step(mapReadiness(input({ summary: drift, robots: [jetson({ recordings: [] })] })), 'legs')
      expect(notListed.action).toEqual({ kind: 'seeDrift', surveyId: SURVEY })

      // An older bridge does not list its recordings: nothing to rebuild with.
      const old = step(mapReadiness(input({ summary: drift, robots: [jetson({ schema_version: '0.0.28', recordings: [] })] })), 'legs')
      expect(old.action).toEqual({ kind: 'seeDrift', surveyId: SURVEY })
    })

    it('unknown is grey never green: no survey record', () => {
      const s = step(mapReadiness(input({ survey: null, summary: null })), 'legs')
      expect(s.tone).toBe('grey')
      expect(s.action).toBeNull()
      expect(s.detail).toBe('No survey record for this floor.')
    })

    it('grey while the survey list is still loading or failed', () => {
      expect(step(mapReadiness(input({ summary: undefined })), 'legs').tone).toBe('grey')
      expect(step(mapReadiness(input({ survey: undefined })), 'legs').tone).toBe('grey')
    })

    it('grey when the recording had no legs, still linking the replay', () => {
      const s = step(mapReadiness(input({ summary: { ...summary, has_legs: false } })), 'legs')
      expect(s.tone).toBe('grey')
      expect(s.action).toEqual({ kind: 'seeDrift', surveyId: SURVEY })
    })
  })

  describe('moved', () => {
    it('green when the floor has a moved list', () => {
      const s = step(mapReadiness(input({ moved: { spots: 0 } })), 'moved')
      expect([s.tone, s.action]).toEqual(['green', null])
    })
    it('amber with Find now when skipped or failed', () => {
      const s = step(mapReadiness(input({ moved: null })), 'moved')
      expect(s.tone).toBe('amber')
      expect(s.action).toEqual({ kind: 'findMoving', surveyId: SURVEY, robotId: 'rover-jetson' })
    })
    it('amber without Find now when the recording is gone, and says so', () => {
      const s = step(mapReadiness(input({ moved: null, robots: [jetson({ recordings: [] })] })), 'moved')
      expect(s.tone).toBe('amber')
      expect(s.action).toBeNull()
      expect(s.detail).toMatch(/no longer on the robot/)
    })
    it('grey with no survey', () => {
      expect(step(mapReadiness(input({ moved: null, survey: null, summary: null })), 'moved').tone).toBe('grey')
    })
    it('grey while unknown', () => {
      expect(step(mapReadiness(input({ moved: undefined })), 'moved').tone).toBe('grey')
    })
  })

  describe('quality', () => {
    it('red when failed, with Check again', () => {
      const s = step(mapReadiness(input({ quality: { ...passed, passed: false, failed: ['track_tilt_deg'] } })), 'quality')
      expect([s.tone, s.action]).toEqual(['red', { kind: 'checkQuality' }])
    })
    it('grey when missing or stale, with Check again', () => {
      for (const quality of [null, { ...passed, current: false }]) {
        const s = step(mapReadiness(input({ quality })), 'quality')
        expect([s.tone, s.action]).toEqual(['grey', { kind: 'checkQuality' }])
      }
    })
    it('grey while loading or while a check runs, without a button', () => {
      expect(step(mapReadiness(input({ quality: undefined })), 'quality')).toMatchObject({ tone: 'grey', action: null })
      expect(step(mapReadiness(input({ qualityRunning: true })), 'quality')).toMatchObject({ tone: 'grey', action: null })
    })
  })

  describe('trimmed', () => {
    it('green within the walked area plus the margin', () => {
      const s = step(mapReadiness(input({ walked: { min: [-15, -5], max: [30, 15] } })), 'trimmed')
      expect([s.tone, s.action]).toEqual(['green', null])
    })
    it('grey when the walked path is unknown or not stored', () => {
      expect(step(mapReadiness(input({ walked: undefined })), 'trimmed').tone).toBe('grey')
      expect(step(mapReadiness(input({ walked: null })), 'trimmed')).toMatchObject({ tone: 'grey', action: null })
    })
  })

  describe('zones', () => {
    it('green when one is drawn', () => {
      const zones = [{ zone_id: 'z', map_id: todaysMap.map_id, kind: 'no_go' as const, label: 'Stairs', polygon: [] }]
      expect(step(mapReadiness(input({ map: { ...todaysMap, zones } })), 'zones')).toMatchObject({ tone: 'green', action: null })
    })
    it('zones green when reviewed with none drawn', () => {
      const map = { ...todaysMap, zones_reviewed_at: '2026-11-20T07:00:00Z', zones_reviewed_by: 'dana' }
      const s = step(mapReadiness(input({ map })), 'zones')
      expect([s.tone, s.action, s.detail]).toEqual(['green', null, 'None needed, said dana.'])
    })
  })

  describe('active', () => {
    it('a draft with no floor says why it cannot be activated, and what to do', () => {
      const s = step(mapReadiness(input({ map: { ...todaysMap, floors: [] } })), 'active')
      expect(s).toMatchObject({ tone: 'grey', action: null })
      expect(s.detail).toBe('This map has no floor to plan on. Record a survey into it, then activate it.')
    })
    it('green when active', () => {
      expect(step(mapReadiness(input({ map: { ...todaysMap, status: 'active' } })), 'active'))
        .toMatchObject({ tone: 'green', action: null })
    })
  })

  describe('onRobot and placed', () => {
    const onThis = (hash: string | null, localised: boolean | null = true) =>
      jetson({ nav_map_id: todaysMap.map_id, nav_map_hash: hash, nav_localised: localised })

    it('onRobot: same hash green, differing hash offers sendToRobot, other map offers useOnRobot', () => {
      expect(step(mapReadiness(input({ robots: [onThis(HASH)] })), 'onRobot')).toMatchObject({ tone: 'green', action: null })
      expect(step(mapReadiness(input({ robots: [onThis(OLD)] })), 'onRobot'))
        .toMatchObject({ tone: 'amber', action: { kind: 'sendToRobot', robotId: 'rover-jetson' } })
      expect(step(mapReadiness(input({ robots: [jetson()] })), 'onRobot'))
        .toMatchObject({ tone: 'grey', action: { kind: 'useOnRobot', robotId: 'rover-jetson' } })
    })

    it('a robot set up for this map that reports no version is grey, not green', () => {
      expect(step(mapReadiness(input({ robots: [onThis(null)] })), 'onRobot')).toMatchObject({ tone: 'grey', action: null })
    })

    it('prefers the robot on this map, then the surveying robot, for the row', () => {
      const pi: ReadinessRobot = { ...jetson({ nav_map_id: null, nav_map_hash: null }), robot_id: 'rover-pi', name: 'rover-pi' }
      const steps = mapReadiness(input({ robots: [pi, jetson()] }))
      expect(step(steps, 'onRobot').action).toMatchObject({ kind: 'useOnRobot', robotId: 'rover-jetson' })
      const onPi = { ...pi, bridge: { ...pi.bridge!, nav_map_id: todaysMap.map_id, nav_map_hash: HASH } }
      expect(step(mapReadiness(input({ robots: [jetson(), onPi] })), 'onRobot').detail).toBe('rover-pi runs this version.')
    })

    it('does not offer Use this map to a bridge older than 0.0.29, and says why', () => {
      const s = step(mapReadiness(input({ robots: [jetson({ schema_version: '0.0.28' })] })), 'onRobot')
      expect(s.action).toBeNull()
      expect(s.detail).toMatch(/0\.0\.29/)
    })

    it('grey with no robot at the site, and when the floor has no version', () => {
      expect(step(mapReadiness(input({ robots: [] })), 'onRobot')).toMatchObject({ tone: 'grey', action: null })
      const noHash = { ...todaysMap, floors: [{ ...todaysMap.floors[0], content_hash: null }] }
      expect(step(mapReadiness(input({ map: noHash })), 'onRobot')).toMatchObject({ tone: 'grey', action: null })
    })

    it('placed: green when localised on this map, Set position when not or not reported', () => {
      expect(step(mapReadiness(input({ robots: [onThis(HASH, true)] })), 'placed')).toMatchObject({ tone: 'green', action: null })
      for (const localised of [false, null]) {
        expect(step(mapReadiness(input({ robots: [onThis(HASH, localised)] })), 'placed'))
          .toMatchObject({ tone: 'grey', action: { kind: 'setPosition', robotId: 'rover-jetson' } })
      }
    })

    it('placed is green only on this very version: an older one asks for Send first', () => {
      const s = step(mapReadiness(input({ robots: [onThis(OLD, true)] })), 'placed')
      expect(s).toMatchObject({ tone: 'grey', action: null })
      expect(s.detail).toMatch(/older version/)
      expect(step(mapReadiness(input({ robots: [onThis(null, true)] })), 'placed').tone).toBe('grey')
    })

    it('does not offer Use this map while the robot is offline, E-Stopped, on a mission or walking, and says which', () => {
      const live = { bridge_state: 'connected' } as NonNullable<ReadinessRobot['connectivity']>
      const now = new Date().toISOString()
      const robot = (over: Partial<ReadinessRobot>): ReadinessRobot => {
        const base = jetson({ last_heartbeat_at: now } as Partial<NonNullable<ReadinessRobot['bridge']>>)
        return { ...base, connectivity: live, abstract_state: 'STAND', active_run: null, control_owner: null, nav_goal: null, ...over }
      }
      expect(step(mapReadiness(input({ robots: [robot({})] })), 'onRobot').action).toMatchObject({ kind: 'useOnRobot' })
      const cases: [Partial<ReadinessRobot>, RegExp][] = [
        [{ connectivity: { bridge_state: 'offline' } as NonNullable<ReadinessRobot['connectivity']> }, /offline/],
        [{ abstract_state: 'E_STOP' }, /E-Stop/],
        [{ abstract_state: 'AUTO_MISSION' }, /mission/],
        [{ nav_goal: { goal_id: 'g', x_m: 0, y_m: 0, yaw_rad: null, map_id: 'm', state: 'active', reason: null, updated_at: '' } }, /walking/],
      ]
      for (const [over, why] of cases) {
        const s = step(mapReadiness(input({ robots: [robot(over)] })), 'onRobot')
        expect(s.action).toBeNull()
        expect(s.detail).toMatch(why)
      }
    })

    it('placed is grey when no robot runs this map, however localised it is elsewhere', () => {
      expect(step(mapReadiness(input({ robots: [jetson({ nav_localised: true })] })), 'placed').tone).toBe('grey')
    })
  })

  describe('capabilities', () => {
    it('no configure: actions null and detail says why', () => {
      const can = { configure: false, editZones: true, engineerToolsSwitch: false }
      const drift = { ...summary, first_bad_s: 252 }
      const steps = mapReadiness(input({ can, summary: drift, robots: [jetson()] }))
      const onRobot = step(steps, 'onRobot')
      expect(onRobot.action).toBeNull()
      expect(onRobot.detail).toMatch(/engineer role/)
      // Rebuild needs configure; the replay page is for everyone.
      const legs = step(steps, 'legs')
      expect(legs.action).toEqual({ kind: 'seeDrift', surveyId: SURVEY })
      expect(legs.detail).toMatch(/engineer role/)

      const sameButOld = mapReadiness(input({ can, robots: [jetson({ nav_map_id: todaysMap.map_id, nav_map_hash: OLD })] }))
      expect(step(sameButOld, 'onRobot')).toMatchObject({ tone: 'amber', action: null })
    })

    it('an owner who can switch Engineer tools on is told to', () => {
      const can = { configure: false, editZones: false, engineerToolsSwitch: true }
      expect(step(mapReadiness(input({ can })), 'onRobot').detail).toMatch(/Engineer tools/)
    })

    it('no editZones: Trim, Draw zones and Activate say why instead', () => {
      const can = { configure: false, editZones: false, engineerToolsSwitch: false }
      const steps = mapReadiness(input({ can }))
      for (const id of ['trimmed', 'zones', 'active'] as const) {
        expect(step(steps, id).action).toBeNull()
        expect(step(steps, id).detail).toMatch(/supervisor role/)
      }
    })

    it('Check again and Find now need a supervisor or an engineer', () => {
      const engineer = { configure: true, editZones: false, engineerToolsSwitch: false }
      expect(step(mapReadiness(input({ can: engineer, quality: null })), 'quality').action).toEqual({ kind: 'checkQuality' })
      expect(step(mapReadiness(input({ can: engineer, moved: null })), 'moved').action).toMatchObject({ kind: 'findMoving' })
      const viewer = { configure: false, editZones: false, engineerToolsSwitch: false }
      const q = step(mapReadiness(input({ can: viewer, quality: null })), 'quality')
      expect(q.action).toBeNull()
      expect(q.detail).toMatch(/supervisor or engineer/)
    })

    it('a green row never carries a why', () => {
      const viewer = { configure: false, editZones: false, engineerToolsSwitch: false }
      expect(step(mapReadiness(input({ can: viewer })), 'quality').detail).toBe('All blocking checks pass.')
    })
  })
})

describe('trackExtent', () => {
  const csv = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer
  it('is the x, y box of the walked path', () => {
    expect(trackExtent(csv('t,x,y,z\n0,1,2,0\n1,-3,5,0.1\n2,4,-1,0\n'))).toEqual({ min: [-3, -1], max: [4, 5] })
  })
  it('is null for a file with no samples or the wrong header', () => {
    expect(trackExtent(csv('t,x,y,z\n'))).toBeNull()
    expect(trackExtent(csv('a,b,c\n1,2,3\n'))).toBeNull()
  })
  it('skips rows that are not four finite numbers', () => {
    expect(trackExtent(csv('t,x,y,z\r\n0,1,1,0\r\nbad\r\n1,2,2,nan\r\n'))).toEqual({ min: [1, 1], max: [1, 1] })
  })
})
