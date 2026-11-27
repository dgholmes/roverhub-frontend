import mqtt, { type MqttClient } from 'mqtt'
import type { LinkPhase } from './linkHealth'

/** The broker login when sign-in is on: the user's id and their session
 * token (roverhub-backend auth/mqtt_hooks.py checks one against the other).
 * Browsers only subscribe, so a read-only ACL is all this unlocks. */
export interface BrokerCredentials {
  username: string
  password: string
}

export interface BrokerConfig {
  wsUrl: string
  /** Omitted when sign-in is off: the broker is then connected to exactly as
   * before sign-in existed, with no login. */
  credentials?: BrokerCredentials
  /** Restricts every subscription to one site. `'+'` (the default) spans all
   * sites, which is what a single-site deployment wants. */
  siteId?: string
  /** Reports transport state changes. Without this, only `connect` was ever
   * handled: mqtt.js retried silently forever, so a broker that was down or
   * dropped mid-session was indistinguishable in the UI from a site with no
   * robots. docs/audit/2026-08-12-ui-ux-audit.md A-06. */
  onPhaseChange?: (phase: LinkPhase) => void
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
  const client = config.credentials
    ? mqtt.connect(config.wsUrl, { username: config.credentials.username, password: config.credentials.password })
    : mqtt.connect(config.wsUrl)
  const site = config.siteId ?? '+'
  const phase = (p: LinkPhase) => config.onPhaseChange?.(p)

  phase('connecting')
  // mqtt.js emits `offline`/`close`/`error` on loss and `reconnect` on each
  // retry. `error` is reported rather than left to become an unhandled event —
  // a bad URL or a refused connection is a fact the operator needs, not a
  // console warning.
  client.on('reconnect', () => phase('reconnecting'))
  client.on('offline', () => phase('offline'))
  client.on('close', () => phase('offline'))
  client.on('error', () => phase('offline'))

  client.on('connect', () => {
    phase('connected')
    // Discovery first: retained, so it lands before the retained /state below
    // and robot entries exist by the time those arrive.
    client.subscribe('roverhub/admin/+/register', { qos: 1 })

    const base = `roverhub/${site}/+`
    client.subscribe(`${base}/telemetry`, { qos: 0 })
    client.subscribe(`${base}/lower_state`, { qos: 0 })
    client.subscribe(`${base}/state`, { qos: 1 })
    client.subscribe(`${base}/heartbeat`, { qos: 0 })
    client.subscribe(`${base}/ack`, { qos: 1 })
    // Edge mission run events (schema 0.0.11). QoS 1 like ack: a missed
    // run_ended is an Ended slot the operator never sees.
    client.subscribe(`${base}/run`, { qos: 1 })
    // Perception (schema 0.0.14): incidents feed the Logs panel; status is
    // retained, so the current one arrives on connect.
    client.subscribe(`${base}/incidents`, { qos: 1 })
    client.subscribe(`${base}/perception/status`, { qos: 1 })
    // The people perception sees (schema 0.0.38): up to 10 Hz while detection
    // runs, not retained. QoS 0: a lost frame is replaced 100 ms later.
    client.subscribe(`${base}/perception/people`, { qos: 0 })
    // Live lidar (schema 0.0.17): ~2 Hz while the robot is placed on a map,
    // not retained. QoS 0: a lost frame is replaced half a second later.
    client.subscribe(`${base}/scan`, { qos: 0 })
    // The robot's own log (schema 0.0.22): the live stream and the answers to
    // The Logs tab's history requests, both on this one topic, not retained.
    // QoS 0 as the device publishes it.
    client.subscribe(`${base}/logs`, { qos: 0 })
    // The live survey (schema 0.0.23): its status is retained, so a survey
    // already running shows on connect; the growing map is QoS 0 and not
    // retained, replaced about every 2 s.
    client.subscribe(`${base}/survey/status`, { qos: 1 })
    client.subscribe(`${base}/survey/map`, { qos: 0 })
    // Where the lidar sits, measured by the robot (schema 0.0.23): retained, so
    // each robot's current LidarMountStatus arrives on connect.
    client.subscribe(`${base}/sensors/lidar_mount`, { qos: 1 })
    // The route Nav2 is planning (schema 0.0.24): <= 2 Hz while a nav goal
    // runs, not retained. QoS 0: a lost frame is replaced within a second.
    client.subscribe(`${base}/nav/path`, { qos: 0 })
  })
  return client
}
