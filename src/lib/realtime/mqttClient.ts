import mqtt, { type MqttClient } from 'mqtt'

export interface BrokerConfig {
  wsUrl: string
  siteId: string
  robotId: string
}

/** Thin wrapper around mqtt.js -- connects to the broker's WebSocket
 * listener and subscribes to this robot's telemetry topic. State/heartbeat
 * (Slice 2) and command/ack (Slice 3) topics are added in later tasks. */
export function connectBroker(config: BrokerConfig): MqttClient {
  const client = mqtt.connect(config.wsUrl)
  client.on('connect', () => {
    client.subscribe(`roverhub/${config.siteId}/${config.robotId}/telemetry`, { qos: 0 })
  })
  return client
}
