import { describe, expect, it, vi } from 'vitest'

const fakeClient = { on: vi.fn() }

vi.mock('./mqttClient', () => ({
  connectBroker: vi.fn(() => fakeClient),
}))

import { RealDataProvider } from './realDataProvider'
import type { RobotState } from '@/types'

function makeProvider() {
  return new RealDataProvider({
    wsUrl: 'ws://localhost:9001', siteId: 'site-dev', robotId: 'robot-dev-01', robotName: 'Dev Robot',
  })
}

describe('RealDataProvider telemetry mapping', () => {
  it('maps an incoming telemetry frame into a RobotState', () => {
    const provider = makeProvider()
    const received: RobotState[][] = []
    provider.subscribeTelemetry((robots) => received.push(robots))

    const messageHandler = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]
    const frame = {
      robot_id: 'robot-dev-01', site_id: 'site-dev', robot_type: 'wheel',
      pos_body: [1.5, 2.5, 0.0], vel_body: [0.1, 0.0, 0.0],
      speed_ratio: 40, battery_percent: 73.0, obstacle_avoidance_enabled: false,
      grpc_freshness: 'live', captured_at: '2026-07-20T00:00:00Z',
    }
    messageHandler?.('roverhub/site-dev/robot-dev-01/telemetry', Buffer.from(JSON.stringify(frame)))

    expect(received).toHaveLength(1)
    expect(received[0][0].robot_type).toBe('wheel')
    expect(received[0][0].battery.percent).toBe(73.0)
    expect(received[0][0].position.x_m).toBe(1.5)
    expect(received[0][0].obstacle_avoidance).toBe(false)
  })

  it('ignores unparseable payloads', () => {
    const provider = makeProvider()
    const received: RobotState[][] = []
    provider.subscribeTelemetry((robots) => received.push(robots))
    const messageHandler = fakeClient.on.mock.calls.find((call) => call[0] === 'message')?.[1]
    messageHandler?.('roverhub/site-dev/robot-dev-01/telemetry', Buffer.from('not json'))
    expect(received).toHaveLength(0)
  })
})
