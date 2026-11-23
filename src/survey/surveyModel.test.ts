import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import type { RobotRunView } from '@/liveops/robotRun'
import type { RobotState } from '@/types'
import type { SurveyStatus } from '@/types/survey'
import {
  defaultSurveyName, isFindingMoved, isFinishing, isSurveyBusy, isSurveying, newSurveyId, parseSurveyMapFrame, parseSurveyStatus,
  robotCanSurvey, SURVEY_STAGE_MOVING, surveyHoldsLidar, surveyPhase, surveyStartRefusal, worldToCell,
} from './surveyModel'
import { surveyFailureText } from './surveyCommands'

const robot = (over: Partial<RobotState> = {}, schema: string | null = '0.0.23'): RobotState => ({
  robot_id: 'rover-jetson', name: 'rover-jetson', site_id: 'site-dev', abstract_state: 'STAND', control_owner: null, nav_goal: null,
  connectivity: { bridge_state: 'connected' },
  bridge: { bridge_id: 'b', schema_version: schema, last_heartbeat_at: null, mission_active: false },
  ...over,
}) as unknown as RobotState

const status = (state: SurveyStatus['state'], over: Partial<SurveyStatus> = {}): SurveyStatus => ({
  robot_id: 'rover-jetson', site_id: 'site-dev', state, survey_id: 's1', elapsed_s: 0, covered_m2: 0, path_length_m: 0,
  drift: 'unknown', cameras: 'off', updated_at: '2026-11-16T05:00:00Z', ...over,
})

describe('who can survey', () => {
  it('needs a bridge on schema 0.0.23 or newer', () => {
    expect(robotCanSurvey(robot({}, '0.0.23'))).toBe(true)
    expect(robotCanSurvey(robot({}, '0.0.24'))).toBe(true)
    expect(robotCanSurvey(robot({}, '0.0.22'))).toBe(false)
    expect(robotCanSurvey(robot({}, null))).toBe(false)
    expect(robotCanSurvey({ bridge: undefined } as unknown as RobotState)).toBe(false)
  })
})

describe('surveyStartRefusal', () => {
  const me = 'operator-dev'
  const none: RobotRunView = null
  it('lets a free, standing robot start', () => {
    expect(surveyStartRefusal(robot(), null, none, me)).toBeNull()
    expect(surveyStartRefusal(robot({ control_owner: me }), status('idle'), none, me)).toBeNull()
    expect(surveyStartRefusal(robot(), status('done'), none, me)).toBeNull()
  })
  it('refuses with the contract reasons, in order', () => {
    expect(surveyStartRefusal(robot({ connectivity: { bridge_state: 'offline' } } as Partial<RobotState>), null, none, me)).toBe('offline')
    expect(surveyStartRefusal(robot({}, '0.0.22'), null, none, me)).toBe('oldBridge')
    expect(surveyStartRefusal(robot(), status('recording'), none, me)).toBe('surveyRunning')
    expect(surveyStartRefusal(robot(), status('processing'), none, me)).toBe('surveyFinishing')
    expect(surveyStartRefusal(robot({ abstract_state: 'E_STOP' }), null, none, me)).toBe('estop')
    expect(surveyStartRefusal(robot(), null, { phase: 'running' } as RobotRunView, me)).toBe('mission')
    expect(surveyStartRefusal(robot({ control_owner: 'mission:r1' }), null, none, me)).toBe('mission')
    expect(surveyStartRefusal(robot({ nav_goal: { state: 'active' } } as Partial<RobotState>), null, none, me)).toBe('navGoal')
    expect(surveyStartRefusal(robot({ control_owner: 'nav:g1' }), null, none, me)).toBe('navGoal')
    expect(surveyStartRefusal(robot({ control_owner: 'u-ana' }), null, none, me)).toBe('controlHeld')
  })
})

describe('phases', () => {
  it('groups the states the screens care about', () => {
    expect(isSurveying('starting') && isSurveying('recording')).toBe(true)
    expect(isSurveying('saving')).toBe(false)
    expect(surveyHoldsLidar('saving')).toBe(true)
    expect(surveyHoldsLidar('processing')).toBe(false)
    expect(isFinishing('uploading')).toBe(true)
    expect(isSurveyBusy('done')).toBe(false)
    expect(surveyPhase(null)).toBe('start')
    expect(surveyPhase(status('idle'))).toBe('start')
    expect(surveyPhase(status('recording'))).toBe('surveying')
    expect(surveyPhase(status('saving'))).toBe('finishing')
    expect(surveyPhase(status('done'))).toBe('done')
    expect(surveyPhase(status('failed'))).toBe('failed')
  })
})

describe('reading the wire', () => {
  it('parses a status, dropping only the readings that are off', () => {
    const s = parseSurveyStatus({
      robot_id: 'r', site_id: 's', state: 'recording', updated_at: 'x', covered_m2: 12.5, lidar_hz: -1, drift: 'nonsense',
      progress: 2, moved_spots: 3, cameras: 'front',
    })
    expect(s).toMatchObject({ state: 'recording', covered_m2: 12.5, lidar_hz: null, drift: 'unknown', progress: null, moved_spots: 3, cameras: 'front' })
    expect(parseSurveyStatus({ robot_id: 'r', site_id: 's', state: 'flying', updated_at: 'x' })).toBeNull()
    expect(parseSurveyStatus({ site_id: 's', state: 'idle', updated_at: 'x' })).toBeNull()
    expect(parseSurveyStatus('nope')).toBeNull()
  })

  const frame = {
    robot_id: 'r', site_id: 's', survey_id: 'sv', seq: 3, captured_at: 'x', resolution_m: 0.1,
    origin_x_m: -2, origin_y_m: 5, width: 40, height: 30, cells_png_b64: 'AAAA', pose: { x_m: 0, y_m: 0, yaw_rad: 0 }, path: [[0, 0], [1, 1]],
  }
  it('parses a map frame and refuses one whose geometry is off', () => {
    expect(parseSurveyMapFrame(frame)).toMatchObject({ seq: 3, width: 40, path: [[0, 0], [1, 1]] })
    expect(parseSurveyMapFrame({ ...frame, pose: null })?.pose).toBeNull()
    expect(parseSurveyMapFrame({ ...frame, width: 0 })).toBeNull()
    expect(parseSurveyMapFrame({ ...frame, width: 4001 })).toBeNull()
    expect(parseSurveyMapFrame({ ...frame, resolution_m: 0 })).toBeNull()
    expect(parseSurveyMapFrame({ ...frame, pose: { x_m: Number.NaN, y_m: 0, yaw_rad: 0 } })).toBeNull()
    expect(parseSurveyMapFrame({ ...frame, path: [[0, 0, 0]] })).toBeNull()
    expect(parseSurveyMapFrame({ ...frame, path: new Array(1001).fill([0, 0]) })).toBeNull()
    expect(parseSurveyMapFrame({ ...frame, cells_png_b64: 'x'.repeat(600_001) })).toBeNull()
  })

  it('puts the origin at the image top-left, +y toward row 0', () => {
    const f = { origin_x_m: -2, origin_y_m: 5, resolution_m: 0.1 }
    expect(worldToCell(f, -2, 5)).toEqual([0, 0])
    const [c, r] = worldToCell(f, 0, 0)
    expect(c).toBeCloseTo(20)
    expect(r).toBeCloseTo(50)
  })
})

describe('ids and names', () => {
  it('makes a sortable survey id within the 64-character limit', () => {
    const id = newSurveyId(new Date(2026, 10, 16, 14, 5, 9), () => 0.5)
    expect(id).toBe('survey-20261116-140509-7fff')
    expect(id.length).toBeLessThanOrEqual(64)
  })
  it('names a survey after when it started', () => {
    expect(defaultSurveyName(new Date(2026, 10, 16, 9, 3), 'Survey')).toBe('Survey 2026-11-16 09:03')
  })
})

describe('surveyFailureText', () => {
  it('shows the backend refusal sentences exactly as written', async () => {
    await i18n.changeLanguage('en')
    const detail = 'update the edge device: it runs schema 0.0.22, surveys and lidar calibration need 0.0.23'
    expect(surveyFailureText(`The cloud rejected the command (HTTP 409): ${detail}`)).toBe(detail)
    expect(surveyFailureText('The cloud rejected the command (HTTP 403): your role does not allow START_SURVEY'))
      .toBe('your role does not allow START_SURVEY')
    expect(surveyFailureText('The cloud rejected the command (HTTP 500).')).toBe('The cloud rejected the command (HTTP 500).')
  })
  it('puts a bridge refusal code into words', () => {
    expect(surveyFailureText('REJECTED_ESTOP')).not.toMatch(/REJECTED_ESTOP/)
    expect(surveyFailureText(null)).toBe('The robot refused it.')
  })
})

// --- Skip for now keys on the device's own words ---------------------------
//
// isFindingMoved compares survey/status's `stage` with the edge pipeline's
// STAGE_MOVING. Reworded on the edge alone, Skip for now would silently never
// show; so this reads survey_pipeline/common.py, as lib/refusals.test.ts reads
// the bridge. ROVERHUB_EDGE_SRC points it at another checkout.
const edgeRoot = [
  process.env.ROVERHUB_EDGE_SRC,
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'roverhub-edge'),
].find((p): p is string => !!p && existsSync(path.join(p, 'survey_pipeline', 'common.py')))

describe.skipIf(!edgeRoot)("the moving stage matches the edge's STAGE_MOVING", () => {
  it('is the same text as survey_pipeline/common.py', () => {
    const source = readFileSync(path.join(edgeRoot!, 'survey_pipeline', 'common.py'), 'utf8')
    const m = /^STAGE_MOVING\s*=\s*"([^"]+)"/m.exec(source)
    expect(m, 'STAGE_MOVING = "..." not found in survey_pipeline/common.py').not.toBeNull()
    expect(SURVEY_STAGE_MOVING).toBe(m![1])
  })
})

describe('isFindingMoved', () => {
  it('is true only while processing at the moving stage', () => {
    expect(isFindingMoved({ state: 'processing', stage: SURVEY_STAGE_MOVING })).toBe(true)
    expect(isFindingMoved({ state: 'processing', stage: ' Finding things that moved ' })).toBe(true)
    // The bridge's note when the rebuild fell back to the live map.
    expect(isFindingMoved({ state: 'processing', stage: 'finding things that moved (with the live map: the rebuild could not keep up)' })).toBe(true)
    expect(isFindingMoved({ state: 'processing', stage: 'looking again for things that moved' })).toBe(false)
    expect(isFindingMoved({ state: 'processing', stage: 'reading the map' })).toBe(false)
    expect(isFindingMoved({ state: 'uploading', stage: SURVEY_STAGE_MOVING })).toBe(false)
    expect(isFindingMoved(null)).toBe(false)
  })
})
