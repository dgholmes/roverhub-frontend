import type { ActiveRun, DeviceAcceptance, EdgeHostInfo, EdgeHostMetrics, NavGoalStatus } from '@/types/robotState'
import type { Step } from '@/missions/program/types'
import type { MissionLibraryEntry, MissionTask, TaskOccurrence } from '@/types'
import type { MapArtifactKind, MapStatus, MapZone, SiteMap } from '@/types/maps'
import { apiErrorFrom } from './apiError'
import type { MqttClient } from 'mqtt'
import type { Command, CommandType, LegConfig, Posture, RobotImuState, RobotMotorState, RobotState, SnapshotPage, SnapshotQuery, SnapshotRecord, TimelineEvent, Incident, PerceptionStatus, MissionRun, RunDetail, RunEvent, RunPage, RunQuery } from '@/types'
import { mockDataProvider } from '@/mocks/mockDataProvider'
import { DRIVE_SPEED_RATIO } from '@/lib/teleop'
import { capabilitiesFor } from '@/lib/robotCapabilities'
import { positionFromFrame } from './framePosition'
import { grpcAfterTelemetry } from '@/lib/connectivityHealth'
import { decodeToRobotPcm } from '@/lib/audioPcm'
import { connectBroker, type BrokerCredentials } from './mqttClient'
import type { LinkPhase } from './linkHealth'
import { ackDeadlineMs, SAFETY_ACK_TIMEOUT_MS, ROUTINE_ACK_TIMEOUT_MS } from './commandDeadline'
import { currentOperatorId } from './operator'
import { isMissionOwner, isNavOwner } from '@/liveops/controlOwner'
import { apiFetch } from '@/lib/auth/apiFetch'
import { runStartError, type StartRunRequest } from './runStart'

type TelemetryListener = (robots: RobotState[]) => void
type EventListener = (event: TimelineEvent) => void
type RunEventListener = (event: RunEvent) => void

/** command_id prefix of a command whose POST timed out (see `localFailure`).
 * Such a POST may still have reached the backend, and so the robot. */
export const LOCAL_FAILURE_PREFIX = 'local-fail-'

/** command_id prefix of a command that certainly never reached the robot: the
 * request could not be made at all, or the backend answered it with an error. */
export const LOCAL_REJECTED_PREFIX = 'local-rejected-'

/** Ack stages after which nothing more is expected for a command. */
const TERMINAL_ACK_STAGES = new Set<Command['current_stage']>(['execution_completed', 'execution_failed', 'timed_out', 'cancelled'])

/** TAKE_CONTROL / RELEASE_CONTROL outcomes in which the bridge did not change
 * who holds control, so the optimistic owner is put back. */
const CONTROL_NOT_TAKEN = new Set<Command['current_stage']>(['execution_failed', 'timed_out', 'cancelled'])

/**
 * How long a dispatched command may go without a terminal ack before the
 * operator is told it failed.
 *
 * Silence is not a pending state. Without these, a command whose ack never
 * arrived — bridge down after the POST succeeded, MQTT dropped, edge crashed
 * mid-execution — sat at "Sending…" indefinitely and leaked its entry in
 * `pendingCommandCallbacks`. The `timed_out` stage was already rendered by
 * `CommandAckToast` and simply never produced by anything.
 *
 * Safety-class commands get the shorter budget: an operator who has pressed
 * E-Stop needs to know within seconds that it did not land, so they can reach
 * for the physical stop. docs/audit/2026-08-12-ui-ux-audit.md A-05.
 */
export { SAFETY_ACK_TIMEOUT_MS, ROUTINE_ACK_TIMEOUT_MS }

/** Bounds the POST itself, so a request that never resolves cannot leave the
 * operator without feedback. Kept under the routine ack budget. */
export const POST_TIMEOUT_MS = 8_000

/** Turns a thrown value into something an operator can act on. Distinguishes
 * "we gave up waiting" from "the network refused us" from "the cloud said no",
 * because the operator's next move differs in each case. */
/** Only a POST we gave up waiting on may have reached the backend. A fetch
 * TypeError never left the browser, and an HTTP error is the backend refusing. */
function postMayHaveLanded(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError'
}

function failureReasonFor(err: unknown): string {
  if (err instanceof DOMException && err.name === 'AbortError') {
    return `The cloud did not respond within ${Math.round(POST_TIMEOUT_MS / 1000)}s. Check the connection to the cloud service.`
  }
  if (err instanceof TypeError) {
    // fetch rejects with TypeError for DNS/CORS/offline — i.e. the request
    // never reached the server at all.
    return 'Could not reach the cloud service. The command was not sent.'
  }
  return err instanceof Error && err.message ? err.message : 'The command could not be sent.'
}

interface RealDataProviderConfig {
  wsUrl: string
  apiBaseUrl: string
  /** Optional site filter. Omitted/undefined spans every site, which is what a
   * single-site deployment wants. */
  siteId?: string
  /** How to reach the broker. Defaults to `open` (no login), which is how the
   * console connects with sign-in off. See `setBrokerSession`. */
  brokerSession?: BrokerSession
}

/** Whether, and as whom, to connect to the broker.
 *  - `open`: sign-in is off; connect with no login, as before sign-in existed.
 *  - `signedIn`: connect as this user.
 *  - `closed`: signed out, or not known yet; do not connect. */
export type BrokerSession =
  | { kind: 'open' }
  | { kind: 'signedIn'; credentials: BrokerCredentials }
  | { kind: 'closed' }

function sameBrokerSession(a: BrokerSession, b: BrokerSession): boolean {
  if (a.kind !== b.kind) return false
  if (a.kind === 'signedIn' && b.kind === 'signedIn') {
    return a.credentials.username === b.credentials.username && a.credentials.password === b.credentials.password
  }
  return true
}

/** A robot the backend knows about, from `GET /robots`. */
interface RegistryRobotWire {
  robot_id: string
  site_id: string
  robot_type: 'quad' | 'wheel'
  name: string
  online: boolean
  abstract_state: string | null
  last_seen: string | null
  // From 0.0.9 backends (feature/device-metadata); absent from older ones.
  bridge_id?: string | null
  acceptance?: DeviceAcceptance
  host?: EdgeHostInfo | null
  host_metrics?: EdgeHostMetrics | null
}

/** The retained bridge-registration payload (connection_manager.py's
 * publish_registration). This is the discovery signal: it exists for every
 * robot a bridge has ever announced, including ones currently offline. */
interface RegistrationWire {
  bridge_id: string
  site_id: string
  robot_id: string
  robot_type: 'quad' | 'wheel'
  schema_version?: string
  /** 0.0.9 bridges only. */
  host?: EdgeHostInfo | null
}

/** Exported so the drift test can compare it with the Python set. */
export const WIRED_COMMAND_TYPES = new Set<CommandType>([
  'ESTOP', 'RESET_ESTOP', 'TAKE_CONTROL', 'RELEASE_CONTROL', 'SET_OBSTACLE_AVOIDANCE',
  'SET_STATE', 'SET_GAIT', 'CHANGE_MODE', 'SET_SPEED_RATIO', 'VELOCITY_SEQUENCE',
  // Held velocity setpoint for manual driving. Must mirror
  // shared/schemas/commands.py's WIRED_COMMAND_TYPES -- a type missing here
  // silently delegates to mockDataProvider instead of reaching the robot.
  'DRIVE',
  'LINE_WALK', 'ROTATE', 'CIRCLE',
  'BALANCE_AXIS', 'BALANCE_NEUTRAL', 'BALANCE_SEQUENCE', 'DYNAMIC_POSE', 'STATIC_POSE',
  'LED_SIGNAL', 'SPEAK', 'STOP_SPEAK', 'SET_SPEAK_VOLUME',
  // Wired 2026-08-13. The "camera DDS plumbing" it waited on exists and is
  // confirmed on hardware; the bridge captures the frame stream_manager already
  // holds, uploads it, and returns {snapshot_id, camera} in the ack's `result`.
  'SNAPSHOT',
  // Edge mission runs (schema 0.0.11). START_MISSION is sent by POST /robots/{id}/runs,
  // never through /commands, which refuses it; STOP_MISSION goes through /commands.
  'START_MISSION', 'STOP_MISSION',
  // Tap-to-walk (schema 0.0.15): walk to a map point, and cancel that walk.
  'NAV_GOTO', 'NAV_CANCEL',
  // The operator places the robot on the map (ResetPositionParams: x_m, y_m,
  // heading_deg, map_id, floor_id) to seed lidar localisation.
  'RESET_POSITION',
])

interface TelemetryFrameWire {
  robot_id: string
  site_id: string
  robot_type: 'quad' | 'wheel'
  pos_body: [number, number, number]
  vel_body: [number, number, number]
  acc_body: [number, number, number]
  omega_body: [number, number, number]
  ori_body: [number, number, number]
  jpos_leg: number[]
  jvel_leg: number[]
  jtau_leg: number[]
  grf_left: [number, number, number]
  grf_right: [number, number, number]
  speed_ratio: number
  // Nullable since shared 0.0.4 (audit F1): gRPC carries no battery field, so a
  // bridge without the DDS BMS subscription genuinely does not know. Typed as
  // plain `number` before, which let it flow into the UI unchecked.
  battery_percent: number | null
  obstacle_avoidance_enabled: boolean
  grpc_freshness: 'live' | 'stale' | 'missing'
  captured_at: string
  /** shared TelemetryFrame.position (0.0.15): the bridge's RobotPosition.
   * Unvalidated -- positionFromFrame checks it. Absent from older bridges. */
  position?: unknown
}

/** Real MQTT-backed data provider -- same shape as mockDataProvider so
 * useLiveOpsStore doesn't change. Telemetry, state, and heartbeat topics are
 * wired for real (Slices 1-2). Of the command types, the 29 in
 * WIRED_COMMAND_TYPES POST to the backend and resolve their ACK progression
 * from the `ack` topic. Only the 6 unwired types (PAUSE/RESUME/RETURN/DOCK and
 * ANNOUNCE/CANCEL_ANNOUNCEMENT, none part of the edge executor yet) still
 * delegate to mockDataProvider, and
 * those outcomes carry `simulated: true` so the UI can say so.
 * `subscribeEvents` is NO LONGER a mock fallback -- it derives the Logs panel
 * from real terminal ack stages (see its own doc comment). `driveRobot`
 * is wired for real too -- unlike mockDataProvider's driveRobot (a synthetic,
 * dead-reckoned position nudge with no ack), it publishes a held velocity
 * setpoint as a `DRIVE` command through the same POST path as any other wired
 * command. The bridge holds the resulting velocity sequence; this only sends
 * intent, on change plus a keepalive. It previously sent one bounded
 * `VELOCITY_SEQUENCE` burst per 250 ms tick on the belief that the bridge had no
 * continuous-velocity concept -- that cost the robot a settle four times a
 * second and half its achievable speed. See the `driveRobot` method doc. */
/** How long an ack that beat its POST response is kept for it (see
 * RealDataProvider.applyAck). The POST is bounded by POST_TIMEOUT_MS, so
 * anything older belongs to someone else. */
const EARLY_ACK_HOLD_MS = 30_000
const EARLY_ACK_MAX = 200

export class RealDataProvider {
  private config: RealDataProviderConfig
  private client: MqttClient | null = null
  private robots: RobotState[] = []
  private telemetryListeners = new Set<TelemetryListener>()
  private eventListeners = new Set<EventListener>()
  /** Latest retained perception/status per robot, for phase 3's UI. */
  private perceptionStatus = new Map<string, PerceptionStatus>()
  /** Incident ids already shown. QoS 1 is at-least-once, so the broker may
   * deliver one twice; bounded so a long session does not grow it forever. */
  private seenIncidents = new Set<string>()
  /** robot_id -> listeners for that robot's `.../run` events. */
  private runEventListeners = new Map<string, Set<RunEventListener>>()
  /** robot_id -> this tab's TAKE_CONTROLs dispatched and not yet at a terminal
   * stage. See ownerFromState. */
  private takesInFlight = new Map<string, number>()
  /** robot_id -> this tab's RELEASE_CONTROLs not yet at a terminal stage. See
   * ownerFromState. */
  private releasesInFlight = new Map<string, number>()
  /** robot_id -> the control owner the bridge's /state last reported. Absent
   * for a bridge that predates the field. This is what a failed TAKE/RELEASE
   * puts back, because it is the truth; the owner seen at dispatch may be stale
   * by then (hardware test 2026-10-30). */
  private wireOwners = new Map<string, string | null>()
  private pendingCommandCallbacks = new Map<string, (command: Command) => void>()
  /** robot_id -> display name, from the backend registry. No MQTT topic carries
   * a name, so without this a robot discovered purely over MQTT falls back to
   * showing its robot_id. */
  private robotNames = new Map<string, string>()
  /** command_ids from driveRobot's own bursts -- these still go through
   * postCommand/handleAckMessage like any other wired command (so the drive
   * loop gets real acks), but must never surface as a log/alert entry: at
   * one burst per DRIVE_TICK_MS while a key is held, logging every
   * completion would flood the Logs panel uselessly. */
  private silentCommandIds = new Set<string>()
  /** Ack deadlines, keyed by command_id. Cleared when a terminal ack lands. */
  private ackTimers = new Map<string, ReturnType<typeof setTimeout>>()
  /** Acks that arrived before their command's POST had returned its id -- see
   * applyAck. Held briefly, newest per command, then forgotten. */
  private earlyAcks = new Map<string, { command: Command; at: number }>()
  /** Distinguishes locally-synthesised failures from backend command_ids. */
  private localFailureSeq = 0

  private brokerSession: BrokerSession

  constructor(config: RealDataProviderConfig) {
    this.config = config
    this.brokerSession = config.brokerSession ?? { kind: 'open' }
  }

  /** Change who the broker connection logs in as -- on sign-in, sign-out, or
   * when boot learns whether sign-in is on. Drops the current connection, and
   * reconnects under the new session if anything is listening and the session
   * allows it. Unchanged sessions do nothing, so this is safe to call on every
   * session-store update. */
  setBrokerSession(session: BrokerSession): void {
    if (sameBrokerSession(this.brokerSession, session)) return
    const previous = this.brokerSession
    this.brokerSession = session
    // Same person, renewed token (authStore refreshes halfway through each
    // token's life): keep the connection -- the broker checked the password
    // when it let us in, and dropping it would blank telemetry mid-drive every
    // few hours. Only a later reconnect needs the new password, so hand it to
    // mqtt.js, which re-sends its options on every reconnect.
    if (previous.kind === 'signedIn' && session.kind === 'signedIn'
        && previous.credentials.username === session.credentials.username) {
      if (this.client) this.client.options.password = session.credentials.password
      return
    }
    const hadClient = this.client !== null
    this.client?.end(true)
    this.client = null
    if (session.kind === 'closed') {
      this.setLinkPhase('offline')
      return
    }
    const listening = this.linkListeners.size > 0 || this.telemetryListeners.size > 0 || this.eventListeners.size > 0
    if (hadClient || listening) this.ensureConnected()
  }

  /** Ends the broker connection and drops every listener, timer and pending
   * ack, so an instance that is being replaced stops doing work. Exists for
   * Vite's HMR: dataProvider.ts builds a new provider each time this module is
   * re-executed, and without this the old one kept its WebSocket, its
   * subscriptions and its ~30 messages/s of telemetry handling alive, orphaned,
   * for the life of the tab -- once per edit of anything this file imports,
   * i18n locale files included. See dataProvider.ts. */
  dispose(): void {
    for (const timer of this.ackTimers.values()) clearTimeout(timer)
    this.ackTimers.clear()
    this.pendingCommandCallbacks.clear()
    this.silentCommandIds.clear()
    this.telemetryListeners.clear()
    this.eventListeners.clear()
    this.runEventListeners.clear()
    this.takesInFlight.clear()
    this.releasesInFlight.clear()
    this.wireOwners.clear()
    this.linkListeners.clear()
    // force: drop the socket now rather than after the in-flight queue drains;
    // nothing this instance still has to say is worth keeping it alive for.
    this.client?.end(true)
    this.client = null
  }

  getRobots(): RobotState[] {
    return this.robots
  }

  /** Placeholder entry for a robot we know exists but have no live data for
   * yet -- created by discovery (`GET /robots`, or a retained registration),
   * or by whichever topic happens to arrive first.
   *
   * Everything here is deliberately a *pessimistic* placeholder rather than a
   * plausible-looking guess: connectivity is `unavailable`/`offline` until a
   * real heartbeat says otherwise. A robot that is registered but not
   * publishing should read as offline, not as a healthy robot sitting still.
   *
   * Battery is `null` -- unknown -- and NOT 0. This previously used 0 on the
   * reasoning that it was pessimistic rather than invented, but 0 is invented:
   * it renders as "0%", indistinguishable from a genuinely flat battery, on a
   * robot that has told us nothing at all. That is exactly the fabrication
   * audit F1 removed from the bridge and the telemetry schemas, still being
   * produced here. A powered-down robot now reads "—" via
   * formatBatteryPercent, which is the truth. */
  private skeletonRobot(robotId: string, siteId: string, robotType: RobotState['robot_type'], name: string): RobotState {
    return {
      robot_id: robotId,
      name,
      site_id: siteId,
      robot_type: robotType,
      abstract_state: 'FAULT',
      posture: 'unknown',
      sdk_state: 'unknown',
      battery: { percent: null, est_runtime_min: 0, charging: false },
      position: {
        x_m: 0,
        y_m: 0,
        z_m: 0,
        heading_deg: 0,
        provider: 'dead_reckoning',
        // 'lost', not 'estimated': freshness is 'missing' -- no data has ever
        // arrived, so this (0, 0, 0deg) is fabricated, not a real estimate.
        // Mirrors position_provider.py's no-frame branch on the bridge.
        quality: 'lost',
        accuracy_m: null,
        freshness: 'missing',
        updated_at: new Date(0).toISOString(),
      },
      speed_mps: 0,
      speed_ratio: 0,
      gait: capabilitiesFor(robotType).defaultGait,
      obstacle_avoidance: false,
      connectivity: {
        robot_to_edge: 'unavailable',
        edge_to_cloud: 'offline',
        bridge_state: 'offline',
        bridge_latency_ms: null,
        dds: 'unavailable',
        grpc: 'unavailable',
      },
      maintenance_flagged: false,
      control_owner: null,
      active_run: null,
      nav_goal: null,
      bridge_boot_id: null,
      available_motions: [],
      updated_at: new Date(0).toISOString(),
    }
  }

  /** Merge a partial update into one robot, creating its entry if this is the
   * first we've heard of it, then notify listeners.
   *
   * This exists because only `handleTelemetryMessage` used to create entries --
   * `/state`, `/heartbeat` and `/lower_state` all did `robots.map(...)` and so
   * silently dropped anything for an unknown robot. That was a real bug with
   * multiple robots: `/state` is published **retained**, so a browser connecting
   * receives it for every robot immediately, before any telemetry has arrived --
   * and every one of those was discarded. The UI then showed each robot's
   * abstract_state as the interim 'STAND' default until something else
   * republished, which is exactly the "UI says Standing but the robot is
   * passive" class of bug that making /state retained was meant to prevent. */
  private upsertRobot(
    robotId: string,
    patch: (existing: RobotState | undefined) => Partial<RobotState>,
    seed?: { siteId?: string; robotType?: RobotState['robot_type']; name?: string },
  ): void {
    const existing = this.robots.find((r) => r.robot_id === robotId)
    const base =
      existing ??
      this.skeletonRobot(
        robotId,
        seed?.siteId ?? this.config.siteId ?? 'unknown',
        seed?.robotType ?? 'quad',
        seed?.name ?? this.robotNames.get(robotId) ?? robotId,
      )
    const next: RobotState = { ...base, ...patch(existing) }
    this.robots = existing
      ? this.robots.map((r) => (r.robot_id === robotId ? next : r))
      : // Newly-seen robots go first so the operator notices them, matching the
        // previous behaviour of handleTelemetryMessage.
        [next, ...this.robots]
    this.telemetryListeners.forEach((listener) => listener(this.robots))
  }

  /** Discover robots from the backend registry. MQTT's retained registration
   * messages cover this too, but the registry is the authoritative source of a
   * robot's display *name* (which no MQTT topic carries), and it still lists
   * robots whose retained messages the broker lost -- this project's
   * mosquitto.conf sets `persistence false`, so a broker restart drops them all
   * until each bridge's next heartbeat republish. Failure is non-fatal: MQTT
   * discovery alone still populates the UI, just with robot_id as the name. */
  private async discoverRobots(): Promise<void> {
    try {
      const response = await apiFetch(`${this.config.apiBaseUrl}/robots`)
      if (!response.ok) return
      const registry: RegistryRobotWire[] = await response.json()
      registry.forEach((r) => {
        if (this.config.siteId && r.site_id !== this.config.siteId) return
        this.robotNames.set(r.robot_id, r.name)
        this.upsertRobot(r.robot_id, (existing) => ({
          ...(existing ? { name: r.name } : {}),
          ...(r.acceptance || r.host || r.host_metrics ? {
            bridge: {
              ...(existing?.bridge ?? { bridge_id: r.bridge_id ?? 'unknown', schema_version: null, last_heartbeat_at: null, mission_active: false }),
              ...(r.acceptance ? { acceptance: r.acceptance } : {}),
              ...(r.host && !existing?.bridge?.host ? { host: r.host } : {}),
              ...(r.host_metrics && !existing?.bridge?.host_metrics ? { host_metrics: r.host_metrics } : {}),
            },
          } : {}),
        }), {
          siteId: r.site_id,
          robotType: r.robot_type,
          name: r.name,
        })
      })
    } catch {
      // Offline backend or CORS failure -- MQTT discovery still works.
    }
  }

  /** A bridge announcing itself. Retained, so this is how a browser learns about
   * robots that exist but aren't currently publishing telemetry. */
  private handleRegistrationMessage(payload: Buffer): void {
    let reg: RegistrationWire
    try {
      reg = JSON.parse(payload.toString())
    } catch {
      return
    }
    if (this.config.siteId && reg.site_id !== this.config.siteId) return
    const bridgeFromRegistration = (existing: RobotState | undefined): RobotState['bridge'] => ({
      bridge_id: reg.bridge_id,
      schema_version: reg.schema_version ?? null,
      last_heartbeat_at: existing?.bridge?.last_heartbeat_at ?? null,
      mission_active: existing?.bridge?.mission_active ?? false,
      raw_registration: reg as unknown as Record<string, unknown>,
      raw_heartbeat: existing?.bridge?.raw_heartbeat,
      host: reg.host ?? existing?.bridge?.host,
      host_metrics: existing?.bridge?.host_metrics,
      acceptance: existing?.bridge?.acceptance,
    })
    this.upsertRobot(reg.robot_id, (existing) => (existing
      ? { robot_type: reg.robot_type, bridge: bridgeFromRegistration(existing) }
      : { bridge: bridgeFromRegistration(undefined) }), {
      siteId: reg.site_id,
      robotType: reg.robot_type,
    })
  }

  subscribeTelemetry(listener: TelemetryListener): () => void {
    this.telemetryListeners.add(listener)
    this.ensureConnected()
    return () => {
      this.telemetryListeners.delete(listener)
    }
  }

  /** Real command-outcome log, derived from actual ack terminal stages
   * (execution_completed/execution_failed) instead of delegating to
   * mockDataProvider's fabricated events -- the Logs panel was previously
   * showing synthetic activity even in real mode, with zero connection to
   * what the edge bridge/robot actually did. */
  subscribeEvents(listener: EventListener): () => void {
    this.eventListeners.add(listener)
    // Perception incidents arrive over MQTT, so the Logs panel needs the
    // broker even when nothing else on the page has opened it.
    this.ensureConnected()
    return () => {
      this.eventListeners.delete(listener)
    }
  }

  /** A robot's mission run events, live from `roverhub/{site}/{robot}/run`.
   * Nothing is replayed: the topic is not retained, so a tab that opens mid-run
   * sees only what follows. What the run is doing *now* comes from /state's
   * `active_run`, which is retained; these say what happened. */
  subscribeRunEvents(robotId: string, listener: RunEventListener): () => void {
    let set = this.runEventListeners.get(robotId)
    if (!set) this.runEventListeners.set(robotId, (set = new Set()))
    const listeners = set
    listeners.add(listener)
    this.ensureConnected()
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0 && this.runEventListeners.get(robotId) === listeners) this.runEventListeners.delete(robotId)
    }
  }

  private emitEvent(evt: TimelineEvent) {
    this.eventListeners.forEach((l) => l(evt))
  }

  dispatchCommand(
    robotId: string,
    type: CommandType,
    label: string,
    onUpdate: (command: Command) => void,
    params?: Record<string, unknown>,
  ): void {
    if (!WIRED_COMMAND_TYPES.has(type)) {
      // Marked so the UI can say this outcome is simulated. Against a real
      // backend these types reach no robot at all, and used to be
      // indistinguishable from a real dispatch right through to a green
      // "completed" toast.
      mockDataProvider.dispatchCommand(
        robotId, type, label,
        (command) => onUpdate({ ...command, simulated: true }),
        params,
      )
      return
    }
    this.ensureConnected()
    // Control ownership is tracked client-side, mirroring
    // mockDataProvider.takeControl/releaseControl. It is what mounts
    // ManualControlOverlay and arms its auto-release deadman, and nothing on the
    // wire carries it yet -- `control_owner` was only ever
    // `existing?.control_owner ?? null` here, so it stayed null forever and the
    // deadman never armed at all.
    //
    // Set optimistically on dispatch rather than on ACK: the operator has
    // asked for control, and the drive surface needs to be up before the
    // round-trip completes. A rejected TAKE_CONTROL surfaces as a failed-ACK
    // toast, and RELEASE_CONTROL clears ownership regardless of outcome.
    //
    // The edge should own this once there's multi-operator arbitration (PRD
    // §16.4); there is no auth this round, so a single client's own view of
    // "I hold control" is the whole truth.
    //
    // The bridge claims control only once its stand-up chain has succeeded, so
    // a TAKE_CONTROL that fails, is cancelled or never answers puts the owner
    // back -- otherwise anything gated on ownership (a program run) would stay
    // enabled for a robot this operator never got.
    if (type === 'TAKE_CONTROL') {
      const before = this.robots.find((r) => r.robot_id === robotId)?.control_owner ?? null
      this.setControlOwner(robotId, currentOperatorId())
      // While this is in flight, /state may still say nobody (or the mission)
      // holds control: see handleStateMessage.
      const settle = this.countInFlight(this.takesInFlight, robotId)
      const report = onUpdate
      onUpdate = (command) => {
        if (TERMINAL_ACK_STAGES.has(command.current_stage)) settle()
        const owner = this.robots.find((r) => r.robot_id === robotId)?.control_owner
        if (CONTROL_NOT_TAKEN.has(command.current_stage) && before !== currentOperatorId() && owner === currentOperatorId()) {
          this.setControlOwner(robotId, this.ownerToRestore(robotId, before))
        }
        report(command)
      }
    }
    if (type === 'RELEASE_CONTROL') {
      // The same revert for a release that did not land. During a run the
      // bridge refuses it (REJECTED_MISSION_HOLDS_CONTROL), and without this
      // the owner read null -- nobody in control of a robot a mission is
      // driving -- until the next /state, up to 5 s later.
      //
      // What is put back is what the bridge last said, not the owner seen at
      // dispatch. A release can outlast the console's 5 s safety deadline (the
      // bridge stands the robot down first) after /state has already reported
      // it done; putting the dispatch-time owner back then re-asserted this
      // operator over a robot nobody held (hardware test 2026-10-30).
      const before = this.robots.find((r) => r.robot_id === robotId)?.control_owner ?? null
      this.setControlOwner(robotId, null)
      const settle = this.countInFlight(this.releasesInFlight, robotId)
      const report = onUpdate
      onUpdate = (command) => {
        if (TERMINAL_ACK_STAGES.has(command.current_stage)) settle()
        const owner = this.robots.find((r) => r.robot_id === robotId)?.control_owner
        if (CONTROL_NOT_TAKEN.has(command.current_stage) && before !== null && owner === null) {
          this.setControlOwner(robotId, this.ownerToRestore(robotId, before))
        }
        report(command)
      }
    }
    void this.postCommand(robotId, type, label, onUpdate, params)
  }

  /** Counts one command in flight for `robotId`; the returned function
   * un-counts it, once however often it is called. */
  private countInFlight(counts: Map<string, number>, robotId: string): () => void {
    counts.set(robotId, (counts.get(robotId) ?? 0) + 1)
    let settled = false
    return () => {
      if (settled) return
      settled = true
      const left = (counts.get(robotId) ?? 1) - 1
      if (left > 0) counts.set(robotId, left)
      else counts.delete(robotId)
    }
  }

  /** The owner to put back after a TAKE/RELEASE that did not land: the
   * bridge's latest word when it reports one, else the owner at dispatch. */
  private ownerToRestore(robotId: string, before: string | null): string | null {
    return this.wireOwners.has(robotId) ? (this.wireOwners.get(robotId) ?? null) : before
  }

  /** Has the bridge granted this operator control? DRIVE waits for it: the
   * drive overlay mounts on the optimistic owner, and a DRIVE sent before the
   * bridge has finished its stand-up and claimed control is refused
   * REJECTED_NOT_CONTROL_OWNER (hardware test 2026-10-30). Granted means /state
   * says so, or -- for a bridge that does not report the owner -- no
   * TAKE_CONTROL of this tab's is still in flight. Never while this tab's
   * release is in flight: a /state naming this operator then predates the
   * release, and the bridge's release cuts all motion itself. */
  private controlGranted(robotId: string): boolean {
    if (this.releasesInFlight.has(robotId)) return false
    if (this.wireOwners.get(robotId) === currentOperatorId()) return true
    return !this.takesInFlight.has(robotId)
  }

  private setControlOwner(robotId: string, owner: string | null): void {
    this.robots = this.robots.map((r) => (r.robot_id === robotId ? { ...r, control_owner: owner } : r))
    this.telemetryListeners.forEach((listener) => listener(this.robots))
  }

  private async postCommand(
    robotId: string,
    type: CommandType,
    label: string,
    onUpdate: (command: Command) => void,
    params?: Record<string, unknown>,
    logWorthy = true,
  ): Promise<void> {
    let command: Command
    try {
      command = await this.postCommandRequest(robotId, type, label, params)
    } catch (err) {
      // Every failure to *reach* the backend ends here, and must be visible.
      // Previously this threw into a `void`-ed promise: the operator pressed a
      // button and nothing at all happened on screen.
      const failure = this.localFailure(robotId, type, label, params, failureReasonFor(err), postMayHaveLanded(err))
      if (logWorthy) this.emitEvent(this.eventForCommand(failure))
      onUpdate(failure)
      return
    }

    this.trackCommand(command, onUpdate, type, logWorthy)
  }

  /** Waits for a command the backend has accepted: its acks go to `onUpdate`,
   * its terminal stage to the Logs (unless silent), and silence past its
   * deadline becomes `timed_out`. */
  private trackCommand(command: Command, onUpdate: (command: Command) => void, type: CommandType, logWorthy = true): void {
    this.pendingCommandCallbacks.set(command.command_id, onUpdate)
    if (!logWorthy) this.silentCommandIds.add(command.command_id)
    onUpdate(command)
    this.armAckTimeout(command, onUpdate, type)
    // The robot may already have answered: see applyAck.
    const early = this.earlyAcks.get(command.command_id)
    if (early) {
      this.earlyAcks.delete(command.command_id)
      this.applyAck(early.command)
    }
  }

  private async postCommandRequest(
    robotId: string,
    type: CommandType,
    label: string,
    params?: Record<string, unknown>,
  ): Promise<Command> {
    const controller = new AbortController()
    const abort = setTimeout(() => controller.abort(), POST_TIMEOUT_MS)
    try {
      const response = await apiFetch(`${this.config.apiBaseUrl}/robots/${robotId}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, label, params, initiated_by: currentOperatorId() }),
        signal: controller.signal,
      })
      if (!response.ok) {
        throw new Error(`The cloud rejected the command (HTTP ${response.status}).`)
      }
      return await response.json()
    } finally {
      clearTimeout(abort)
    }
  }

  /** A command the backend never accepted, shaped like a real one so it flows
   * through the same toast and log path. The `local-` prefix keeps it from ever
   * colliding with a backend command_id. */
  private localFailure(
    robotId: string,
    type: CommandType,
    label: string,
    params: Record<string, unknown> | undefined,
    reason: string,
    mayHaveLanded = true,
  ): Command {
    const at = new Date().toISOString()
    return {
      command_id: `${mayHaveLanded ? LOCAL_FAILURE_PREFIX : LOCAL_REJECTED_PREFIX}${++this.localFailureSeq}`,
      robot_id: robotId,
      type,
      label,
      params,
      stages: [{ stage: 'requested', at }, { stage: 'execution_failed', at }],
      current_stage: 'execution_failed',
      failure_reason: reason,
      initiated_by: currentOperatorId(),
    }
  }

  private armAckTimeout(command: Command, onUpdate: (c: Command) => void, type: CommandType): void {
    const robot = this.robots.find((r) => r.robot_id === command.robot_id)
    const deadlineMs = ackDeadlineMs(type, command.params, robot?.speed_ratio)
    const timer = setTimeout(() => {
      // Only fires while the command is still pending — a terminal ack clears
      // this timer, so reaching here means nothing ever came back.
      if (!this.pendingCommandCallbacks.delete(command.command_id)) return
      this.ackTimers.delete(command.command_id)
      const wasSilent = this.silentCommandIds.delete(command.command_id)
      const timedOut: Command = {
        ...command,
        current_stage: 'timed_out',
        stages: [...command.stages, { stage: 'timed_out', at: new Date().toISOString() }],
        failure_reason: `No response from the robot after ${Math.round(deadlineMs / 1000)}s.`,
      }
      if (!wasSilent) this.emitEvent(this.eventForCommand(timedOut))
      onUpdate(timedOut)
    }, deadlineMs)
    this.ackTimers.set(command.command_id, timer)
  }

  /** Uploads a real audio file to `backend/control/media.py`'s
   * `POST /robots/{robot_id}/audio-clips` multipart endpoint, which saves it
   * to a shared filesystem location the edge bridge can read and returns the
   * real on-disk path. That `file_path` is what a subsequent `SPEAK` command
   * must carry in `params.file_path` -- `dobot_adapter.py::speak` reads the
   * file straight off disk, so a label/clip-name string is not usable here. */
  /** Decodes the clip to the robot's PCM format before uploading it.
   *
   * The robot's streaming voice mode takes 24kHz/16-bit/mono PCM, and neither
   * edge device has ffmpeg to convert anything, so the conversion happens here
   * where the browser already has a decoder (see lib/audioPcm.ts). What gets
   * stored is therefore playable bytes, not an arbitrary container.
   *
   * Returns `clip_id`, which is what SPEAK carries. It used to return the
   * backend's `file_path`, which was then handed to the robot -- a path on the
   * cloud's disk that the robot resolved against its own, so nothing ever
   * played while the command still reported success. */
  /** Where to GET a captured snapshot.
   *
   * The ack carries only `result.snapshot_id`, because the bridge has no idea
   * what URL a browser should use -- it POSTs to whatever CLOUD_API_URL it was
   * given, which is not necessarily reachable under the same name from the
   * operator's machine. Only the provider knows the base URL the browser should
   * use, and it already resolves it for LAN access (see serviceHost.ts). */
  snapshotUrl(snapshotId: string): string {
    return `${this.config.apiBaseUrl}/snapshots/${snapshotId}`
  }

  /** Stored snapshots, newest first (GET /snapshots). Throws on a failed
   * request so the Data page can say the library is unreachable rather than
   * empty -- an older backend without the endpoint answers 404 or 405. */
  async listSnapshots(query: SnapshotQuery): Promise<SnapshotPage> {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') params.set(k, String(v))
    const response = await apiFetch(`${this.config.apiBaseUrl}/snapshots?${params}`)
    if (!response.ok) throw new Error(`GET /snapshots answered ${response.status}`)
    const body = await response.json() as {
      items: (Omit<SnapshotRecord, 'image_url'> & { url: string })[]
      total: number
      next_offset: number | null
    }
    return {
      items: body.items.map(({ url, ...rest }) => ({ ...rest, image_url: `${this.config.apiBaseUrl}${url}` })),
      total: body.total,
      next_offset: body.next_offset,
      sample: false,
    }
  }

  /** A site's maps (GET /maps). Throws on failure so the page can say the
   * maps are unreachable rather than that there are none. */
  async listMaps(siteId: string): Promise<SiteMap[]> {
    const response = await apiFetch(`${this.config.apiBaseUrl}/maps?site_id=${encodeURIComponent(siteId)}`)
    if (!response.ok) throw new Error(`GET /maps answered ${response.status}`)
    return (await response.json() as { items: SiteMap[] }).items
  }

  /** One map, or null when the backend has no such id. A mission can name a
   * map that has since been deleted or replaced; null lets the caller show
   * "map is missing" instead of an error page or an empty canvas that reads as
   * open floor. Any other failure still throws -- a 500 is not "missing". */
  async getMap(mapId: string): Promise<SiteMap | null> {
    const response = await apiFetch(`${this.config.apiBaseUrl}/maps/${encodeURIComponent(mapId)}`)
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`GET /maps/${mapId} answered ${response.status}`)
    return await response.json() as SiteMap
  }

  /** Replace a map's zones (PUT /maps/{id}/zones); returns the map as stored.
   * Needs the editZones capability. A refusal throws an ApiError whose `detail`
   * is the server's sentence. */
  async saveMapZones(mapId: string, zones: MapZone[]): Promise<SiteMap> {
    const response = await apiFetch(`${this.config.apiBaseUrl}/maps/${encodeURIComponent(mapId)}/zones`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ zones }),
    })
    if (!response.ok) throw await apiErrorFrom(response, 'PUT /maps/zones')
    return await response.json() as SiteMap
  }

  /** Set a map's status (PUT /maps/{id}/status): `active` freezes it. The
   * backend refuses to activate a map with no floors. */
  async setMapStatus(mapId: string, status: MapStatus): Promise<SiteMap> {
    const response = await apiFetch(`${this.config.apiBaseUrl}/maps/${encodeURIComponent(mapId)}/status`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    })
    if (!response.ok) throw await apiErrorFrom(response, 'PUT /maps/status')
    return await response.json() as SiteMap
  }

  /** Where to GET one of a floor's files. The backend, not the broker: the
   * console reads telemetry from the broker directly but everything else over
   * REST. */
  mapArtifactUrl(mapId: string, floorIndex: number, kind: MapArtifactKind): string {
    return `${this.config.apiBaseUrl}/maps/${encodeURIComponent(mapId)}/floors/${floorIndex}/${kind}`
  }

  /** Mission run records (GET /runs). Throws on failure so Data can say the
   * run library is unreachable rather than empty. */
  async listRuns(query: RunQuery): Promise<RunPage> {
    const params = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== '') params.set(k, String(v))
    const response = await apiFetch(`${this.config.apiBaseUrl}/runs?${params}`)
    if (!response.ok) throw new Error(`GET /runs answered ${response.status}`)
    const body = await response.json() as Omit<RunPage, 'sample'>
    return { ...body, sample: false }
  }

  async getRun(runId: string): Promise<RunDetail> {
    const response = await apiFetch(`${this.config.apiBaseUrl}/runs/${encodeURIComponent(runId)}`)
    if (!response.ok) throw new Error(`GET /runs/${runId} answered ${response.status}`)
    return await response.json() as RunDetail
  }

  async getRunEvents(runId: string): Promise<RunEvent[]> {
    const response = await apiFetch(`${this.config.apiBaseUrl}/runs/${encodeURIComponent(runId)}/events`)
    if (!response.ok) throw new Error(`GET /runs/${runId}/events answered ${response.status}`)
    return (await response.json() as { items: RunEvent[] }).items
  }

  /** Create or update a run record (PUT /runs/{id}). */
  async putRun(run: MissionRun): Promise<void> {
    const response = await apiFetch(`${this.config.apiBaseUrl}/runs/${encodeURIComponent(run.run_id)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(run),
    })
    if (!response.ok) throw new Error(`PUT /runs/${run.run_id} answered ${response.status}`)
  }

  /** Append run events (POST /runs/{id}/events); the backend dedupes by seq. */
  async postRunEvents(runId: string, events: RunEvent[]): Promise<void> {
    const response = await apiFetch(`${this.config.apiBaseUrl}/runs/${encodeURIComponent(runId)}/events`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ events }),
    })
    if (!response.ok) throw new Error(`POST /runs/${runId}/events answered ${response.status}`)
  }

  runFileUrl(runId: string, path: string): string {
    return `${this.config.apiBaseUrl}/runs/${encodeURIComponent(runId)}/files/${path}`
  }

  runZipUrl(runId: string): string | null {
    return `${this.config.apiBaseUrl}/runs/${encodeURIComponent(runId)}/zip`
  }

  /** Saved missions for a site (GET /missions). Throws on failure so the
   * Missions page can say the library is unreachable rather than empty. */
  async listMissions(siteId: string): Promise<MissionLibraryEntry[]> {
    const response = await apiFetch(`${this.config.apiBaseUrl}/missions?site_id=${encodeURIComponent(siteId)}`)
    if (!response.ok) throw new Error(`GET /missions answered ${response.status}`)
    const body = await response.json() as { items: MissionLibraryEntry[] }
    return body.items
  }

  /** Create or replace a mission (PUT /missions/{id}); returns what was stored. */
  async saveMission(mission: MissionLibraryEntry): Promise<MissionLibraryEntry> {
    const response = await apiFetch(`${this.config.apiBaseUrl}/missions/${encodeURIComponent(mission.mission_id)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mission),
    })
    if (!response.ok) throw await apiErrorFrom(response, 'PUT /missions')
    return await response.json() as MissionLibraryEntry
  }

  async deleteMission(missionId: string): Promise<void> {
    const response = await apiFetch(`${this.config.apiBaseUrl}/missions/${encodeURIComponent(missionId)}`, { method: 'DELETE' })
    if (!response.ok && response.status !== 404) throw new Error(`DELETE /missions answered ${response.status}`)
  }

  /** A mission's tasks for a site (GET /tasks). Throws on failure, like listMissions. */
  async listTasks(siteId: string): Promise<MissionTask[]> {
    const response = await apiFetch(`${this.config.apiBaseUrl}/tasks?site_id=${encodeURIComponent(siteId)}`)
    if (!response.ok) throw new Error(`GET /tasks answered ${response.status}`)
    const body = await response.json() as { items: MissionTask[] }
    return body.items
  }

  /** Create or replace a task (PUT /tasks/{id}); returns what was stored, with
   * the version the server assigned. A stale `version` is a 409 and throws an
   * `ApiError` whose body is the stored task (see `conflictOf`). */
  async saveTask(task: MissionTask): Promise<MissionTask> {
    const response = await apiFetch(`${this.config.apiBaseUrl}/tasks/${encodeURIComponent(task.task_id)}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(task),
    })
    if (!response.ok) throw await apiErrorFrom(response, 'PUT /tasks')
    return await response.json() as MissionTask
  }

  async deleteTask(taskId: string): Promise<void> {
    const response = await apiFetch(`${this.config.apiBaseUrl}/tasks/${encodeURIComponent(taskId)}`, { method: 'DELETE' })
    if (!response.ok && response.status !== 404) throw new Error(`DELETE /tasks answered ${response.status}`)
  }

  /** The scheduler's queue between two instants (GET /tasks/occurrences).
   * Both bounds are ISO 8601 and usually carry a `+09:00`-style offset, which
   * must be percent-encoded: a raw `+` in a query string decodes to a space. */
  async listOccurrences(siteId: string, from: string, to: string): Promise<TaskOccurrence[]> {
    const query = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&site_id=${encodeURIComponent(siteId)}`
    const response = await apiFetch(`${this.config.apiBaseUrl}/tasks/occurrences?${query}`)
    if (!response.ok) throw new Error(`GET /tasks/occurrences answered ${response.status}`)
    const body = await response.json() as { items: TaskOccurrence[] }
    return body.items
  }

  /** Start a mission on the robot (POST /robots/{id}/runs). The edge bridge
   * runs it; this returns as soon as the backend has sent it, and the run's
   * progress arrives on /state's `active_run` and on subscribeRunEvents.
   *
   * A refusal (offline, in E-Stop, already running, someone has control, ...)
   * throws RunStartRefused carrying the backend's sentence for the operator.
   *
   * The response's `command` is START_MISSION, and is waited on like any other
   * command: `onCommand` sees its acks, and a failure lands in the Logs. The
   * backend's 201 says only that it sent the run; the edge can still refuse it
   * (fallen, E-Stop, someone took control during the warm-up), and that refusal
   * arrives on this command's ack and nowhere else. Its ack used to be dropped,
   * and a refused start showed as "Starting..." forever. */
  async startRun(robotId: string, req: StartRunRequest, onCommand?: (command: Command) => void): Promise<{ run: MissionRun }> {
    const response = await apiFetch(`${this.config.apiBaseUrl}/robots/${encodeURIComponent(robotId)}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mission: req.mission, steps: req.steps, source: req.source, started_by: currentOperatorId(),
        ...(req.maxDurationS !== undefined ? { max_duration_s: req.maxDurationS } : {}),
      }),
    })
    if (!response.ok) throw await runStartError(response, `POST /robots/${robotId}/runs`)
    const body = await response.json() as { run: MissionRun; command?: Command }
    this.trackStartCommand(body.command, onCommand)
    return { run: body.run }
  }

  /** Run a task now, on its robot, with the program's steps
   * (POST /tasks/{id}/run-now with a body). The backend starts it on the edge
   * at once and answers with the occurrence it recorded and the run.
   *
   * Replaces the old queue-only call (the same endpoint with no body), which
   * queued an occurrence for a scheduler with no executor, so it was always
   * skipped. The steps come from here because the browser compiles the
   * program; the task supplies the mission, the robot and the running-time cap. */
  async runTaskNow(taskId: string, steps: Step[], onCommand?: (command: Command) => void): Promise<{ occurrence: TaskOccurrence; run: MissionRun }> {
    const response = await apiFetch(`${this.config.apiBaseUrl}/tasks/${encodeURIComponent(taskId)}/run-now`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ steps, started_by: currentOperatorId() }),
    })
    if (!response.ok) throw await runStartError(response, `POST /tasks/${taskId}/run-now`)
    const body = await response.json() as { occurrence: TaskOccurrence; run: MissionRun; command?: Command }
    this.trackStartCommand(body.command, onCommand)
    return { occurrence: body.occurrence, run: body.run }
  }

  /** START_MISSION from a start's response, waited on like a dispatched command
   * (see startRun). An older backend that sends none leaves nothing to wait on. */
  private trackStartCommand(command: Command | undefined, onCommand?: (command: Command) => void): void {
    if (!command?.command_id) return
    this.trackCommand(command, onCommand ?? (() => {}), 'START_MISSION')
  }

  /** Let a pending device in, or turn it away (POST /robots/{id}/accept|reject).
   * Informational: the backend gates nothing on it. */
  async setDeviceAcceptance(robotId: string, decision: 'accept' | 'reject'): Promise<void> {
    const response = await apiFetch(`${this.config.apiBaseUrl}/robots/${encodeURIComponent(robotId)}/${decision}`, { method: 'POST' })
    if (!response.ok) throw new Error(`POST /robots/${robotId}/${decision} answered ${response.status}`)
    const r = await response.json() as RegistryRobotWire
    this.upsertRobot(robotId, (existing) => (existing?.bridge ? { bridge: { ...existing.bridge, acceptance: r.acceptance ?? existing.bridge.acceptance } } : {}))
  }

  async uploadAudioClip(robotId: string, file: File | Blob): Promise<{ clip_id: string; file_path: string }> {
    const { pcm } = await decodeToRobotPcm(file)
    const formData = new FormData()
    // Named .pcm with an explicit type: the backend derives the stored
    // extension from the content type, never the filename.
    formData.append('file', new Blob([pcm], { type: 'audio/pcm' }), 'clip.pcm')
    const response = await apiFetch(`${this.config.apiBaseUrl}/robots/${robotId}/audio-clips`, {
      method: 'POST',
      body: formData,
    })
    if (!response.ok) {
      throw new Error(`Audio clip upload failed (${response.status})`)
    }
    return response.json()
  }

  /** Synthesises spoken text to WAV on the backend.
   *
   * The WAV then goes through uploadAudioClip like any uploaded file, so a spoken
   * announcement and an uploaded clip are the same thing from here on -- one clip
   * store, one edge cache, one volume control, one streaming path. Synthesis is
   * server-side because the browser's speechSynthesis plays to the operator's own
   * speakers and cannot be captured to bytes, so it can never reach the robot. */
  async synthesizeSpeech(text: string): Promise<Blob> {
    const response = await apiFetch(`${this.config.apiBaseUrl}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
    if (!response.ok) {
      // 501 means this deployment has no engine -- worth saying plainly rather
      // than reporting a generic failure the operator cannot act on.
      const detail = await response.json().catch(() => null)
      throw new Error(
        detail?.detail
          ?? (response.status === 501
            ? 'This deployment has no text-to-speech engine installed.'
            : `Speech synthesis failed (${response.status})`),
      )
    }
    return response.blob()
  }

  /** Latest transport phase, and when a frame last arrived. Together these are
   * what tells the UI whether what it is showing is current — see
   * `linkHealth.ts`. */
  private linkPhase: LinkPhase = 'connecting'
  private lastFrameAt: number | null = null
  private linkListeners = new Set<(phase: LinkPhase) => void>()

  subscribeLinkPhase(listener: (phase: LinkPhase) => void): () => void {
    this.linkListeners.add(listener)
    listener(this.linkPhase)
    this.ensureConnected()
    return () => { this.linkListeners.delete(listener) }
  }

  /** Milliseconds since the last inbound frame, or `null` if none has arrived.
   * Read by the store's watchdog rather than pushed, so a *silent* link — the
   * case that matters — is detected by the absence of events, not by one. */
  telemetryAgeMs(now: number = Date.now()): number | null {
    return this.lastFrameAt === null ? null : now - this.lastFrameAt
  }

  private setLinkPhase(phase: LinkPhase): void {
    if (this.linkPhase === phase) return
    this.linkPhase = phase
    this.linkListeners.forEach((l) => l(phase))
  }

  private ensureConnected(): void {
    if (this.client) return
    // Signed out, or still finding out whether sign-in is on: a connection now
    // would be refused, and retried, for nothing. setBrokerSession connects
    // once there is a session.
    if (this.brokerSession.kind === 'closed') return
    this.client = connectBroker({
      wsUrl: this.config.wsUrl,
      siteId: this.config.siteId,
      ...(this.brokerSession.kind === 'signedIn' ? { credentials: this.brokerSession.credentials } : {}),
      onPhaseChange: (phase) => this.setLinkPhase(phase),
    })
    this.client.on('message', (topic: string, payload: Buffer, packet?: { retain?: boolean }) => {
      this.lastFrameAt = Date.now()
      this.handleMessage(topic, payload, packet?.retain === true)
    })
    // Registry discovery runs alongside MQTT rather than gating it: MQTT's
    // retained registrations populate the UI on their own, and this only adds
    // display names plus any robot the broker has forgotten.
    void this.discoverRobots()
  }

  /** Held velocity setpoint for manual driving: "drive at this until I say
   * otherwise".
   *
   * This used to send one bounded `VELOCITY_SEQUENCE` burst per 250 ms tick,
   * because the bridge was believed to have no continuous-velocity concept. It
   * does now. Measured on real hardware
   * (`sdk_playground/velocity_continuity_experiment.py`, quad/walk):
   *
   *     per-tick bursts   44-53% of samples stalled, 12-15 stalls, mean 0.09 m/s
   *     one long sequence   ~5% of samples stalled,   1-2 stalls, mean 0.186 m/s
   *
   * Every RPC boundary costs the robot a settle; step boundaries *inside* one
   * sequence cost nothing. The burst loop was therefore paying a settle four
   * times a second and reaching half the achievable speed -- and over this path
   * each burst was also an HTTPS POST, an MQTT hop and an ack round trip.
   *
   * So the sequence is now held by the BRIDGE (`velocity_driver.py`), which is
   * the only place that can cancel one -- a new setpoint cannot preempt an
   * in-flight sequence, it has to replace it. This method just publishes intent.
   * Call it when the velocity CHANGES, plus a low-rate keepalive
   * (`DRIVE_KEEPALIVE_MS`) so the bridge's watchdog can tell "still driving"
   * from "operator vanished"; re-sending an unchanged setpoint costs the robot
   * nothing, because the driver only re-issues on a real change.
   *
   * `gait` is deliberately NOT sent. The edge resolves it from the connected
   * hardware, and `safety_manager` validates rather than substitutes -- so a
   * browser-supplied 'walk' aimed at a wheel robot is *rejected*, which is
   * exactly how manual control silently did nothing before. Omitting it lets the
   * edge pick correctly for either robot type.
   *
   * Fires through the same postCommand path as every other wired command, with a
   * no-op update callback: driving has no Command/ack UI of its own. */
  /** Volume change for the clip playing now. Through postCommand like DRIVE,
   * and like DRIVE never logged or toasted: a slider drag sends several. */
  setSpeakVolume(robotId: string, volume: number): void {
    this.ensureConnected()
    void this.postCommand(robotId, 'SET_SPEAK_VOLUME', 'Speak volume', () => {}, { volume }, false)
  }

  driveRobot(robotId: string, vx: number, vy: number, vyaw: number, speedRatio?: number): void {
    // Not even a stop: until control is granted this operator is not driving
    // the robot, and the bridge would refuse it anyway.
    if (!this.controlGranted(robotId)) return
    this.ensureConnected()
    void this.postCommand(robotId, 'DRIVE', 'Manual Drive', () => {}, {
      vx,
      vy,
      vyaw,
      speed_ratio: speedRatio ?? DRIVE_SPEED_RATIO,
    }, false)
  }

  /** Maps a raw telemetry MQTT payload into a RobotState, merging onto
   * whatever this robot's existing state already has. Telemetry is the
   * highest-frequency topic (~1 Hz), so it must NOT clobber fields that
   * only `/state` and `/heartbeat` messages own (abstract_state, sdk_state,
   * most of connectivity, control_owner, maintenance_flagged) -- those are
   * preserved from the existing robot, if any, and only default to interim
   * placeholders the first time a given robot_id is ever seen. `connectivity.grpc`
   * is the one connectivity field telemetry itself sources (via grpc_freshness),
   * so it's refreshed from the current frame every time regardless. */
  private handleTelemetryMessage(payload: Buffer): void {
    let frame: TelemetryFrameWire
    try {
      frame = JSON.parse(payload.toString())
    } catch {
      return
    }

    if (this.config.siteId && frame.site_id !== this.config.siteId) return

    const existing = this.robots.find((r) => r.robot_id === frame.robot_id)
    const nextState: RobotState = {
      robot_id: frame.robot_id,
      // Per-robot name from the backend registry, falling back to the id. This
      // used to be config.robotName -- a single hardcoded string, which with
      // more than one robot labelled every one of them identically.
      name: existing?.name ?? this.robotNames.get(frame.robot_id) ?? frame.robot_id,
      site_id: frame.site_id,
      robot_type: frame.robot_type,
      abstract_state: existing?.abstract_state ?? 'STAND',
      // Telemetry doesn't own posture either -- only `/state` sets it -- so
      // preserve whatever's already known, defaulting to 'unknown' only the
      // first time this robot_id is ever seen.
      posture: existing?.posture ?? 'unknown',
      leg_config: existing?.leg_config ?? 'unknown',
      sdk_state: existing?.sdk_state ?? 'unknown',
      battery: { percent: frame.battery_percent, est_runtime_min: 0, charging: false },
      // The bridge's position provider's answer when the frame carries one
      // (AMCL's map pose under tap-to-walk), else raw odometry. framePosition.ts.
      position: positionFromFrame(frame, existing?.position.heading_deg),
      speed_mps: Math.hypot(frame.vel_body[0], frame.vel_body[1]),
      speed_ratio: frame.speed_ratio,
      gait: existing?.gait ?? capabilitiesFor(frame.robot_type).defaultGait,
      obstacle_avoidance: frame.obstacle_avoidance_enabled,
      physics: {
        acc_body: frame.acc_body,
        omega_body: frame.omega_body,
        ori_body: frame.ori_body,
        jpos_leg: frame.jpos_leg,
        jvel_leg: frame.jvel_leg,
        jtau_leg: frame.jtau_leg,
        grf_left: frame.grf_left,
        grf_right: frame.grf_right,
      },
      // gRPC health is downgrade-only from telemetry -- see grpcAfterTelemetry.
      // /heartbeat's sdk_connected is the only signal that knows whether a gRPC
      // call actually succeeded, so only it may restore 'connected'. A frame's
      // freshness can reveal an outage faster (3s vs the 5s heartbeat), but
      // must never contradict it: the bridge keeps republishing its last known
      // snapshot at full rate while the robot is powered off, so frames alone
      // would assert 'connected' forever.
      connectivity: existing?.connectivity
        ? {
            ...existing.connectivity,
            grpc: grpcAfterTelemetry(existing.connectivity.grpc, frame.grpc_freshness),
          }
        : {
            robot_to_edge: 'unavailable',
            edge_to_cloud: 'connected',
            bridge_state: 'connected',
            bridge_latency_ms: null,
            dds: 'unavailable',
            grpc: grpcAfterTelemetry(undefined, frame.grpc_freshness),
          },
      maintenance_flagged: existing?.maintenance_flagged ?? false,
      control_owner: existing?.control_owner ?? null,
      active_run: existing?.active_run ?? null,
      nav_goal: existing?.nav_goal ?? null,
      bridge_boot_id: existing?.bridge_boot_id ?? null,
      available_motions: existing?.available_motions ?? [],
      lowerState: existing?.lowerState,
      bridge: existing?.bridge,
      updated_at: frame.captured_at,
    }

    // Preserve array position for a robot we already know about. This used to be
    // `[nextState, ...filter(others)]`, which moved the robot to index 0 on EVERY
    // frame -- so with more than one robot publishing at ~1-10Hz the order
    // alternated continuously. Several consumers resolve the displayed robot as
    // `robots.find(selected) ?? robots[0]`, so that reordering made the UI flip
    // between robots several times a second. Order must be stable; only genuinely
    // new robots are prepended.
    const isNew = existing === undefined
    this.robots = isNew
      ? [nextState, ...this.robots]
      : this.robots.map((r) => (r.robot_id === frame.robot_id ? nextState : r))
    this.telemetryListeners.forEach((listener) => listener(this.robots))
  }

  private handleMessage(topic: string, payload: Buffer, retained = false): void {
    // Routing is by topic *suffix* only -- the site and robot segments are
    // wildcards, and every handler reads robot_id out of the payload instead.
    // Perception first, by FULL suffix: '/perception/status' must never fall
    // through to a looser check below (it is not robot state).
    if (topic.endsWith('/perception/status')) this.handlePerceptionStatusMessage(payload)
    else if (topic.endsWith('/incidents')) this.handleIncidentMessage(payload)
    else if (topic.endsWith('/register')) this.handleRegistrationMessage(payload)
    else if (topic.endsWith('/telemetry')) this.handleTelemetryMessage(payload)
    else if (topic.endsWith('/lower_state')) this.handleLowerStateMessage(payload)
    else if (topic.endsWith('/state')) this.handleStateMessage(payload)
    else if (topic.endsWith('/heartbeat')) this.handleHeartbeatMessage(payload, retained)
    else if (topic.endsWith('/ack')) this.handleAckMessage(payload)
    else if (topic.endsWith('/run')) this.handleRunMessage(topic, payload)
  }

  /** A RunEvent carries run_id but no robot_id, so unlike every other handler
   * this one routes on the topic's robot segment (`roverhub/{site}/{robot}/run`). */
  private handleRunMessage(topic: string, payload: Buffer): void {
    const robotId = topic.split('/')[2]
    const listeners = robotId ? this.runEventListeners.get(robotId) : undefined
    if (!listeners || listeners.size === 0) return
    let event: RunEvent
    try {
      event = JSON.parse(payload.toString())
    } catch {
      return
    }
    listeners.forEach((l) => l(event))
  }

  /** Maps a raw lower_state MQTT payload (published by low_level_reader.py,
   * only when the edge bridge is low_level_enabled) onto the matching
   * robot's lowerState field. No-ops if the robot hasn't been seen via
   * telemetry/heartbeat yet (same pattern as handleStateMessage) -- there's
   * nothing to merge onto. */
  private handleLowerStateMessage(payload: Buffer): void {
    let frame: { robot_id: string; imu: RobotImuState; motors: RobotMotorState[]; battery_level: number }
    try {
      frame = JSON.parse(payload.toString())
    } catch {
      return
    }
    // Deliberately does NOT create a robot entry, unlike /state and /heartbeat.
    // lower_state is high-frequency sensor data, not an identity signal, and it's
    // neither retained nor authoritative about a robot's existence -- so there's
    // nothing meaningful to build an entry around. By the time it arrives, the
    // retained /register or /state will have created the entry anyway.
    this.robots = this.robots.map((r) =>
      r.robot_id === frame.robot_id
        ? { ...r, lowerState: { imu: frame.imu, motors: frame.motors, battery_level: frame.battery_level } }
        : r,
    )
    this.telemetryListeners.forEach((listener) => listener(this.robots))
  }

  private handleAckMessage(payload: Buffer): void {
    let command: Command
    try {
      command = JSON.parse(payload.toString())
    } catch {
      return
    }
    this.applyAck(command)
  }

  /** Routes an ack to the command waiting for it.
   *
   * An ack can beat its own command's POST response: the backend publishes the
   * command to the bridge before it answers the POST, the bridge acks over MQTT,
   * and a quick command (lights take ~2 ms on the bridge) is finished before the
   * HTTP response reaches the browser. Such an ack used to find no callback and
   * be dropped, and the command then "timed out" in the console although the
   * backend had it completed in 17 ms (Light Off, 2026-10-29). So an ack for an
   * id not yet known is held, and postCommand replays it once the id is.
   *
   * A command that already timed out is no longer pending either, so its late
   * ack is held the same way -- and never replayed, since that id is not posted
   * again. It must not revive a toast the operator was told had failed. */
  private applyAck(command: Command): void {
    const callback = this.pendingCommandCallbacks.get(command.command_id)
    if (!callback) {
      this.holdEarlyAck(command)
      return
    }
    callback(command)
    // Every terminal stage ends the wait, so the browser's own deadline can't
    // fire a second outcome later.
    if (TERMINAL_ACK_STAGES.has(command.current_stage)) {
      this.pendingCommandCallbacks.delete(command.command_id)
      this.clearAckTimeout(command.command_id)
      const wasSilent = this.silentCommandIds.delete(command.command_id)
      if (!wasSilent) this.emitEvent(this.eventForCommand(command))
    }
  }

  private holdEarlyAck(command: Command): void {
    const now = Date.now()
    for (const [id, held] of this.earlyAcks) {
      if (now - held.at > EARLY_ACK_HOLD_MS) this.earlyAcks.delete(id)
    }
    // Other consoles' commands arrive on the same topic and are never claimed;
    // the cap keeps a busy site from growing this without bound.
    if (this.earlyAcks.size >= EARLY_ACK_MAX && !this.earlyAcks.has(command.command_id)) {
      const oldest = this.earlyAcks.keys().next().value
      if (oldest !== undefined) this.earlyAcks.delete(oldest)
    }
    this.earlyAcks.set(command.command_id, { command, at: now })
  }

  private clearAckTimeout(commandId: string): void {
    const timer = this.ackTimers.get(commandId)
    if (timer === undefined) return
    clearTimeout(timer)
    this.ackTimers.delete(commandId)
  }

  getPerceptionStatus(robotId: string): PerceptionStatus | undefined {
    return this.perceptionStatus.get(robotId)
  }

  private handlePerceptionStatusMessage(payload: Buffer): void {
    let status: PerceptionStatus
    try {
      status = JSON.parse(payload.toString())
    } catch {
      return
    }
    if (!status || typeof status.robot_id !== 'string' || !Array.isArray(status.detectors)) return
    this.perceptionStatus.set(status.robot_id, status)
  }

  /** An edge perception incident becomes a Logs-panel event. Malformed
   * payloads are dropped: a bad message must never break the console. */
  private handleIncidentMessage(payload: Buffer): void {
    let incident: Incident
    try {
      incident = JSON.parse(payload.toString())
    } catch {
      return
    }
    if (!incident || typeof incident.incident_id !== 'string' || typeof incident.message !== 'string'
        || typeof incident.opened_at !== 'string') return
    if (this.seenIncidents.has(incident.incident_id)) return
    this.seenIncidents.add(incident.incident_id)
    if (this.seenIncidents.size > 500) {
      const oldest = this.seenIncidents.values().next().value
      if (oldest !== undefined) this.seenIncidents.delete(oldest)
    }
    const severity = incident.severity === 'critical' || incident.severity === 'info' ? incident.severity : 'warning'
    this.emitEvent({
      event_id: incident.incident_id,
      source: 'edge',
      severity,
      message: incident.message + (incident.evidence_pending ? ' (evidence not uploaded)' : ''),
      ts: incident.opened_at,
      acknowledged: false,
    })
  }

  private eventForCommand(command: Command): TimelineEvent {
    const failed = command.current_stage === 'execution_failed' || command.current_stage === 'timed_out'
    const lastStageAt = command.stages[command.stages.length - 1]?.at ?? new Date().toISOString()
    return {
      event_id: `${command.command_id}-${command.current_stage}`,
      source: 'edge',
      severity: failed ? 'fault' : 'info',
      message: failed
        ? `${command.label} failed${command.failure_reason ? `: ${command.failure_reason}` : ''}`
        : `${command.label} completed`,
      ts: lastStageAt,
      command_id: command.command_id,
      acknowledged: false,
    }
  }

  private handleStateMessage(payload: Buffer): void {
    let update: {
      robot_id: string
      abstract_state: RobotState['abstract_state']
      sdk_state: string
      gait?: RobotState['gait']
      robot_type?: RobotState['robot_type']
      posture?: Posture
      // 0.0.12 bridges; older ones never send it, which reads as unknown.
      leg_config?: LegConfig
      // 0.0.11 bridges. Absent from older ones, which is not the same as null.
      control_owner?: string | null
      active_run?: ActiveRun | null
      // 0.0.15 bridges. Absent from older ones (no goal); null is the bridge clearing it.
      nav_goal?: NavGoalStatus | null
      bridge_boot_id?: string | null
    }
    try {
      update = JSON.parse(payload.toString())
    } catch {
      return
    }
    this.upsertRobot(
      update.robot_id,
      (r) => ({
        abstract_state: update.abstract_state,
        sdk_state: update.sdk_state,
        // `/state` owns gait, since gait derives from sdk_state. robot_type
        // is echoed on this topic too so a browser receiving the retained
        // /state before its first telemetry frame still resolves a
        // type-correct gait. Both fall back to the existing value so an
        // older bridge that doesn't send them yet degrades gracefully.
        robot_type: update.robot_type ?? r?.robot_type,
        gait: update.gait ?? r?.gait,
        // Same fallback chain: a bridge that predates this field never sends
        // it, and that must read as 'unknown', never as 'upright' by
        // omission -- see the Posture type doc in types/robotState.ts.
        posture: update.posture ?? r?.posture ?? 'unknown',
        leg_config: update.leg_config ?? r?.leg_config ?? 'unknown',
        control_owner: this.ownerFromState(update.robot_id, update.control_owner, r?.control_owner ?? null),
        active_run: update.active_run !== undefined ? update.active_run : r?.active_run ?? null,
        nav_goal: update.nav_goal !== undefined ? update.nav_goal : r?.nav_goal ?? null,
        bridge_boot_id: update.bridge_boot_id !== undefined ? update.bridge_boot_id : r?.bridge_boot_id ?? null,
      }),
      { robotType: update.robot_type },
    )
  }

  /** Who holds control, given what /state said.
   *
   * The bridge owns control, so its word wins over the optimistic owner
   * dispatchCommand set -- with one exception. While this tab's own
   * TAKE_CONTROL is in flight, the bridge is still running the stand-up
   * warm-up and only claims control at the end of it, so its /state keeps
   * saying nobody (or `mission:<run_id>`, when the take is pausing a run, or
   * `nav:<goal_id>`, when it is taking over a walk). Let that win and the owner
   * flips away and back: the drive overlay unmounts and remounts, and its
   * deadman restarts. So during the take, null and an automation owner are
   * read as "not yet", not as "no"; another operator is a real answer and
   * still wins. The terminal ack settles it either way.
   *
   * A bridge that predates the field (0.0.10) never sends it, and the owner
   * stays the browser's own bookkeeping, as before. */
  private ownerFromState(robotId: string, wire: string | null | undefined, current: string | null): string | null {
    if (wire === undefined) return current
    this.wireOwners.set(robotId, wire)
    const notYet = wire === null || isMissionOwner(wire) || isNavOwner(wire)
    if (notYet && current === currentOperatorId() && this.takesInFlight.has(robotId)) return currentOperatorId()
    // The mirror image: while this tab's release is in flight, a /state still
    // naming this operator was built before the bridge handled it. Read as
    // "not yet", or the owner flips back to this operator and the drive
    // overlay remounts over a robot being released.
    if (wire === currentOperatorId() && current === null && this.releasesInFlight.has(robotId)) return null
    return wire
  }

  private handleHeartbeatMessage(payload: Buffer, retained = false): void {
    let hb: {
      bridge_id: string
      robot_id: string
      timestamp: string
      mission_active?: boolean
      sdk_connected: boolean
      dds_connected: boolean
      cloud_connected: boolean
      available_motions?: string[]
      host_metrics?: EdgeHostMetrics | null
    }
    try {
      hb = JSON.parse(payload.toString())
    } catch {
      return
    }
    this.upsertRobot(hb.robot_id, (r) => ({
      connectivity: {
        ...(r?.connectivity ?? {
          robot_to_edge: 'unavailable' as const,
          bridge_state: 'connected' as const,
          bridge_latency_ms: null,
        }),
        grpc: hb.sdk_connected ? 'connected' : 'unavailable',
        dds: hb.dds_connected ? 'connected' : 'unavailable',
        edge_to_cloud: hb.cloud_connected ? 'connected' : 'offline',
        // A heartbeat arriving at all proves the bridge is alive and reaching
        // the broker, whatever the skeleton assumed.
        bridge_state: 'connected',
      },
      available_motions: hb.available_motions ?? r?.available_motions ?? [],
      bridge: {
        bridge_id: hb.bridge_id ?? r?.bridge?.bridge_id ?? 'unknown',
        schema_version: r?.bridge?.schema_version ?? null,
        // When it ARRIVED, not the bridge's own timestamp: an edge device with
        // no RTC battery boots minutes slow (the Jetson, 37 min, 2026-11-10),
        // and its live heartbeats then looked silent until NTP caught up. A
        // retained heartbeat is replayed on subscribe and may be long dead, so
        // it keeps the device's stamp. The raw stamp stays in raw_heartbeat.
        last_heartbeat_at: retained ? (hb.timestamp ?? null) : new Date().toISOString(),
        mission_active: hb.mission_active ?? false,
        raw_registration: r?.bridge?.raw_registration,
        raw_heartbeat: hb as unknown as Record<string, unknown>,
        host: r?.bridge?.host,
        host_metrics: hb.host_metrics ?? r?.bridge?.host_metrics,
        acceptance: r?.bridge?.acceptance,
      },
    }))
  }
}
