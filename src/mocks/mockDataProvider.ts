import type { MissionLibraryEntry } from '@/types'
import { mockMissionLibrary } from './mockMissionLibrary'
import type { RobotState, Command, CommandType, SnapshotPage, SnapshotQuery, SnapshotRecord, TimelineEvent, RunDetail, RunEvent, RunPage, RunQuery } from '@/types'
import { COMMAND_STAGE_ORDER } from '@/types/commands'
import { initialRobots } from './mockRobots'
import { nextEventId } from './mockEvents'
import { mockRuns, sampleRunDetail } from './mockRuns'
import type { LinkPhase } from '@/lib/realtime/linkHealth'

/**
 * Stands in for the real MQTT-over-WS client. Exposes the same subscribe/
 * dispatch shape a real transport would, so swapping to the real backend later
 * is a provider swap rather than a component rewrite.
 */

type TelemetryListener = (robots: RobotState[]) => void
type EventListener = (event: TimelineEvent) => void
type CommandListener = (command: Command) => void

/** How the mock should treat dispatched commands.
 *  - `none`  — normal simulated success (the default)
 *  - `fail`  — terminal `execution_failed` with a reason
 *  - `hang`  — acknowledges `requested` and then nothing, which is what a dead
 *              bridge looks like from the browser */
export type MockFaultMode = 'none' | 'fail' | 'hang'

class MockDataProvider {
  private robots: RobotState[] = initialRobots.map(r => ({ ...r }))
  private telemetryListeners = new Set<TelemetryListener>()
  private eventListeners = new Set<EventListener>()
  private tickHandle: ReturnType<typeof setInterval> | null = null
  private lastDriveAt = new Map<string, number>()
  private faultMode: MockFaultMode = 'none'

  /** Makes the mock fail on demand, so the failure/timeout UI can be exercised
   * without a backend. Set from the browser console:
   * `window.roverhubMock.setFaultMode('fail' | 'hang' | 'none')`.
   *
   * `hang` sends nothing further after `requested`, which is what exercises the
   * real provider's ack timeout; `fail` returns an explicit failure. */
  setFaultMode(mode: MockFaultMode): void {
    this.faultMode = mode
  }

  getFaultMode(): MockFaultMode {
    return this.faultMode
  }

  /** The mock has no transport, so it is always connected and always current.
   * Present so the store can ask either provider the same question. */
  subscribeLinkPhase(listener: (phase: LinkPhase) => void): () => void {
    listener('connected')
    return () => {}
  }

  telemetryAgeMs(): number | null {
    return 0
  }

  getRobots(): RobotState[] {
    return this.robots
  }

  /** Org Console > Devices "Add Robot" -- mock-only (see DevicesPage.tsx's
   * own comment for why: there's no backend robot-registry write API, and
   * OD-8's real Site/Org CRUD is unscheduled future scope). Appends and
   * broadcasts through the same telemetryListeners path everything else
   * uses, so a newly added robot shows up live in Fleet/LiveOps without a
   * page reload. */
  addRobot(robot: RobotState): void {
    this.robots = [...this.robots, robot]
    this.telemetryListeners.forEach((l) => l(this.robots))
  }

  subscribeTelemetry(listener: TelemetryListener): () => void {
    this.telemetryListeners.add(listener)
    if (!this.tickHandle) this.startTicking()
    return () => {
      this.telemetryListeners.delete(listener)
      if (this.telemetryListeners.size === 0 && this.tickHandle) {
        clearInterval(this.tickHandle)
        this.tickHandle = null
      }
    }
  }

  subscribeEvents(listener: EventListener): () => void {
    this.eventListeners.add(listener)
    return () => this.eventListeners.delete(listener)
  }

  private startTicking() {
    this.tickHandle = setInterval(() => {
      this.robots = this.robots.map(r => this.tick(r))
      this.telemetryListeners.forEach(l => l(this.robots))
    }, 1000)
  }

  /** One simulated 1 Hz telemetry sample — matches the edge bridge's
   * telemetry_reader.py merge-and-emit cadence described in CLAUDE.md. */
  private tick(r: RobotState): RobotState {
    const now = new Date().toISOString()
    // A live mock bridge keeps heartbeating; one seeded as silent (older than a
    // minute) stays silent, so Fleet's stale-bridge state stays reviewable.
    const heartbeatAt = r.bridge?.last_heartbeat_at
    if (r.bridge && heartbeatAt && Date.now() - Date.parse(heartbeatAt) < 60_000) {
      r = { ...r, bridge: { ...r.bridge, last_heartbeat_at: now } }
    }
    if (r.abstract_state !== 'AUTO_MISSION') return { ...r, updated_at: now }

    const headingRad = (r.position.heading_deg * Math.PI) / 180
    const dx = Math.cos(headingRad) * r.speed_mps
    const dy = Math.sin(headingRad) * r.speed_mps
    // The mock always has a reading; guard only so the shared nullable type
    // holds. A null here would mean the mock stopped simulating a battery.
    const battery = r.battery.percent === null ? null : Math.max(0, r.battery.percent - 0.02)

    return {
      ...r,
      battery: { ...r.battery, percent: battery === null ? null : Math.round(battery * 100) / 100 },
      position: {
        ...r.position,
        x_m: Math.round((r.position.x_m + dx) * 100) / 100,
        y_m: Math.round((r.position.y_m + dy) * 100) / 100,
        updated_at: now,
      },
      updated_at: now,
    }
  }

  /** Walks a command through the full 12-stage acknowledgement lifecycle
   * (docs/05-ui-ux.md §6) on a timer, invoking onUpdate at each stage. */
  dispatchCommand(
    robotId: string, type: CommandType, label: string, onUpdate: CommandListener,
    params?: Record<string, unknown>,
  ): Command {
    const commandId = `cmd-${Math.random().toString(16).slice(2, 10)}`
    const now = () => new Date().toISOString()

    const command: Command = {
      command_id: commandId,
      robot_id: robotId,
      type,
      label,
      params,
      stages: [{ stage: 'requested', at: now() }],
      current_stage: 'requested',
      initiated_by: 'operator',
    }
    onUpdate({ ...command, stages: [...command.stages] })

    // Fault injection. Without this the mock marched every command to
    // `execution_completed` unconditionally, so the failure, timeout and
    // rejection states the UI renders were unreachable in the default build —
    // which is why they went unexercised long enough for the real provider to
    // ship with no error handling at all.
    // docs/audit/2026-08-12-ui-ux-audit.md §29.
    if (this.faultMode === 'hang') return command
    if (this.faultMode === 'fail') {
      setTimeout(() => {
        command.stages = [...command.stages, { stage: 'execution_failed', at: now() }]
        command.current_stage = 'execution_failed'
        command.failure_reason = 'Injected fault (mock fault mode: fail).'
        onUpdate({ ...command, stages: [...command.stages] })
      }, 700)
      return command
    }

    const remaining = COMMAND_STAGE_ORDER.slice(1)
    remaining.forEach((stage, i) => {
      setTimeout(() => {
        command.stages = [...command.stages, { stage, at: now() }]
        command.current_stage = stage
        onUpdate({ ...command, stages: [...command.stages] })

        if (stage === 'execution_completed') {
          // The provider's own `this.robots` is the one array the 1 Hz tick
          // reads from — mutating a copy elsewhere (e.g. in a Zustand store)
          // gets silently clobbered by the next tick, since tick() only knows
          // about this.robots. State changes from a command must land here.
          if (type === 'ESTOP') this.setAbstractState(robotId, 'E_STOP')
          if (type === 'RESET_ESTOP') this.setAbstractState(robotId, 'STAND')
          if (type === 'TAKE_CONTROL') this.takeControl(robotId, String(params?.operator ?? 'operator'))
          if (type === 'RELEASE_CONTROL') this.releaseControl(robotId)
          if (type === 'SET_GAIT') this.setGait(robotId, params?.gait as RobotState['gait'])
          if (type === 'SET_OBSTACLE_AVOIDANCE') this.setObstacleAvoidance(robotId, Boolean(params?.enabled))

          this.emitEvent({
            event_id: nextEventId(),
            source: 'cloud',
            severity: 'info',
            message: `Command "${label}" completed`,
            ts: now(),
            command_id: commandId,
            acknowledged: true,
          })
        }
      }, (i + 1) * 350)
    })

    return command
  }

  private setAbstractState(robotId: string, state: RobotState['abstract_state']) {
    this.robots = this.robots.map((r) =>
      r.robot_id === robotId ? { ...r, abstract_state: state, updated_at: new Date().toISOString() } : r,
    )
    this.telemetryListeners.forEach((l) => l(this.robots))
  }

  private takeControl(robotId: string, operator: string) {
    this.robots = this.robots.map((r) => {
      if (r.robot_id !== robotId) return r
      return {
        ...r,
        abstract_state: r.obstacle_avoidance ? 'ASSISTED' : 'MANUAL',
        control_owner: operator,
        speed_mps: 0,
        updated_at: new Date().toISOString(),
      }
    })
    this.telemetryListeners.forEach((l) => l(this.robots))
  }

  private releaseControl(robotId: string) {
    this.robots = this.robots.map((r) => {
      if (r.robot_id !== robotId) return r
      return { ...r, abstract_state: 'STAND', control_owner: null, speed_mps: 0, updated_at: new Date().toISOString() }
    })
    this.telemetryListeners.forEach((l) => l(this.robots))
    this.lastDriveAt.delete(robotId)
  }

  private setGait(robotId: string, gait: RobotState['gait'] | undefined) {
    if (!gait) return
    this.robots = this.robots.map((r) =>
      r.robot_id === robotId ? { ...r, gait, updated_at: new Date().toISOString() } : r,
    )
    this.telemetryListeners.forEach((l) => l(this.robots))
  }

  private setObstacleAvoidance(robotId: string, enabled: boolean) {
    this.robots = this.robots.map((r) => {
      if (r.robot_id !== robotId) return r
      const inManualControl = r.abstract_state === 'MANUAL' || r.abstract_state === 'ASSISTED'
      return {
        ...r,
        obstacle_avoidance: enabled,
        abstract_state: inManualControl ? (enabled ? 'ASSISTED' : 'MANUAL') : r.abstract_state,
        updated_at: new Date().toISOString(),
      }
    })
    this.telemetryListeners.forEach((l) => l(this.robots))
  }

  /**
   * Teleoperation velocity burst — a deliberately separate, immediate path
   * from dispatchCommand's 12-stage/350ms-per-stage lifecycle (docs/01-prd.md
   * §16.3: teleoperation needs its own "low-latency path", distinct from
   * mission control commands). No Command object, no ack toast — driving
   * fires many times a second while a key/button is held, and running that
   * through the staged-ack pipeline would spam a toast every ~200ms.
   *
   * vx/vy are body-frame m/s (forward, strafe), vyaw is rad/s turn rate.
   * dt is clamped so a stale lastDriveAt (long pause, tab backgrounded)
   * doesn't cause one huge position jump on the next call.
   */
  driveRobot(robotId: string, vx: number, vy: number, vyaw: number, _speedRatio?: number) {
    const now = Date.now()
    const last = this.lastDriveAt.get(robotId) ?? now
    const dt = Math.min((now - last) / 1000, 0.5)
    this.lastDriveAt.set(robotId, now)

    this.robots = this.robots.map((r) => {
      if (r.robot_id !== robotId) return r
      const headingRad = (r.position.heading_deg * Math.PI) / 180
      const worldDx = Math.cos(headingRad) * vx - Math.sin(headingRad) * vy
      const worldDy = Math.sin(headingRad) * vx + Math.cos(headingRad) * vy
      const headingDeg = (r.position.heading_deg + (vyaw * dt * 180) / Math.PI + 360) % 360
      const nowIso = new Date().toISOString()
      return {
        ...r,
        speed_mps: Math.round(Math.sqrt(vx * vx + vy * vy) * 100) / 100,
        position: {
          ...r.position,
          x_m: Math.round((r.position.x_m + worldDx * dt) * 100) / 100,
          y_m: Math.round((r.position.y_m + worldDy * dt) * 100) / 100,
          heading_deg: Math.round(headingDeg * 10) / 10,
          updated_at: nowIso,
        },
        updated_at: nowIso,
      }
    })
    this.telemetryListeners.forEach((l) => l(this.robots))
  }

  private emitEvent(evt: TimelineEvent) {
    this.eventListeners.forEach(l => l(evt))
  }

  /** Mock counterpart to RealDataProvider.snapshotUrl. There is no stored
   * capture behind a mock ack, so this returns an empty string and callers treat
   * that as "nothing to show" -- better than a URL that 404s and renders as a
   * broken image. */
  snapshotUrl(_snapshotId: string): string {
    return ''
  }

  /** Sample library for the Data page: a handful of captures over the last few
   * days, all showing the stock camera frame. Marked `sample` so the page
   * says so. */
  async listSnapshots(query: SnapshotQuery): Promise<SnapshotPage> {
    const robots = this.robots
    const all = mockSnapshots(robots)
      .filter((s) => !query.robot_id || s.robot_id === query.robot_id)
      .filter((s) => !query.site_id || s.site_id === query.site_id)
      .filter((s) => !query.since || s.received_at >= query.since)
    const offset = query.offset ?? 0
    const limit = query.limit ?? 50
    const items = all.slice(offset, offset + limit)
    return { items, total: all.length, next_offset: offset + limit < all.length ? offset + limit : null, sample: true }
  }

  async listRuns(query: RunQuery): Promise<RunPage> {
    const all = mockRuns(this.robots).map((s) => s.summary)
      .filter((r) => !query.site_id || r.site_id === query.site_id)
      .filter((r) => !query.robot_id || r.robot_id === query.robot_id)
      .filter((r) => !query.mission_id || r.mission_id === query.mission_id)
      .filter((r) => !query.since || r.started_at >= query.since)
      .sort((x, y) => y.started_at.localeCompare(x.started_at))
    const offset = query.offset ?? 0
    const limit = query.limit ?? 50
    return { items: all.slice(offset, offset + limit), total: all.length, next_offset: offset + limit < all.length ? offset + limit : null, sample: true }
  }

  async getRun(runId: string): Promise<RunDetail> {
    const s = mockRuns(this.robots).find((x) => x.summary.run_id === runId)
    if (!s) throw new Error(`no sample run ${runId}`)
    return sampleRunDetail(s)
  }

  async getRunEvents(runId: string): Promise<RunEvent[]> {
    return mockRuns(this.robots).find((x) => x.summary.run_id === runId)?.events ?? []
  }

  /** Sample stills all show the stock frame; sample video and audio have no file. */
  runFileUrl(_runId: string, path: string): string {
    return path.startsWith('video/') || path.startsWith('audio/') ? '' : './live_view.png'
  }

  runZipUrl(_runId: string): string | null {
    return null
  }

  /** Missions, kept in this browser so a refresh doesn't lose them. Seeded
   * from the sample library the first time. */
  async listMissions(siteId: string): Promise<MissionLibraryEntry[]> {
    return readMockMissions().filter((m) => (m.site_id ?? 'site-north-yard') === siteId)
  }

  async saveMission(mission: MissionLibraryEntry): Promise<MissionLibraryEntry> {
    const stored = { ...mission, updated_at: new Date().toISOString() }
    const all = readMockMissions()
    const i = all.findIndex((m) => m.mission_id === mission.mission_id)
    writeMockMissions(i === -1 ? [stored, ...all] : all.map((m, j) => (j === i ? stored : m)))
    return stored
  }

  async setDeviceAcceptance(robotId: string, decision: 'accept' | 'reject'): Promise<void> {
    this.robots = this.robots.map((r) => (r.robot_id === robotId && r.bridge
      ? { ...r, bridge: { ...r.bridge, acceptance: decision === 'accept' ? 'accepted' as const : 'rejected' as const } }
      : r))
    this.telemetryListeners.forEach((l) => l(this.robots))
  }

  async deleteMission(missionId: string): Promise<void> {
    writeMockMissions(readMockMissions().filter((m) => m.mission_id !== missionId))
  }

  /** Mock counterpart to RealDataProvider.uploadAudioClip -- there's no real
   * filesystem/backend to save to in mock mode, so this fabricates a
   * plausible-looking path. Harmless: mockDataProvider.dispatchCommand
   * already fully simulates the ack lifecycle regardless of what's in
   * `params`, so nothing downstream actually reads this path off disk. */
  /** Mock counterpart to RealDataProvider.synthesizeSpeech -- returns a tiny
   * silent WAV so the Say tab is exercisable without a backend. */
  async synthesizeSpeech(text: string): Promise<Blob> {
    if (!text.trim()) throw new Error('no text to speak')
    // 44-byte RIFF header describing zero samples: structurally a valid WAV.
    const header = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45,
      0x66, 0x6d, 0x74, 0x20, 0x10, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00,
      0xc0, 0x5d, 0x00, 0x00, 0x80, 0xbb, 0x00, 0x00, 0x02, 0x00, 0x10, 0x00,
      0x64, 0x61, 0x74, 0x61, 0x00, 0x00, 0x00, 0x00,
    ])
    return new Blob([header], { type: 'audio/wav' })
  }

  async uploadAudioClip(robotId: string, file: File | Blob): Promise<{ clip_id: string; file_path: string }> {
    const name = file instanceof File ? file.name : 'clip.wav'
    const id = `${robotId}-${Date.now()}-${name}`
    return { clip_id: id, file_path: `mock://audio-clips/${id}` }
  }
}

export const mockDataProvider = new MockDataProvider()

// Exposed for manual exercise of the failure/timeout UI during development:
//   roverhubMock.setFaultMode('fail')   // commands fail
//   roverhubMock.setFaultMode('hang')   // commands never acknowledge
//   roverhubMock.setFaultMode('none')   // back to normal
// Dev-only; `import.meta.env.DEV` is statically false in a production build, so
// this is dropped entirely rather than shipped to operators.
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as { roverhubMock: MockDataProvider }).roverhubMock = mockDataProvider
}

const SAMPLE_CAMERAS = ['front', 'front', 'rear']
/** Deterministic sample captures: spread across robots and the last four days. */
function mockSnapshots(robots: RobotState[]): SnapshotRecord[] {
  const out: SnapshotRecord[] = []
  const now = Date.now()
  for (let i = 0; i < 14; i++) {
    const r = robots[i % robots.length]
    if (!r) break
    const at = new Date(now - (i * 5.3 + (i % 3)) * 3600_000).toISOString()
    out.push({
      snapshot_id: `sample-${i}`, robot_id: r.robot_id, site_id: r.site_id, camera: SAMPLE_CAMERAS[i % 3],
      captured_at: at, received_at: at, size_bytes: 38_000 + i * 731, image_url: './live_view.png',
      // Spread along the yard; the oldest one has no position, like a capture
      // from a bridge older than 0.0.9.
      position: i === 13 ? null : { x_m: 2 + (i * 4.1) % 52, y_m: -14 + (i * 7.3) % 28, quality: 'estimated', provider: 'dead_reckoning' },
    })
  }
  return out
}

const MOCK_MISSIONS_KEY = 'rh.mock.missions'

function readMockMissions(): MissionLibraryEntry[] {
  try {
    const raw = localStorage.getItem(MOCK_MISSIONS_KEY)
    if (raw) return JSON.parse(raw) as MissionLibraryEntry[]
  } catch { /* fall back to the sample library */ }
  return mockMissionLibrary.map((m) => ({ ...m, site_id: m.site_id ?? 'site-north-yard' }))
}

function writeMockMissions(missions: MissionLibraryEntry[]): void {
  try { localStorage.setItem(MOCK_MISSIONS_KEY, JSON.stringify(missions)) } catch { /* per-viewer only */ }
}
