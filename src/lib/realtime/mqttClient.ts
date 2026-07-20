import mqtt, { type MqttClient } from 'mqtt'

export interface BrokerConfig {
  wsUrl: string
  siteId: string
  robotId: string
}

/** Thin wrapper around mqtt.js -- connects to the broker's WebSocket
 * listener and subscribes to this robot's telemetry, state, and heartbeat
 * topics. Command/ack (Slice 3) topics are added in a later task. */
export function connectBroker(config: BrokerConfig): MqttClient {
  const client = mqtt.connect(config.wsUrl)
  client.on('connect', () => {
    const base = `roverhub/${config.siteId}/${config.robotId}`
    client.subscribe(`${base}/telemetry`, { qos: 0 })
    client.subscribe(`${base}/state`, { qos: 1 })
    client.subscribe(`${base}/heartbeat`, { qos: 0 })
  })
  return client
}
