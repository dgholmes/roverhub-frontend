import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fakeClient = { on: vi.fn(), end: vi.fn(), options: {} }
vi.mock('./mqttClient', () => ({ connectBroker: vi.fn(() => fakeClient) }))

import { RealDataProvider } from './realDataProvider'
import { ApiError } from './apiError'
import { MOCK_LOG_ANSWER_MS, MOCK_LOG_TRICKLE_MS, MockDataProvider } from '@/mocks/mockDataProvider'
import { AMCL_REPEAT_MESSAGE } from '@/mocks/mockLogs'
import type { LogBatch } from '@/types/logs'

/** Systems › Logs through both providers: `roverhub/{site}/{robot}/logs` in,
 * batches per robot out, and POST /robots/{id}/logs/request. */

const wireLine = (over: Record<string, unknown> = {}) => ({
  at: '2026-11-13T05:00:46.960+00:00', source: 'bridge', level: 'info', logger: 'robot_bridge.command_sender',
  message: 'command received: NAV_GOTO', repeat: 1, last_at: null, ...over,
})
const wireBatch = (over: Record<string, unknown> = {}) => ({
  robot_id: 'rover-jetson', site_id: 'site-dev', request_id: null, lines: [wireLine()], done: false, truncated: false, error: null, ...over,
})

describe('RealDataProvider logs', () => {
  let provider: RealDataProvider
  let fetchMock: ReturnType<typeof vi.fn>
  const deliver = (topic: string, payload: unknown) => {
    const onMessage = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]
    onMessage?.(topic, Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)))
  }
  const respond = (status: number, body: unknown) => {
    fetchMock.mockImplementation(async (url: string) => (String(url).endsWith('/robots')
      ? { ok: true, status: 200, json: async () => [] }
      : { ok: status < 300, status, json: async () => body }))
  }

  beforeEach(() => {
    vi.clearAllMocks()
    fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => [] }))
    vi.stubGlobal('fetch', fetchMock)
    provider = new RealDataProvider({ wsUrl: 'ws://localhost:9001', apiBaseUrl: 'http://localhost:8000', siteId: 'site-dev' })
  })
  afterEach(() => {
    provider.dispose()
    vi.unstubAllGlobals()
  })

  it('delivers each batch to its robot\'s readers, live and answers alike', () => {
    const got: LogBatch[] = []
    provider.subscribeRobotLogs('rover-jetson', (b) => got.push(b))
    deliver('roverhub/site-dev/rover-jetson/logs', wireBatch())
    deliver('roverhub/site-dev/rover-jetson/logs', wireBatch({ request_id: 'a1b2c3', done: true, truncated: true }))
    expect(got).toHaveLength(2)
    expect(got[0]).toMatchObject({ request_id: null, done: false, lines: [{ message: 'command received: NAV_GOTO', repeat: 1 }] })
    expect(got[1]).toMatchObject({ request_id: 'a1b2c3', done: true, truncated: true })
  })

  it('routes by the batch\'s robot, drops malformed batches and lines, and stops after unsubscribe', () => {
    const got: LogBatch[] = []
    const off = provider.subscribeRobotLogs('rover-jetson', (b) => got.push(b))
    deliver('roverhub/site-dev/rover-pi/logs', wireBatch({ robot_id: 'rover-pi' }))
    deliver('roverhub/site-dev/rover-jetson/logs', 'not json')
    deliver('roverhub/site-dev/rover-jetson/logs', { robot_id: 'rover-jetson' })
    deliver('roverhub/site-dev/rover-jetson/logs', wireBatch({ lines: [wireLine(), wireLine({ level: 'loud' })] }))
    expect(got).toHaveLength(1)
    expect(got[0].lines).toHaveLength(1)
    off()
    deliver('roverhub/site-dev/rover-jetson/logs', wireBatch())
    expect(got).toHaveLength(1)
  })

  it('asks through the backend and returns the id the answer will carry', async () => {
    respond(200, { request_id: '0123456789ab', since: '2026-11-13T04:00:00+00:00' })
    const ticket = await provider.requestRobotLogs('rover-jetson', { sinceHours: 6 })
    expect(ticket).toEqual({ requestId: '0123456789ab', since: '2026-11-13T04:00:00+00:00' })
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/logs/request'))!
    expect(call[0]).toBe('http://localhost:8000/robots/rover-jetson/logs/request')
    expect(call[1]).toMatchObject({ method: 'POST' })
    expect(JSON.parse(call[1].body)).toEqual({ since_hours: 6 })
  })

  it('surfaces the backend\'s detail on 409 and 503', async () => {
    respond(409, { detail: 'rover-jetson is offline, so its log can\'t be read' })
    const offline = await provider.requestRobotLogs('rover-jetson', { sinceHours: 1 }).catch((e: unknown) => e)
    expect(offline).toBeInstanceOf(ApiError)
    expect(offline).toMatchObject({ status: 409, detail: 'rover-jetson is offline, so its log can\'t be read' })
    respond(503, { detail: 'could not send the log request to the broker (rc=4); the robot was not asked' })
    expect(await provider.requestRobotLogs('rover-jetson', { sinceHours: 1 }).catch((e: unknown) => e))
      .toMatchObject({ status: 503, detail: expect.stringContaining('the robot was not asked') })
  })
})

describe('mockDataProvider logs', () => {
  let mock: MockDataProvider
  const robotId = 'zaezae-x1-001'
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-13T05:00:00Z'))
    mock = new MockDataProvider()
  })
  afterEach(() => {
    mock.dispose()
    vi.useRealTimers()
  })

  it('answers a request with the robot\'s history in batches, the last one done', async () => {
    const got: LogBatch[] = []
    mock.subscribeRobotLogs(robotId, (b) => got.push(b))
    const ticket = await mock.requestRobotLogs(robotId, { sinceHours: 1 })
    expect(ticket.since).toBe('2026-11-13T04:00:00.000Z')
    expect(got).toHaveLength(0)
    vi.advanceTimersByTime(MOCK_LOG_ANSWER_MS)
    const answer = got.filter((b) => b.request_id === ticket.requestId)
    expect(answer[answer.length - 1].done).toBe(true)
    expect(answer.slice(0, -1).every((b) => !b.done)).toBe(true)
    const lines = answer.flatMap((b) => b.lines)
    const text = lines.map((l) => l.message)
    expect(text).toEqual(expect.arrayContaining([
      'command received: NAV_GOTO', 'nav goal 2 accepted', 'nav goal succeeded',
      'resuming nav goal after the lidar corrected the position by 0.40 m / 2.9 deg',
    ]))
    expect(text.some((m) => m.startsWith('nav stopped: localization_lost'))).toBe(true)
    expect(text.some((m) => m.startsWith('idle re-localisation'))).toBe(true)
    expect(lines.find((l) => l.message === AMCL_REPEAT_MESSAGE)).toMatchObject({ source: 'nav', level: 'warn', repeat: 412 })
    expect(lines.every((l) => Date.parse(l.at) >= Date.parse(ticket.since))).toBe(true)
  })

  it('answers only the sources asked for, and reaches further back for a longer range', async () => {
    const got: LogBatch[] = []
    mock.subscribeRobotLogs(robotId, (b) => got.push(b))
    const bridgeOnly = await mock.requestRobotLogs(robotId, { sinceHours: 1, sources: ['bridge'] })
    const day = await mock.requestRobotLogs(robotId, { sinceHours: 24 })
    vi.advanceTimersByTime(MOCK_LOG_ANSWER_MS)
    const linesOf = (id: string) => got.filter((b) => b.request_id === id).flatMap((b) => b.lines)
    expect(linesOf(bridgeOnly.requestId).every((l) => l.source === 'bridge')).toBe(true)
    expect(linesOf(day.requestId).length).toBeGreaterThan(linesOf(bridgeOnly.requestId).length)
    expect(linesOf(day.requestId).some((l) => l.logger === 'systemd' && l.level === 'error')).toBe(true)
    expect(got.filter((b) => b.request_id === day.requestId).every((b) => b.lines.length <= 200)).toBe(true)
  })

  it('trickles live lines while someone reads, and stops when they leave', () => {
    const got: LogBatch[] = []
    const off = mock.subscribeRobotLogs(robotId, (b) => got.push(b))
    vi.advanceTimersByTime(MOCK_LOG_TRICKLE_MS * 3)
    expect(got).toHaveLength(3)
    expect(got.every((b) => b.request_id === null && !b.done)).toBe(true)
    // Every third tick re-sends the AMCL fold with a larger count.
    expect(got[2].lines.find((l) => l.message === AMCL_REPEAT_MESSAGE)!.repeat).toBeGreaterThan(412)
    off()
    vi.advanceTimersByTime(MOCK_LOG_TRICKLE_MS * 3)
    expect(got).toHaveLength(3)
  })

  it('refuses like the backend: 404 for an unknown robot, 409 for one whose bridge is down', async () => {
    expect(await mock.requestRobotLogs('nope', { sinceHours: 1 }).catch((e: unknown) => e)).toMatchObject({ status: 404 })
    mock.getRobots()[0].connectivity.bridge_state = 'offline'
    const refused = await mock.requestRobotLogs(robotId, { sinceHours: 1 }).catch((e: unknown) => e)
    expect(refused).toBeInstanceOf(ApiError)
    expect(refused).toMatchObject({ status: 409, detail: `${robotId} is offline, so its log can't be read` })
  })
})
