import mqtt, { type MqttClient } from 'mqtt'

export interface BrokerConfig {
  wsUrl: string
  /** Restricts every subscription to one site. `'+'` (the default) spans all
   * sites, which is what a single-site deployment wants. */
  siteId?: string
}

/** Thin wrapper around mqtt.js -- connects to the broker's WebSocket listener
 * and subscribes to **every** robot's topics, not one hardcoded robot.
 *
 * Previously this took a `robotId` and built a fixed
 * `roverhub/{site}/{robot}/...` prefix, so a browser only ever saw the single
 * robot named in `VITE_ROBOT_ID` at build time. A second robot published
 * telemetry that the backend ingested and `GET /robots` reported, yet the UI
 * could never show it, and switching `selectedRobotId` didn't resubscribe.
 *
 * Every handler in RealDataProvider already routes on the `robot_id` inside the
 * payload rather than on the topic, so widening the filter is all that was
 * needed -- see that file's `upsertRobot`.
 *
 * Two subscriptions here are new rather than merely widened:
 *   - `admin/+/register` is how robots are *discovered*. The bridge publishes it
 *     retained (and re-publishes every heartbeat), so a browser connecting at any
 *     time learns which robots exist -- including ones currently offline and
 *     therefore not publishing telemetry.
 *   - `lower_state` was handled by RealDataProvider but never subscribed to, so
 *     `handleLowerStateMessage` was unreachable and IMU/motor/BMS data never
 *     arrived in the UI at all.
 */
export function connectBroker(config: BrokerConfig): MqttClient {
  const client = mqtt.connect(config.wsUrl)
  const site = config.siteId ?? '+'
  client.on('connect', () => {
    // Discovery first: retained, so it lands before the retained /state below
    // and robot entries exist by the time those arrive.
    client.subscribe('roverhub/admin/+/register', { qos: 1 })

    const base = `roverhub/${site}/+`
    client.subscribe(`${base}/telemetry`, { qos: 0 })
    client.subscribe(`${base}/lower_state`, { qos: 0 })
    client.subscribe(`${base}/state`, { qos: 1 })
    client.subscribe(`${base}/heartbeat`, { qos: 0 })
    client.subscribe(`${base}/ack`, { qos: 1 })
  })
  return client
}
