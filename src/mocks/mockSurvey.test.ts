import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RobotState } from '@/types'
import type { SurveyMapFrame, SurveyStatus } from '@/types/survey'
import { SurveyFeed } from '@/survey/surveyFeed'
import { decodeGreyPng, base64ToBytes } from '@/survey/surveyPng'
import { countSurveyCells } from '@/survey/surveyColours'
import { MOCK_SURVEY_REFUSAL, MOCK_SURVEY_WALK_S, MockSurveySim, poseAlong } from './mockSurvey'

const robot = (over: Partial<RobotState> = {}) => ({
  robot_id: 'zaezae-x1-001', site_id: 'site-north-yard', abstract_state: 'STAND', control_owner: null, ...over,
}) as unknown as RobotState

const params = { survey_id: 's1', name: 'Office', floor_index: 0, map_id: null, cameras: 'off' }

let feed: SurveyFeed
let sim: MockSurveySim
let createDraft: ReturnType<typeof vi.fn>
let statuses: SurveyStatus[]
let frames: SurveyMapFrame[]

beforeEach(() => {
  vi.useFakeTimers()
  feed = new SurveyFeed()
  createDraft = vi.fn(async () => 'map-office-abc')
  sim = new MockSurveySim(feed, { createDraft, stageMs: { saving: 1000, processing: 2000 } })
  statuses = []
  frames = []
  feed.subscribeStatus('zaezae-x1-001', (s) => statuses.push(s))
  feed.subscribeMap('zaezae-x1-001', (f) => frames.push(f))
})
afterEach(() => {
  sim.dispose()
  vi.useRealTimers()
})

const last = () => statuses[statuses.length - 1]

describe('the mock survey', () => {
  it('walks its office in about two minutes', () => {
    expect(MOCK_SURVEY_WALK_S).toBeGreaterThan(100)
    expect(MOCK_SURVEY_WALK_S).toBeLessThan(150)
    expect(poseAlong(0)).toMatchObject({ x: 0, y: 0, done: false })
    expect(poseAlong(1e6).done).toBe(true)
  })

  it('starts, records, and grows a map with a path as the robot walks', async () => {
    sim.accept(robot(), 'START_SURVEY', params)
    expect(last().state).toBe('starting')
    await vi.advanceTimersByTimeAsync(3000)
    expect(last().state).toBe('recording')
    const first = frames[0]
    await vi.advanceTimersByTimeAsync(60_000)
    const later = frames[frames.length - 1]
    expect(later.seq).toBeGreaterThan(first.seq)
    expect(later.path.length).toBeGreaterThan(first.path.length)
    vi.useRealTimers() // the PNG decode awaits a real stream
    const a = countSurveyCells((await decodeGreyPng(base64ToBytes(first.cells_png_b64))).pixels)
    const b = countSurveyCells((await decodeGreyPng(base64ToBytes(later.cells_png_b64))).pixels)
    expect(b.open).toBeGreaterThan(a.open)
    expect(b.occupied).toBeGreaterThan(a.occupied)
    expect(b.unseen).toBeGreaterThan(0) // there are still gaps
    expect(last().covered_m2).toBeGreaterThan(50)
    expect(last().lidar_hz).toBeGreaterThan(9)
  })

  it('refuses a second survey, and the nav commands, while one records', () => {
    sim.accept(robot(), 'START_SURVEY', params)
    expect(sim.refusal(robot(), 'START_SURVEY', params, 'operator-dev')).toMatch(/REJECTED_SURVEY_BUSY/)
    expect(sim.refusal(robot(), 'NAV_GOTO', {}, 'operator-dev')).toMatch(MOCK_SURVEY_REFUSAL)
    expect(sim.refusal(robot(), 'RESET_POSITION', {}, 'operator-dev')).toMatch(MOCK_SURVEY_REFUSAL)
    expect(sim.refusal(robot(), 'DRIVE', {}, 'operator-dev')).toBeNull()
    expect(sim.refusal(robot(), 'ESTOP', {}, 'operator-dev')).toBeNull()
  })

  it('refuses a start under E-Stop or someone else\'s control', () => {
    expect(sim.refusal(robot({ abstract_state: 'E_STOP' }), 'START_SURVEY', params, 'me')).toBe('REJECTED_ESTOP')
    expect(sim.refusal(robot({ control_owner: 'u-ana' }), 'START_SURVEY', params, 'me')).toMatch(/REJECTED_CONTROL_HELD/)
    expect(sim.refusal(robot({ control_owner: 'me' }), 'START_SURVEY', params, 'me')).toBeNull()
  })

  it('saves through saving, processing and uploading to a draft map', async () => {
    sim.accept(robot(), 'START_SURVEY', params)
    await vi.advanceTimersByTimeAsync(10_000)
    sim.accept(robot(), 'STOP_SURVEY', { survey_id: 's1', save: true })
    expect(last().state).toBe('saving')
    await vi.advanceTimersByTimeAsync(1500)
    expect(last().state).toBe('processing')
    await vi.advanceTimersByTimeAsync(2000)
    expect(statuses.map((s) => s.state)).toContain('uploading')
    expect(last()).toMatchObject({ state: 'done', map_id: 'map-office-abc', moved_spots: 6 })
    expect(createDraft).toHaveBeenCalledWith({ siteId: 'site-north-yard', name: 'Office', mapId: null, floor: 0 })
  })

  it('discards without making a map, and keeps recording through an E-Stop', async () => {
    sim.accept(robot(), 'START_SURVEY', params)
    await vi.advanceTimersByTimeAsync(5000)
    sim.accept(robot(), 'ESTOP', undefined)
    await vi.advanceTimersByTimeAsync(2000)
    expect(last().state).toBe('recording')
    expect(sim.refusal(robot(), 'STOP_SURVEY', { survey_id: 'other', save: false }, 'me')).toMatch(/REJECTED_INVALID_PARAMS/)
    sim.accept(robot(), 'STOP_SURVEY', { survey_id: 's1', save: false })
    expect(last().state).toBe('discarded')
    expect(createDraft).not.toHaveBeenCalled()
  })

  it('reports a failed upload as failed, with why', async () => {
    createDraft.mockRejectedValueOnce(new Error('the backend is down'))
    sim.accept(robot(), 'START_SURVEY', params)
    await vi.advanceTimersByTimeAsync(4000)
    sim.accept(robot(), 'STOP_SURVEY', { survey_id: 's1', save: true })
    await vi.advanceTimersByTimeAsync(4000)
    expect(last().state).toBe('failed')
    expect(last().error).toMatch(/the backend is down/)
  })
})
