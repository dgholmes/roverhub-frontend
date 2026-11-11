import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fakeClient = { on: vi.fn(), end: vi.fn(), options: {} }
vi.mock('./mqttClient', () => ({ connectBroker: vi.fn(() => fakeClient) }))

import { RealDataProvider } from './realDataProvider'
import { mockDataProvider } from '@/mocks/mockDataProvider'
import type { ScanSample } from '@/liveops/scanFrame'

/** The live lidar feed through the real provider: `roverhub/{site}/{robot}/scan`
 * in, the latest frame per robot out. */

const frame = (over: Record<string, unknown> = {}) => ({
  robot_id: 'rover-jetson', site_id: 'site-dev', map_id: 'map-office', captured_at: '2026-11-11T09:00:00Z',
  sensor_pose: { x_m: 0, y_m: 0, yaw_rad: 0 }, points: [[1, 2], [3, 4]], ...over,
})

let provider: RealDataProvider
const deliver = (topic: string, payload: unknown) => {
  const onMessage = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]
  onMessage?.(topic, Buffer.from(typeof payload === 'string' ? payload : JSON.stringify(payload)))
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => [] })))
  provider = new RealDataProvider({ wsUrl: 'ws://localhost:9001', apiBaseUrl: 'http://localhost:8000', siteId: 'site-dev' })
})
afterEach(() => {
  provider.dispose()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('RealDataProvider.subscribeScan', () => {
  it('delivers each valid frame for its robot, stamped with when it arrived', () => {
    const got: ScanSample[] = []
    provider.subscribeScan('rover-jetson', (s) => got.push(s))
    vi.setSystemTime(1_000_000)
    deliver('roverhub/site-dev/rover-jetson/scan', frame())
    expect(got).toHaveLength(1)
    expect(got[0].frame.points).toEqual([[1, 2], [3, 4]])
    expect(got[0].receivedAt).toBe(1_000_000)
  })

  it('routes by the frame\'s robot, and drops malformed frames', () => {
    const got: ScanSample[] = []
    provider.subscribeScan('rover-jetson', (s) => got.push(s))
    deliver('roverhub/site-dev/rover-pi/scan', frame({ robot_id: 'rover-pi' }))
    deliver('roverhub/site-dev/rover-jetson/scan', 'not json')
    deliver('roverhub/site-dev/rover-jetson/scan', frame({ points: [[1, Number.NaN]] }))
    deliver('roverhub/site-dev/rover-jetson/scan', frame({ points: 'x' }))
    expect(got).toHaveLength(0)
  })

  it('hands a late subscriber the latest frame at once, and stops after unsubscribe', () => {
    provider.subscribeLinkPhase(() => {}) // connected, before anyone wants rover-jetson's scan
    deliver('roverhub/site-dev/rover-jetson/scan', frame({ map_id: 'first' }))
    deliver('roverhub/site-dev/rover-jetson/scan', frame({ map_id: 'second' }))
    const got: ScanSample[] = []
    const off = provider.subscribeScan('rover-jetson', (s) => got.push(s))
    expect(got.map((s) => s.frame.map_id)).toEqual(['second'])
    off()
    deliver('roverhub/site-dev/rover-jetson/scan', frame())
    expect(got).toHaveLength(1)
  })
})

describe('mockDataProvider.subscribeScan', () => {
  it('sends no frames: the mock robots stand on no surveyed map', () => {
    const listener = vi.fn()
    const off = mockDataProvider.subscribeScan('robot-1', listener)
    vi.advanceTimersByTime(10_000)
    expect(listener).not.toHaveBeenCalled()
    off()
  })
})
