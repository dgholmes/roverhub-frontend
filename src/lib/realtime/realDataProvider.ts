import type { MqttClient } from 'mqtt'
import type { Command, CommandType, RobotImuState, RobotMotorState, RobotState, TimelineEvent } from '@/types'
import { mockDataProvider } from '@/mocks/mockDataProvider'
import { DRIVE_SPEED_RATIO } from '@/lib/teleop'
import { capabilitiesFor } from '@/lib/robotCapabilities'
import { grpcAfterTelemetry } from '@/lib/connectivityHealth'
import { decodeToRobotPcm } from '@/lib/audioPcm'
import { connectBroker } from './mqttClient'
import type { LinkPhase } from './linkHealth'

type TelemetryListener = (robots: RobotState[]) => void
type EventListener = (event: TimelineEvent) => void

/** Stand-in operator identity. There is no auth this round (CLAUDE.md), so
 * every command is attributed to the same synthetic operator -- used both as
 * the command's `initiated_by` and as the local control_owner. */
const OPERATOR_ID = 'operator-dev'

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
export const SAFETY_ACK_TIMEOUT_MS = 5_000
export const ROUTINE_ACK_TIMEOUT_MS = 15_000

/** Bounds the POST itself, so a request that never resolves cannot leave the
 * operator without feedback. Kept under the routine ack budget. */
export const POST_TIMEOUT_MS = 8_000

/** Commands whose failure the operator must learn about immediately. */
const SAFETY_COMMAND_TYPES = new Set<CommandType>(['ESTOP', 'RESET_ESTOP', 'RELEASE_CONTROL'])

function ackTimeoutFor(type: CommandType): number {
  return SAFETY_COMMAND_TYPES.has(type) ? SAFETY_ACK_TIMEOUT_MS : ROUTINE_ACK_TIMEOUT_MS
}

/** Turns a thrown value into something an operator can act on. Distinguishes
 * "we gave up waiting" from "the network refused us" from "the cloud said no",
 * because the operator's next move differs in each case. */
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
}

const WIRED_COMMAND_TYPES = new Set<CommandType>([
  'ESTOP', 'RESET_ESTOP', 'TAKE_CONTROL', 'RELEASE_CONTROL', 'SET_OBSTACLE_AVOIDANCE',
  'SET_STATE', 'SET_GAIT', 'CHANGE_MODE', 'SET_SPEED_RATIO', 'VELOCITY_SEQUENCE',
  // Held velocity setpoint for manual driving. Must mirror
  // shared/schemas/commands.py's WIRED_COMMAND_TYPES -- a type missing here
  // silently delegates to mockDataProvider instead of reaching the robot.
  'DRIVE',
  'LINE_WALK', 'ROTATE', 'CIRCLE',
  'BALANCE_AXIS', 'BALANCE_NEUTRAL', 'BALANCE_SEQUENCE', 'DYNAMIC_POSE', 'STATIC_POSE',
  'LED_SIGNAL', 'SPEAK', 'STOP_SPEAK',
  // Wired 2026-08-13. The "camera DDS plumbing" it waited on exists and is
  // confirmed on hardware; the bridge captures the frame stream_manager already
  // holds, uploads it, and returns {snapshot_id, camera} in the ack's `result`.
  'SNAPSHOT',
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
  battery_percent: number
  obstacle_avoidance_enabled: boolean
  grpc_freshness: 'live' | 'stale' | 'missing'
  captured_at: string
}

/** Real MQTT-backed data provider -- same shape as mockDataProvider so
 * useLiveOpsStore doesn't change. Telemetry, state, and heartbeat topics are
 * wired for real (Slices 1-2). Of the command types, the 20 wired via the
 * Full High-Level SDK Command Expansion plan (see WIRED_COMMAND_TYPES) POST
 * to the backend and resolve their ACK progression from the `ack` topic;
 * every other command type and `subscribeEvents` still delegate to
 * mockDataProvider until their own slice wires them for real (see
 * docs/superpowers/specs/2026-07-20-robot-bridge-design.md SS7). `driveRobot`
 * is wired for real too -- unlike mockDataProvider's driveRobot (a synthetic,
 * dead-reckoned position nudge with no ack), it publishes a held velocity
 * setpoint as a `DRIVE` command through the same POST path as any other wired
 * command. The bridge holds the resulting velocity sequence; this only sends
 * intent, on change plus a keepalive. It previously sent one bounded
 * `VELOCITY_SEQUENCE` burst per 250 ms tick on the belief that the bridge had no
 * continuous-velocity concept -- that cost the robot a settle four times a
 * second and half its achievable speed. See the `driveRobot` method doc. */
export class RealDataProvider {
  private config: RealDataProviderConfig
  private client: MqttClient | null = null
  private robots: RobotState[] = []
  private telemetryListeners = new Set<TelemetryListener>()
  private eventListeners = new Set<EventListener>()
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
  /** Distinguishes locally-synthesised failures from backend command_ids. */
  private localFailureSeq = 0

  constructor(config: RealDataProviderConfig) {
    this.config = config
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
   * real heartbeat says otherwise, and battery is 0 rather than some invented
   * value. A robot that is registered but not publishing should read as
   * offline, not as a healthy robot sitting still. */
  private skeletonRobot(robotId: string, siteId: string, robotType: RobotState['robot_type'], name: string): RobotState {
    return {
      robot_id: robotId,
      name,
      site_id: siteId,
      robot_type: robotType,
      abstract_state: 'FAULT',
      sdk_state: 'unknown',
      battery: { percent: 0, est_runtime_min: 0, charging: false },
      position: {
        x_m: 0,
        y_m: 0,
        heading_deg: 0,
        provider: 'dead_reckoning',
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
      const response = await fetch(`${this.config.apiBaseUrl}/robots`)
      if (!response.ok) return
      const registry: RegistryRobotWire[] = await response.json()
      registry.forEach((r) => {
        if (this.config.siteId && r.site_id !== this.config.siteId) return
        this.robotNames.set(r.robot_id, r.name)
        this.upsertRobot(r.robot_id, (existing) => (existing ? { name: r.name } : {}), {
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
    this.upsertRobot(reg.robot_id, (existing) => (existing ? { robot_type: reg.robot_type } : {}), {
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
    return () => {
      this.eventListeners.delete(listener)
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
    if (type === 'TAKE_CONTROL') this.setControlOwner(robotId, OPERATOR_ID)
    if (type === 'RELEASE_CONTROL') this.setControlOwner(robotId, null)
    void this.postCommand(robotId, type, label, onUpdate, params)
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
      const failure = this.localFailure(robotId, type, label, params, failureReasonFor(err))
      if (logWorthy) this.emitEvent(this.eventForCommand(failure))
      onUpdate(failure)
      return
    }

    this.pendingCommandCallbacks.set(command.command_id, onUpdate)
    if (!logWorthy) this.silentCommandIds.add(command.command_id)
    onUpdate(command)
    this.armAckTimeout(command, onUpdate, type)
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
      const response = await fetch(`${this.config.apiBaseUrl}/robots/${robotId}/commands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, label, params, initiated_by: OPERATOR_ID }),
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
  ): Command {
    const at = new Date().toISOString()
    return {
      command_id: `local-fail-${++this.localFailureSeq}`,
      robot_id: robotId,
      type,
      label,
      params,
      stages: [{ stage: 'requested', at }, { stage: 'execution_failed', at }],
      current_stage: 'execution_failed',
      failure_reason: reason,
      initiated_by: OPERATOR_ID,
    }
  }

  private armAckTimeout(command: Command, onUpdate: (c: Command) => void, type: CommandType): void {
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
        failure_reason: `No response from the robot after ${Math.round(ackTimeoutFor(type) / 1000)}s.`,
      }
      if (!wasSilent) this.emitEvent(this.eventForCommand(timedOut))
      onUpdate(timedOut)
    }, ackTimeoutFor(type))
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

  async uploadAudioClip(robotId: string, file: File | Blob): Promise<{ clip_id: string; file_path: string }> {
    const { pcm } = await decodeToRobotPcm(file)
    const formData = new FormData()
    // Named .pcm with an explicit type: the backend derives the stored
    // extension from the content type, never the filename.
    formData.append('file', new Blob([pcm], { type: 'audio/pcm' }), 'clip.pcm')
    const response = await fetch(`${this.config.apiBaseUrl}/robots/${robotId}/audio-clips`, {
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
    const response = await fetch(`${this.config.apiBaseUrl}/tts`, {
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
    this.client = connectBroker({
      wsUrl: this.config.wsUrl,
      siteId: this.config.siteId,
      onPhaseChange: (phase) => this.setLinkPhase(phase),
    })
    this.client.on('message', (topic: string, payload: Buffer) => {
      this.lastFrameAt = Date.now()
      this.handleMessage(topic, payload)
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
  driveRobot(robotId: string, vx: number, vy: number, vyaw: number, speedRatio?: number): void {
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
    const [x, y] = frame.pos_body
    const nextState: RobotState = {
      robot_id: frame.robot_id,
      // Per-robot name from the backend registry, falling back to the id. This
      // used to be config.robotName -- a single hardcoded string, which with
      // more than one robot labelled every one of them identically.
      name: existing?.name ?? this.robotNames.get(frame.robot_id) ?? frame.robot_id,
      site_id: frame.site_id,
      robot_type: frame.robot_type,
      abstract_state: existing?.abstract_state ?? 'STAND',
      sdk_state: existing?.sdk_state ?? 'unknown',
      battery: { percent: frame.battery_percent, est_runtime_min: 0, charging: false },
      position: {
        x_m: x,
        y_m: y,
        heading_deg: existing?.position.heading_deg ?? 0,
        provider: 'dead_reckoning',
        freshness: frame.grpc_freshness,
        updated_at: frame.captured_at,
      },
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
      available_motions: existing?.available_motions ?? [],
      lowerState: existing?.lowerState,
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

  private handleMessage(topic: string, payload: Buffer): void {
    // Routing is by topic *suffix* only -- the site and robot segments are
    // wildcards, and every handler reads robot_id out of the payload instead.
    if (topic.endsWith('/register')) this.handleRegistrationMessage(payload)
    else if (topic.endsWith('/telemetry')) this.handleTelemetryMessage(payload)
    else if (topic.endsWith('/lower_state')) this.handleLowerStateMessage(payload)
    else if (topic.endsWith('/state')) this.handleStateMessage(payload)
    else if (topic.endsWith('/heartbeat')) this.handleHeartbeatMessage(payload)
    else if (topic.endsWith('/ack')) this.handleAckMessage(payload)
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
    const callback = this.pendingCommandCallbacks.get(command.command_id)
    // A command that already timed out has been dropped from the map, so a late
    // ack finds no callback and is ignored — it must not revive a toast the
    // operator has already been told failed.
    callback?.(command)
    if (command.current_stage === 'execution_completed' || command.current_stage === 'execution_failed') {
      this.pendingCommandCallbacks.delete(command.command_id)
      this.clearAckTimeout(command.command_id)
      const wasSilent = this.silentCommandIds.delete(command.command_id)
      if (!wasSilent) this.emitEvent(this.eventForCommand(command))
    }
  }

  private clearAckTimeout(commandId: string): void {
    const timer = this.ackTimers.get(commandId)
    if (timer === undefined) return
    clearTimeout(timer)
    this.ackTimers.delete(commandId)
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
      }),
      { robotType: update.robot_type },
    )
  }

  private handleHeartbeatMessage(payload: Buffer): void {
    let hb: {
      robot_id: string
      sdk_connected: boolean
      dds_connected: boolean
      cloud_connected: boolean
      available_motions?: string[]
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
    }))
  }
}
