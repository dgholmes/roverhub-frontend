import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fakeClient = { on: vi.fn(), end: vi.fn(), options: {} }
vi.mock('./mqttClient', () => ({ connectBroker: vi.fn(() => fakeClient) }))

import { RealDataProvider } from './realDataProvider'
import { MockLidarMounts } from '@/mocks/mockSensors'
import { MockDataProvider } from '@/mocks/mockDataProvider'
import type { Command } from '@/types'
import type { LidarMountStatus } from '@/types/sensors'

/** Systems › Sensors through both providers: `roverhub/{site}/{robot}/sensors/lidar_mount`
 * in, one status per robot out; and the mock bridge's answers to the commands. */

const wire = (over: Record<string, unknown> = {}) => ({
  robot_id: 'rover-jetson', site_id: 'site-dev', mode: 'suggest',
  in_use: { x_m: 0.234, y_m: 0.015, z_m: 0.25, roll_deg: 0, pitch_deg: 5.9, yaw_deg: 0 },
  measured: null, differs: false, history: [], updated_at: '2026-11-16T08:00:00Z', ...over,
})

describe('RealDataProvider lidar mount', () => {
  let provider: RealDataProvider
  const deliver = (topic: string, payload: unknown) => {
    const onMessage = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]
    onMessage?.(topic, Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })))
    provider = new RealDataProvider({ wsUrl: 'ws://localhost:9001', apiBaseUrl: 'http://localhost:8000', siteId: 'site-dev' })
  })
  afterEach(() => {
    provider.dispose()
    vi.unstubAllGlobals()
  })

  it('delivers each robot\'s status, drops malformed ones, and hands a late subscriber the latest', () => {
    const got: LidarMountStatus[] = []
    provider.subscribeLidarMount((s) => got.push(s))
    deliver('roverhub/site-dev/rover-jetson/sensors/lidar_mount', wire())
    deliver('roverhub/site-dev/rover-pi/sensors/lidar_mount', wire({ robot_id: 'rover-pi', mode: 'auto' }))
    deliver('roverhub/site-dev/rover-pi/sensors/lidar_mount', 'not json')
    deliver('roverhub/site-dev/rover-pi/sensors/lidar_mount', wire({ robot_id: 'rover-pi', mode: 'never' }))
    expect(got.map((s) => [s.robot_id, s.mode])).toEqual([['rover-jetson', 'suggest'], ['rover-pi', 'auto']])

    const late: string[] = []
    provider.subscribeLidarMount((s) => late.push(s.robot_id))
    expect(late.sort()).toEqual(['rover-jetson', 'rover-pi'])
  })

  it('reads which survey made a floor from GET .../floors/{n}/survey, and a 404 as no record', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (String(url).endsWith('/maps/map%20a/floors/0/survey')
      ? { ok: true, status: 200, json: async () => ({ floor: 0, survey: { survey_id: 'sv-1', robot_id: 'rover-jetson' } }) }
      : String(url).endsWith('/floors/1/survey') ? { ok: false, status: 404, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => ({ floor: 2 }) })))
    expect(await provider.getFloorSurvey('map a', 0)).toEqual({ surveyId: 'sv-1', robotId: 'rover-jetson' })
    expect(await provider.getFloorSurvey('map a', 1)).toBeUndefined()
    expect(await provider.getFloorSurvey('map a', 2)).toBeNull()
  })

  it('shows the backend\'s refusal of a command verbatim', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => (String(url).endsWith('/commands')
      ? { ok: false, status: 409, json: async () => ({ detail: 'update the edge device: it runs schema 0.0.22, surveys and lidar calibration need 0.0.23' }) }
      : { ok: true, status: 200, json: async () => [] })))
    const updates: Command[] = []
    provider.dispatchCommand('rover-jetson', 'SET_CALIBRATION_MODE', 'Lidar calibration: Auto', (c) => updates.push(c), { mode: 'auto' })
    await vi.waitFor(() => expect(updates.some((c) => c.current_stage === 'execution_failed')).toBe(true))
    expect(updates[updates.length - 1]?.failure_reason).toBe(
      'The cloud rejected the command (HTTP 409): update the edge device: it runs schema 0.0.22, surveys and lidar calibration need 0.0.23')
  })
})

describe('the mock bridge\'s lidar calibration', () => {
  const robots = [{ robot_id: 'a', site_id: 's' }, { robot_id: 'b', site_id: 's' }, { robot_id: 'c', site_id: 's' }]
  const latest = (m: MockLidarMounts, id: string) => {
    let s: LidarMountStatus | null = null
    m.feed.subscribe((x) => { if (x.robot_id === id) s = x })()
    return s as unknown as LidarMountStatus
  }

  it('seeds one robot that differs in Suggest and one in Auto, and none for the rest', () => {
    const m = new MockLidarMounts(robots, { now: () => Date.parse('2026-11-16T09:00:00Z') })
    expect(latest(m, 'a')).toMatchObject({ mode: 'suggest', differs: true })
    expect(latest(m, 'b')).toMatchObject({ mode: 'auto', differs: false })
    expect(m.feed.get('c')).toBeNull()
    expect(m.refusal('c', 'SET_CALIBRATION_MODE', { mode: 'off' })).toMatch(/^REJECTED_NO_LIDAR/)
  })

  it('applies a mount to the front of the history and clears differs when it matches the estimate', () => {
    const m = new MockLidarMounts(robots)
    const measured = latest(m, 'a').measured!
    const mount = { ...latest(m, 'a').in_use, x_m: measured.x_m!, y_m: measured.y_m!, pitch_deg: measured.pitch_deg!, roll_deg: measured.roll_deg! }
    expect(m.refusal('a', 'SET_LIDAR_MOUNT', { mount, source: 'measured' })).toBeNull()
    m.apply('a', 'SET_LIDAR_MOUNT', { mount, source: 'measured' }, 'eng-1')
    const s = latest(m, 'a')
    expect(s.in_use).toEqual(mount)
    expect(s.differs).toBe(false)
    expect(s.history[0]).toMatchObject({ source: 'measured', by: 'eng-1', mount })
  })

  it('refuses a mount out of range, and measures nothing when Off', () => {
    const m = new MockLidarMounts(robots)
    expect(m.refusal('a', 'SET_LIDAR_MOUNT', { mount: { ...latest(m, 'a').in_use, pitch_deg: 60 }, source: 'manual' })).toMatch(/^REJECTED_INVALID_PARAMS/)
    m.apply('a', 'SET_CALIBRATION_MODE', { mode: 'off' }, null)
    expect(latest(m, 'a')).toMatchObject({ mode: 'off', measured: null, differs: false })
  })
})

describe('MockDataProvider FIND_MOVING', () => {
  it('re-runs the search on the seeded map\'s recording and stores a new list', async () => {
    const provider = new MockDataProvider()
    const jobs = await provider.listMapJobs('map-venue-survey')
    const survey = jobs.find((j) => j.kind === 'survey')!
    expect(survey.detail).toMatchObject({ survey_id: 'survey-map-venue-survey', robot_id: 'zaezae-x1-001' })
    expect(await provider.getFloorSurvey('map-venue-survey', 0)).toEqual({ surveyId: 'survey-map-venue-survey', robotId: 'zaezae-x1-001' })

    vi.useFakeTimers()
    try {
      const updates: Command[] = []
      provider.dispatchCommand('zaezae-x1-001', 'FIND_MOVING', 'Find moving things again', (c) => updates.push(c),
        { survey_id: 'survey-map-venue-survey', map_id: 'map-venue-survey', floor_index: 0, sensitivity: 0 })
      await vi.advanceTimersByTimeAsync(5000)
      const done = updates[updates.length - 1]!
      expect(done.current_stage).toBe('execution_completed')
      expect(done.result).toMatchObject({ map_id: 'map-venue-survey', moved_spots: 3 })
      expect((await provider.getMovedLayer('map-venue-survey', 0))?.blobs).toHaveLength(3)

      const refused: Command[] = []
      provider.dispatchCommand('zaezae-x1-002', 'FIND_MOVING', 'x', (c) => refused.push(c),
        { survey_id: 'survey-map-venue-survey', map_id: 'map-venue-survey', floor_index: 0, sensitivity: 0.5 })
      await vi.advanceTimersByTimeAsync(1000)
      expect(refused[refused.length - 1]?.failure_reason).toMatch(/^REJECTED_NO_RECORDING/)
    } finally {
      provider.dispose()
      vi.useRealTimers()
    }
  })
})
