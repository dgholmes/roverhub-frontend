import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockClient = { on: vi.fn(), subscribe: vi.fn() }

vi.mock('mqtt', () => ({
  default: { connect: vi.fn(() => mockClient) },
}))

import mqtt from 'mqtt'
import { connectBroker } from './mqttClient'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('connectBroker', () => {
  it('connects to the given WebSocket URL', () => {
    connectBroker({ wsUrl: 'ws://localhost:9001', siteId: 'site-dev', robotId: 'robot-dev-01' })
    expect(mqtt.connect).toHaveBeenCalledWith('ws://localhost:9001')
  })

  it('subscribes to telemetry, state, and heartbeat topics once connected', () => {
    connectBroker({ wsUrl: 'ws://localhost:9001', siteId: 'site-dev', robotId: 'robot-dev-01' })
    const onConnectHandler = mockClient.on.mock.calls.find((call) => call[0] === 'connect')?.[1]
    onConnectHandler?.()
    const base = 'roverhub/site-dev/robot-dev-01'
    expect(mockClient.subscribe).toHaveBeenCalledWith(`${base}/telemetry`, { qos: 0 })
    expect(mockClient.subscribe).toHaveBeenCalledWith(`${base}/state`, { qos: 1 })
    expect(mockClient.subscribe).toHaveBeenCalledWith(`${base}/heartbeat`, { qos: 0 })
  })
})
