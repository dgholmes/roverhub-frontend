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

/** Runs the registered 'connect' handler, which is where subscriptions happen. */
function fireConnect() {
  const handler = mockClient.on.mock.calls.find((call) => call[0] === 'connect')?.[1]
  handler?.()
}

describe('connectBroker', () => {
  it('connects to the given WebSocket URL', () => {
    connectBroker({ wsUrl: 'ws://localhost:9001', siteId: 'site-dev' })
    expect(mqtt.connect).toHaveBeenCalledWith('ws://localhost:9001')
  })

  it('connects with no login when no credentials are given (sign-in off)', () => {
    connectBroker({ wsUrl: 'ws://localhost:9001' })
    expect(vi.mocked(mqtt.connect).mock.calls[0]).toEqual(['ws://localhost:9001'])
  })

  it('logs in with the user id and session token when credentials are given', () => {
    connectBroker({ wsUrl: 'ws://localhost:9001', credentials: { username: 'u-ana', password: 'tok.en' } })
    expect(mqtt.connect).toHaveBeenCalledWith('ws://localhost:9001', { username: 'u-ana', password: 'tok.en' })
  })

  it('subscribes with a robot wildcard so every robot is received, not one', () => {
    connectBroker({ wsUrl: 'ws://localhost:9001', siteId: 'site-dev' })
    fireConnect()
    const base = 'roverhub/site-dev/+'
    expect(mockClient.subscribe).toHaveBeenCalledWith(`${base}/telemetry`, { qos: 0 })
    expect(mockClient.subscribe).toHaveBeenCalledWith(`${base}/state`, { qos: 1 })
    expect(mockClient.subscribe).toHaveBeenCalledWith(`${base}/heartbeat`, { qos: 0 })
    expect(mockClient.subscribe).toHaveBeenCalledWith(`${base}/ack`, { qos: 1 })
  })

  it('subscribes to perception incidents and status, QoS 1', () => {
    connectBroker({ wsUrl: 'ws://localhost:9001', siteId: 'site-dev' })
    fireConnect()
    expect(mockClient.subscribe).toHaveBeenCalledWith('roverhub/site-dev/+/incidents', { qos: 1 })
    expect(mockClient.subscribe).toHaveBeenCalledWith('roverhub/site-dev/+/perception/status', { qos: 1 })
  })

  it('subscribes to every robot\'s mission run events', () => {
    connectBroker({ wsUrl: 'ws://localhost:9001', siteId: 'site-dev' })
    fireConnect()
    expect(mockClient.subscribe).toHaveBeenCalledWith('roverhub/site-dev/+/run', { qos: 1 })
  })

  it('subscribes to lower_state, which was handled but never subscribed to', () => {
    connectBroker({ wsUrl: 'ws://localhost:9001', siteId: 'site-dev' })
    fireConnect()
    expect(mockClient.subscribe).toHaveBeenCalledWith('roverhub/site-dev/+/lower_state', { qos: 0 })
  })

  it('subscribes to bridge registrations, the robot-discovery signal', () => {
    connectBroker({ wsUrl: 'ws://localhost:9001', siteId: 'site-dev' })
    fireConnect()
    // Not site-scoped: the registration topic is roverhub/admin/{bridge_id}/register,
    // with site_id inside the payload rather than in the topic.
    expect(mockClient.subscribe).toHaveBeenCalledWith('roverhub/admin/+/register', { qos: 1 })
  })

  it('spans every site when siteId is omitted', () => {
    connectBroker({ wsUrl: 'ws://localhost:9001' })
    fireConnect()
    expect(mockClient.subscribe).toHaveBeenCalledWith('roverhub/+/+/telemetry', { qos: 0 })
  })

  it('never subscribes to a single hardcoded robot', () => {
    connectBroker({ wsUrl: 'ws://localhost:9001', siteId: 'site-dev' })
    fireConnect()
    const topics = mockClient.subscribe.mock.calls.map((call) => call[0] as string)
    // Every robot segment must be the '+' wildcard. A concrete robot id here
    // would silently pin the UI to one robot again.
    topics
      .filter((t) => !t.startsWith('roverhub/admin/'))
      .forEach((t) => expect(t.split('/')[2]).toBe('+'))
  })
})
