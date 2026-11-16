import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fakeClient = { on: vi.fn(), end: vi.fn(), options: {}, subscribe: vi.fn() }
vi.mock('@/lib/realtime/mqttClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/realtime/mqttClient')>()),
  connectBroker: vi.fn(() => fakeClient),
}))

import { RealDataProvider } from '@/lib/realtime/realDataProvider'
import type { SurveyMapFrame, SurveyStatus } from '@/types/survey'
import { SurveyFeed } from './surveyFeed'

/** survey/status and survey/map through the real provider, and the feed both
 * providers share. */

const status = (over: Record<string, unknown> = {}) => ({
  robot_id: 'rover-jetson', site_id: 'site-dev', state: 'recording', survey_id: 's1', elapsed_s: 10, covered_m2: 4,
  path_length_m: 2, drift: 'good', cameras: 'off', updated_at: '2026-11-16T05:00:10Z', ...over,
})
const frame = (over: Record<string, unknown> = {}) => ({
  robot_id: 'rover-jetson', site_id: 'site-dev', survey_id: 's1', seq: 1, captured_at: 'x', resolution_m: 0.1,
  origin_x_m: 0, origin_y_m: 0, width: 2, height: 2, cells_png_b64: 'AAAA', pose: null, path: [], ...over,
})

describe('SurveyFeed', () => {
  it('hands a late subscriber the latest status and frame at once', () => {
    const feed = new SurveyFeed()
    feed.handleStatusPayload(JSON.stringify(status()))
    feed.handleMapPayload(JSON.stringify(frame()))
    const got: string[] = []
    feed.subscribeStatus('rover-jetson', (s) => got.push(s.state))
    feed.subscribeMap('rover-jetson', (f) => got.push(`frame ${f.seq}`))
    expect(got).toEqual(['recording', 'frame 1'])
  })

  it('never steps back to an older status or frame of the same survey', () => {
    const feed = new SurveyFeed()
    const states: string[] = []
    const seqs: number[] = []
    feed.subscribeStatus('rover-jetson', (s) => states.push(s.state))
    feed.subscribeMap('rover-jetson', (f) => seqs.push(f.seq))
    feed.handleStatusPayload(JSON.stringify(status({ state: 'saving', updated_at: '2026-11-16T05:00:20Z' })))
    feed.handleStatusPayload(JSON.stringify(status({ state: 'recording', updated_at: '2026-11-16T05:00:15Z' })))
    feed.handleMapPayload(JSON.stringify(frame({ seq: 5 })))
    feed.handleMapPayload(JSON.stringify(frame({ seq: 4 })))
    // A new survey starts its own count.
    feed.handleMapPayload(JSON.stringify(frame({ survey_id: 's2', seq: 0 })))
    expect(states).toEqual(['saving'])
    expect(seqs).toEqual([5, 0])
  })

  it('drops malformed payloads and other robots\' messages', () => {
    const feed = new SurveyFeed()
    const got: unknown[] = []
    feed.subscribeStatus('rover-jetson', (s) => got.push(s))
    feed.handleStatusPayload('not json')
    feed.handleStatusPayload(JSON.stringify(status({ state: 'nope' })))
    feed.handleStatusPayload(JSON.stringify(status({ robot_id: 'rover-pi' })))
    expect(got).toEqual([])
    expect(feed.latestStatus('rover-pi')?.robot_id).toBe('rover-pi')
  })
})

describe('RealDataProvider survey topics', () => {
  let provider: RealDataProvider
  const deliver = (topic: string, payload: unknown) => {
    const onMessage = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]
    onMessage?.(topic, Buffer.from(JSON.stringify(payload)))
  }
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] })))
    provider = new RealDataProvider({ wsUrl: 'ws://localhost:9001', apiBaseUrl: 'http://localhost:8000', siteId: 'site-dev' })
  })
  afterEach(() => {
    provider.dispose()
    vi.unstubAllGlobals()
  })

  it('routes survey/status and survey/map by their full suffix', () => {
    const statuses: SurveyStatus[] = []
    const frames: SurveyMapFrame[] = []
    provider.subscribeSurveyStatus('rover-jetson', (s) => statuses.push(s))
    provider.subscribeSurveyMap('rover-jetson', (f) => frames.push(f))
    deliver('roverhub/site-dev/rover-jetson/survey/status', status())
    deliver('roverhub/site-dev/rover-jetson/survey/map', frame())
    // perception/status is not a survey status.
    deliver('roverhub/site-dev/rover-jetson/perception/status', status({ state: 'done' }))
    expect(statuses.map((s) => s.state)).toEqual(['recording'])
    expect(frames.map((f) => f.seq)).toEqual([1])
  })

  it('keeps the retained status for a page that subscribes after it arrived', () => {
    provider.subscribeLinkPhase(() => {})
    deliver('roverhub/site-dev/rover-jetson/survey/status', status({ state: 'processing' }))
    const got: string[] = []
    provider.subscribeSurveyStatus('rover-jetson', (s) => got.push(s.state))
    expect(got).toEqual(['processing'])
  })
})

describe('connectBroker survey subscriptions', () => {
  it('subscribes to survey/status (QoS 1) and survey/map (QoS 0) for every robot', async () => {
    vi.resetModules()
    const client = { on: vi.fn(), subscribe: vi.fn() }
    vi.doMock('mqtt', () => ({ default: { connect: vi.fn(() => client) } }))
    vi.doUnmock('@/lib/realtime/mqttClient')
    const { connectBroker } = await import('@/lib/realtime/mqttClient')
    connectBroker({ wsUrl: 'ws://localhost:9001', siteId: 'site-dev' })
    client.on.mock.calls.find((c) => c[0] === 'connect')?.[1]()
    expect(client.subscribe).toHaveBeenCalledWith('roverhub/site-dev/+/survey/status', { qos: 1 })
    expect(client.subscribe).toHaveBeenCalledWith('roverhub/site-dev/+/survey/map', { qos: 0 })
    vi.doUnmock('mqtt')
  })
})
