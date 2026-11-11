import type { MissionLibraryEntry, MissionTask, TaskOccurrence } from '@/types'
import { ApiError } from '@/lib/realtime/apiError'
import { currentOperatorId } from '@/lib/realtime/operator'
import { RunStartRefused, type StartRunRequest } from '@/lib/realtime/runStart'
import type { Step } from '@/missions/program/types'
import { materialiseMockOccurrences } from './mockOccurrences'
import { mockMissionLibrary } from './mockMissionLibrary'
import { mockTaskLibrary } from './mockTasks'
import { mockMaps } from './maps'
import { sampleSite } from './mockGeoZones'
import type { SampleSite } from '@/liveops/sampleSite'
import type { MapArtifactKind, MapStatus, MapZone, SiteMap } from '@/types/maps'
import type { RobotState, Command, CommandType, SnapshotPage, SnapshotQuery, SnapshotRecord, TimelineEvent, MissionRun, RunDetail, RunEvent, RunPage, RunQuery, RunSummary } from '@/types'
import { COMMAND_STAGE_ORDER } from '@/types/commands'
import { initialRobots } from './mockRobots'
import { nextEventId } from './mockEvents'
import { mockRuns, sampleRunDetail } from './mockRuns'
import { mockRouteSteps } from './mockRouteSteps'
import { ACTIVE_STEP_KINDS, type ActiveStepKind } from '@/types/robotState'
import type { LinkPhase } from '@/lib/realtime/linkHealth'

/**
 * Stands in for the real MQTT-over-WS client. Exposes the same subscribe/
 * dispatch shape a real transport would, so swapping to the real backend later
 * is a provider swap rather than a component rewrite.
 */

type TelemetryListener = (robots: RobotState[]) => void
type EventListener = (event: TimelineEvent) => void
type CommandListener = (command: Command) => void
type RunEventListener = (event: RunEvent) => void

/** How far apart the simulated run's events are. Slow enough to watch the bar
 * change, fast enough that a whole program finishes while you look. */
export const MOCK_RUN_STEP_MS = 1500

/** One simulated edge run. `inStep` says whether steps[index] has started and
 * not finished, which is the step a pause marks to be redone. */
interface SimRun {
  run: MissionRun
  steps: Step[]
  index: number
  inStep: boolean
  seq: number
  status: 'running' | 'paused'
  /** Who paused it; only they may resume it (spec §6.4). */
  pausedBy: string | null
  /** 0.0.16: the robot paused it (a blocked route leg) or an operator did. */
  pausedFor: 'operator' | 'blocked' | null
  redoLabel: string | null
  timer: ReturnType<typeof setTimeout> | null
  /** A route run's waypoint: the one being walked to, or acted at. */
  waypointId: string | null
  isRoute: boolean
}

/** How the mock should treat dispatched commands.
 *  - `none`  — normal simulated success (the default)
 *  - `fail`  — terminal `execution_failed` with a reason
 *  - `hang`  — acknowledges `requested` and then nothing, which is what a dead
 *              bridge looks like from the browser */
export type MockFaultMode = 'none' | 'fail' | 'hang'

/** The START_MISSION a simulated start answers with, already completed: the
 * mock bridge never refuses a start the dispatcher's checks let through. */
function startedCommand(run: MissionRun): Command {
  const at = new Date().toISOString()
  return {
    command_id: `start-${run.run_id}`, robot_id: run.robot_id, type: 'START_MISSION', label: `Start ${run.mission.name}`,
    params: { run_id: run.run_id }, stages: [{ stage: 'requested', at }, { stage: 'execution_completed', at }],
    current_stage: 'execution_completed', initiated_by: currentOperatorId(),
  }
}

export class MockDataProvider {
  private robots: RobotState[] = initialRobots.map(r => ({ ...r }))
  /** Runs recorded by this browser (block programs), kept for the session. */
  private madeRuns = new Map<string, { run: MissionRun; events: RunEvent[] }>()
  private telemetryListeners = new Set<TelemetryListener>()
  private eventListeners = new Set<EventListener>()
  private tickHandle: ReturnType<typeof setInterval> | null = null
  private lastDriveAt = new Map<string, number>()
  private faultMode: MockFaultMode = 'none'
  /** robot_id -> the run the mock bridge is executing there. */
  private simRuns = new Map<string, SimRun>()
  private runEventListeners = new Map<string, Set<RunEventListener>>()

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

  /** The mock holds no connection, but a simulated run holds a timer, and an
   * instance replaced by Vite's HMR would keep beating it for the life of the
   * tab. Mirrors RealDataProvider.dispose so dataProvider.ts can call it on either. */
  dispose(): void {
    for (const sim of this.simRuns.values()) if (sim.timer) clearTimeout(sim.timer)
    this.simRuns.clear()
    this.runEventListeners.clear()
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

    // What the bridge does with control while a run executes (spec §6.3).
    // Release is refused: handing the robot back is Stop mission or E-Stop.
    const sim = this.simRuns.get(robotId)
    // RESUME retries a run the ROBOT paused as blocked, while nobody holds
    // control (schema 0.0.16); the bridge refuses anything else.
    if (type === 'RESUME') {
      const owner = this.robots.find((r) => r.robot_id === robotId)?.control_owner ?? null
      const refusal = !sim || sim.run.run_id !== params?.run_id || sim.status !== 'paused' || sim.pausedFor !== 'blocked'
        ? 'REJECTED_NOT_BLOCKED: the run is not paused as blocked'
        : owner !== null ? `REJECTED_CONTROL_HELD: control is held by ${owner}` : null
      if (refusal) {
        setTimeout(() => {
          command.stages = [...command.stages, { stage: 'execution_failed', at: now() }]
          command.current_stage = 'execution_failed'
          command.failure_reason = refusal
          onUpdate({ ...command, stages: [...command.stages] })
        }, 350)
        return command
      }
    }
    if (sim?.status === 'running' && type === 'RELEASE_CONTROL') {
      setTimeout(() => {
        command.stages = [...command.stages, { stage: 'execution_failed', at: now() }]
        command.current_stage = 'execution_failed'
        command.failure_reason = 'REJECTED_MISSION_HOLDS_CONTROL: the mission holds control; stop the mission to take the robot back'
        onUpdate({ ...command, stages: [...command.stages] })
      }, 350)
      return command
    }
    // Take control pauses at once, as the bridge cancels the step in flight
    // before it stands the robot up. Waiting for the 2.45 s ack walk would let
    // the step finish first and make every pause land between steps.
    if (sim?.status === 'running' && type === 'TAKE_CONTROL') this.pauseRun(robotId, currentOperatorId())
    // E-Stop ends the run at once too, for the same reason: steps must stop
    // beating when it is pressed, not 2.45 s later. Release E-Stop does not
    // resume it; the run is over.
    if (type === 'ESTOP') this.endRun(robotId, 'aborted', 'estop')

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
          // Release leaves the robot lying down (`ready`); it never stands it up.
          if (type === 'RESET_ESTOP') this.setAbstractState(robotId, 'PASSIVE')
          if (type === 'STOP_MISSION') this.endRun(robotId, 'aborted', 'stopped')
          if (type === 'TAKE_CONTROL') {
            const paused = this.simRuns.get(robotId)
            if (!paused) this.takeControl(robotId, currentOperatorId())
            else {
              // pauseRun already handed control over; this is also the path for
              // taking a paused run back after a plain release left it with nobody.
              this.takeControl(robotId, currentOperatorId())
              paused.pausedBy = currentOperatorId()
              // A blocked pause taken over becomes this operator's pause: only
              // their Release & resume continues it now, as on the bridge.
              if (paused.pausedFor === 'blocked') {
                paused.pausedFor = 'operator'
                this.patchActiveRun(robotId, { paused_for: 'operator', pause_reason: null })
              }
            }
          }
          if (type === 'RELEASE_CONTROL') {
            const paused = this.simRuns.get(robotId)
            const owner = this.robots.find((r) => r.robot_id === robotId)?.control_owner
            // Only an explicit Release & resume, from whoever paused it, resumes.
            // Any other release, the 60 s deadman's included, leaves it paused.
            if (paused && params?.resume_run === true && paused.pausedBy === owner) this.resumeRun(robotId)
            else this.releaseControl(robotId)
          }
          if (type === 'RESUME') this.resumeRun(robotId)
          if (type === 'SET_GAIT') this.setGait(robotId, params?.gait as RobotState['gait'])
          if (type === 'SET_OBSTACLE_AVOIDANCE') this.setObstacleAvoidance(robotId, Boolean(params?.enabled))
          if (type === 'CHANGE_MODE') this.toggleLegConfig(robotId)

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

  /** A simulated edge run, standing in for POST /robots/{id}/runs (spec §10).
   * The mock bridge takes control as `mission:<run_id>`, reports AUTO_MISSION,
   * and walks the top-level steps on a timer: run_started, then step_started
   * and step_done per step, MOCK_RUN_STEP_MS apart, then run_ended completed.
   * Loops and branches are not expanded: a top-level step is one beat.
   *
   * Refuses for the same reasons, in the same words, as the backend's
   * dispatcher (runs/dispatch.py `_check`), so the refusal path is exercisable
   * in mock mode. NOT mirrored: `maxDurationS`, so there is no timeLimit end. */
  async startRun(robotId: string, req: StartRunRequest, onCommand?: (command: Command) => void): Promise<{ run: MissionRun }> {
    const run = this.beginRun(robotId, req)
    onCommand?.(startedCommand(run))
    return { run }
  }

  private beginRun(robotId: string, req: StartRunRequest, runId?: string): MissionRun {
    const robot = this.robots.find((r) => r.robot_id === robotId)
    if (!robot || robot.connectivity.edge_to_cloud === 'offline') throw new RunStartRefused(`${robotId} is offline`, 409)
    if (robot.abstract_state === 'E_STOP' || robot.sdk_state === 'passive') throw new RunStartRefused('the robot is in E-Stop; release it first', 409)
    if (this.simRuns.has(robotId) || robot.active_run) throw new RunStartRefused(`${robotId} is already running a mission`, 409)
    if (robot.control_owner) throw new RunStartRefused(`someone has control of ${robotId}; release control first`, 409)
    // A route is compiled here, as the backend does when a run starts (0.0.16);
    // a program arrives compiled.
    const isRoute = req.mission.kind === 'route'
    if (isRoute && (req.steps ?? []).length > 0) throw new RunStartRefused('a route is compiled by the backend; send no steps', 422)
    const steps = isRoute ? mockRouteSteps(req.mission) : req.steps ?? []
    if (steps.length === 0) {
      throw new RunStartRefused(isRoute ? 'the route has no waypoints to walk to' : 'the program has no steps to run', 409)
    }

    const startedAt = new Date().toISOString()
    const run: MissionRun = {
      run_id: runId ?? `run-${Math.random().toString(16).slice(2, 10)}`,
      mission_id: req.mission.mission_id, mission: req.mission, robot_id: robotId,
      site_id: req.mission.site_id ?? robot.site_id, started_at: startedAt, ended_at: null,
      result: 'running', started_by: currentOperatorId(), end_reason: null, bucket_copied_at: null,
      source: req.source, bridge_boot_id: 'mock-boot',
    }
    // Through the same store as a browser-recorded run, so Data › Missions lists it.
    void this.putRun(run)
    const sim: SimRun = {
      run, steps, index: 0, inStep: false, seq: 0, status: 'running', pausedBy: null, pausedFor: null, redoLabel: null, timer: null,
      waypointId: null, isRoute,
    }
    this.simRuns.set(robotId, sim)
    this.patchRobot(robotId, {
      abstract_state: 'AUTO_MISSION', control_owner: `mission:${run.run_id}`,
      active_run: { run_id: run.run_id, status: 'running', step_label: null, block_id: null, started_at: startedAt, redo_step_label: null },
    })
    this.emitRunEvent(robotId, 'run_started')
    this.scheduleBeat(robotId)
    return run
  }

  subscribeRunEvents(robotId: string, listener: RunEventListener): () => void {
    let set = this.runEventListeners.get(robotId)
    if (!set) this.runEventListeners.set(robotId, (set = new Set()))
    const listeners = set
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }

  private scheduleBeat(robotId: string) {
    const sim = this.simRuns.get(robotId)
    if (!sim) return
    sim.timer = setTimeout(() => this.beat(robotId), MOCK_RUN_STEP_MS)
  }

  /** One event of the run: start the next step, finish the current one, or end. */
  private beat(robotId: string) {
    const sim = this.simRuns.get(robotId)
    if (!sim || sim.status !== 'running') return
    sim.timer = null
    const step = sim.steps[sim.index]
    if (!step) {
      this.endRun(robotId, 'completed', null)
      return
    }
    if (!sim.inStep) {
      sim.inStep = true
      if (step.kind === 'navigate') sim.waypointId = step.waypointId
      this.emitRunEvent(robotId, 'step_started', step)
      const stepKind = (ACTIVE_STEP_KINDS as readonly string[]).includes(step.kind) ? step.kind as ActiveStepKind : null
      this.patchActiveRun(robotId, {
        step_label: step.label, block_id: step.blockId, step_kind: stepKind,
        ...(sim.isRoute ? { waypoint_id: sim.waypointId } : {}),
      })
    } else {
      sim.inStep = false
      sim.index += 1
      this.emitRunEvent(robotId, 'step_done', step)
      // A leg's end is the robot being there, as the bridge reports it.
      if (step.kind === 'navigate') this.emitRunEvent(robotId, 'arrived', step)
    }
    this.scheduleBeat(robotId)
  }

  /** Take control mid-run (spec §6.3): the step in flight is cancelled and
   * marked to be redone; one already finished is not. Control goes to the
   * operator, and the robot reports the usual non-mission state while paused. */
  private pauseRun(robotId: string, operator: string) {
    const sim = this.simRuns.get(robotId)
    if (!sim || sim.status !== 'running') return
    if (sim.timer) clearTimeout(sim.timer)
    sim.timer = null
    sim.status = 'paused'
    sim.pausedBy = operator
    sim.pausedFor = 'operator'
    const redo = sim.inStep ? sim.steps[sim.index] : null
    sim.inStep = false
    sim.redoLabel = redo?.label ?? null
    this.emitRunEvent(robotId, 'paused', redo ?? undefined)
    const robot = this.robots.find((r) => r.robot_id === robotId)
    this.patchRobot(robotId, {
      abstract_state: robot?.obstacle_avoidance ? 'ASSISTED' : 'MANUAL',
      control_owner: operator,
      speed_mps: 0,
    })
    this.patchActiveRun(robotId, { status: 'paused', redo_step_label: sim.redoLabel, paused_for: 'operator' })
  }

  /** The robot pauses its own run (schema 0.0.16): a route leg stayed blocked
   * through its retries. The leg in flight is redone on resume, and control is
   * handed back, so nobody holds it; Retry (RESUME) or Take control then
   * Release & resume continues it. Public so tests and the demo can make one,
   * since nothing in the mock blocks by itself. */
  blockRun(robotId: string, reason: string) {
    const sim = this.simRuns.get(robotId)
    if (!sim || sim.status !== 'running') return
    if (sim.timer) clearTimeout(sim.timer)
    sim.timer = null
    sim.status = 'paused'
    sim.pausedBy = null
    sim.pausedFor = 'blocked'
    const redo = sim.inStep ? sim.steps[sim.index] : null
    sim.inStep = false
    sim.redoLabel = redo?.label ?? null
    this.emitRunEvent(robotId, 'paused', redo ?? undefined, undefined, reason)
    this.patchRobot(robotId, { abstract_state: 'STAND', control_owner: null, speed_mps: 0 })
    this.patchActiveRun(robotId, { status: 'paused', redo_step_label: sim.redoLabel, paused_for: 'blocked', pause_reason: reason })
  }

  /** Release & resume (spec §6.4): the mission takes control back and the
   * interrupted step, if there was one, starts again from the top. */
  private resumeRun(robotId: string) {
    const sim = this.simRuns.get(robotId)
    if (!sim || sim.status !== 'paused') return
    sim.status = 'running'
    sim.pausedBy = null
    sim.pausedFor = null
    sim.redoLabel = null
    this.emitRunEvent(robotId, 'resumed')
    this.patchRobot(robotId, { abstract_state: 'AUTO_MISSION', control_owner: `mission:${sim.run.run_id}`, speed_mps: 0 })
    this.patchActiveRun(robotId, { status: 'running', redo_step_label: null, paused_for: null, pause_reason: null })
    this.scheduleBeat(robotId)
  }

  /** Ends the robot's simulated run, if it has one, and records the result.
   * The mission lets go of control; an operator holding it while paused keeps it. */
  private endRun(robotId: string, result: 'completed' | 'aborted' | 'failed', reason: string | null) {
    const sim = this.simRuns.get(robotId)
    if (!sim) return
    if (sim.timer) clearTimeout(sim.timer)
    this.emitRunEvent(robotId, 'run_ended', undefined, { result, reason })
    this.simRuns.delete(robotId)
    const ended = { ...sim.run, result, end_reason: reason, ended_at: new Date().toISOString() }
    void this.putRun(ended)
    const robot = this.robots.find((r) => r.robot_id === robotId)
    const missionHeld = robot?.control_owner === `mission:${sim.run.run_id}`
    this.patchRobot(robotId, {
      active_run: null,
      ...(missionHeld ? { control_owner: null } : {}),
      ...(robot?.abstract_state === 'AUTO_MISSION' ? { abstract_state: 'STAND' as const, speed_mps: 0 } : {}),
    })
  }

  private emitRunEvent(
    robotId: string, kind: RunEvent['kind'], step?: Step,
    end?: { result: RunEvent['result']; reason: string | null },
    reason?: string,
  ) {
    const sim = this.simRuns.get(robotId)
    if (!sim) return
    sim.seq += 1
    const event: RunEvent = {
      run_id: sim.run.run_id, seq: sim.seq, at: new Date().toISOString(), kind,
      waypoint_id: sim.isRoute ? sim.waypointId : null, task_index: null,
      // A blocked pause is the robot's own: no person paused it.
      actor: (kind === 'paused' && reason === undefined) || kind === 'resumed' ? currentOperatorId() : null,
      media: null, position: null, detection: null, message: step?.label ?? null,
      block_id: step?.blockId ?? null, result: end?.result ?? null, reason: end?.reason ?? reason ?? null, snapshot_id: null,
    }
    void this.postRunEvents(sim.run.run_id, [event])
    this.runEventListeners.get(robotId)?.forEach((l) => l(event))
  }

  private patchRobot(robotId: string, patch: Partial<RobotState>) {
    this.robots = this.robots.map((r) =>
      r.robot_id === robotId ? { ...r, ...patch, updated_at: new Date().toISOString() } : r,
    )
    this.telemetryListeners.forEach((l) => l(this.robots))
  }

  private patchActiveRun(robotId: string, patch: Partial<NonNullable<RobotState['active_run']>>) {
    const current = this.robots.find((r) => r.robot_id === robotId)?.active_run
    if (current) this.patchRobot(robotId, { active_run: { ...current, ...patch } })
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

  /** Like the bridge's reading: a known configuration flips, unknown stays unknown. */
  private toggleLegConfig(robotId: string) {
    this.robots = this.robots.map((r) => {
      if (r.robot_id !== robotId || !r.leg_config || r.leg_config === 'unknown') return r
      return { ...r, leg_config: r.leg_config === 'normal' ? 'x' : 'normal', updated_at: new Date().toISOString() }
    })
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
  /** Nothing is playing in mock mode, so there is nothing to turn down. */
  setSpeakVolume(_robotId: string, _volume: number) {}

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

  /** Maps edited this session (zones, status), over the shared sample, which is
   * never mutated. */
  private editedMaps = new Map<string, SiteMap>()

  /** Mock counterpart to RealDataProvider.listMaps: the one sample map. */
  async listMaps(siteId: string): Promise<SiteMap[]> {
    return mockMaps.filter((m) => m.site_id === siteId).map((m) => this.editedMaps.get(m.map_id) ?? m)
  }

  /** Null for an unknown id, like the real provider on a 404. */
  async getMap(mapId: string): Promise<SiteMap | null> {
    const sample = mockMaps.find((m) => m.map_id === mapId)
    return sample ? this.editedMaps.get(mapId) ?? sample : null
  }

  /** Mock counterpart to RealDataProvider.saveMapZones. */
  async saveMapZones(mapId: string, zones: MapZone[]): Promise<SiteMap> {
    const current = await this.getMap(mapId)
    if (!current) throw new ApiError(404, { detail: 'map not found' }, 'PUT /maps/zones answered 404')
    const next = { ...current, zones }
    this.editedMaps.set(mapId, next)
    return next
  }

  /** Mock counterpart to RealDataProvider.setMapStatus, with the backend's one
   * rule: a map with no floors cannot be activated. */
  async setMapStatus(mapId: string, status: MapStatus): Promise<SiteMap> {
    const current = await this.getMap(mapId)
    if (!current) throw new ApiError(404, { detail: 'map not found' }, 'PUT /maps/status answered 404')
    if (status === 'active' && current.floors.length === 0) {
      throw new ApiError(400, { detail: 'a map with no floors cannot be activated' }, 'PUT /maps/status answered 400')
    }
    const next = { ...current, status }
    this.editedMaps.set(mapId, next)
    return next
  }

  /** There are no stored artifacts behind a mock map, so this returns an empty
   * string and callers treat it as "nothing to show" (see `snapshotUrl`). */
  mapArtifactUrl(_mapId: string, _floorIndex: number, _kind: MapArtifactKind): string {
    return ''
  }

  /** The made-up North Yard the map draws in mock mode: a perimeter and no-go
   * zones where there is no surveyed map, and hazard pins. See `SampleSite`. */
  sampleSite(): SampleSite {
    return sampleSite
  }

  async listRuns(query: RunQuery): Promise<RunPage> {
    const made: RunSummary[] = [...this.madeRuns.values()].map(({ run }) => ({ ...run, photo_count: 0, video_count: 0, detection_count: 0 }))
    const all = [...made, ...mockRuns(this.robots).map((s) => s.summary)]
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
    const made = this.madeRuns.get(runId)
    if (made) return { run: made.run, files: [], event_count: made.events.length }
    const s = mockRuns(this.robots).find((x) => x.summary.run_id === runId)
    if (!s) throw new Error(`no sample run ${runId}`)
    return sampleRunDetail(s)
  }

  async getRunEvents(runId: string): Promise<RunEvent[]> {
    const made = this.madeRuns.get(runId)
    if (made) return made.events
    return mockRuns(this.robots).find((x) => x.summary.run_id === runId)?.events ?? []
  }

  async putRun(run: MissionRun): Promise<void> {
    this.madeRuns.set(run.run_id, { run, events: this.madeRuns.get(run.run_id)?.events ?? [] })
  }

  /** Idempotent by seq, like the backend. */
  async postRunEvents(runId: string, events: RunEvent[]): Promise<void> {
    const entry = this.madeRuns.get(runId)
    if (!entry) throw new Error(`no run ${runId}`)
    const have = new Set(entry.events.map((e) => e.seq))
    entry.events = [...entry.events, ...events.filter((e) => !have.has(e.seq))].sort((a, b) => a.seq - b.seq)
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

  /** Behaves like PUT /missions/{id}: a create is stored at version 1 whatever
   * the body carried, a replace must present the stored version and bumps it,
   * and a stale one is refused -- so mock mode surfaces a dropped `version`
   * the way the backend would, instead of hiding it.
   *
   * NOT mirrored: the backend's `kind` invariants (a route mission needs
   * waypoints, a program mission needs a program), which it answers with 422.
   * The mock accepts anything with a current version, so mock acceptance is not
   * evidence that the real backend would take the same mission. */
  async saveMission(mission: MissionLibraryEntry): Promise<MissionLibraryEntry> {
    const all = readMockMissions()
    const i = all.findIndex((m) => m.mission_id === mission.mission_id)
    if (i !== -1 && all[i].version !== mission.version) {
      // The same error the backend's 409 becomes: the stored entity is the body.
      throw new ApiError(409, all[i], `PUT /missions answered 409 (stale version ${mission.version}, stored ${all[i].version})`)
    }
    const stored = { ...mission, version: i === -1 ? 1 : mission.version + 1, updated_at: new Date().toISOString() }
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

  /** Tasks, kept in this browser beside the missions and seeded from the sample
   * library the first time. Same version rules as the backend's PUT /tasks/{id}. */
  async listTasks(siteId: string): Promise<MissionTask[]> {
    return readMockTasks().filter((t) => t.site_id === siteId)
  }

  /** Same version rules as PUT /tasks/{id} (409 on a stale version).
   *
   * NOT mirrored: the backend's validation of `schedule.timezone` and
   * `start_at`, which it answers with 422. The mock stores whatever it is
   * given, so mock acceptance is not evidence the real backend would accept it. */
  async saveTask(task: MissionTask): Promise<MissionTask> {
    const all = readMockTasks()
    const i = all.findIndex((t) => t.task_id === task.task_id)
    if (i !== -1 && all[i].version !== task.version) {
      throw new ApiError(409, all[i], `PUT /tasks answered 409 (stale version ${task.version}, stored ${all[i].version})`)
    }
    const stored = { ...task, version: i === -1 ? 1 : task.version + 1, updated_at: new Date().toISOString() }
    writeMockTasks(i === -1 ? [...all, stored] : all.map((t, j) => (j === i ? stored : t)))
    return stored
  }

  async deleteTask(taskId: string): Promise<void> {
    writeMockTasks(readMockTasks().filter((t) => t.task_id !== taskId))
  }

  /** Occurrences with from <= due_at < to, oldest first, as the backend lists
   * them. There is no scheduler behind the mock, so they are the ones a run-now
   * queued plus what the tasks' schedules would have produced
   * (mockOccurrences.ts). A queued one wins over a materialised one for the
   * same slot, so a run-now is never overwritten. */
  async listOccurrences(siteId: string, from: string, to: string): Promise<TaskOccurrence[]> {
    const lo = Date.parse(from)
    const hi = Date.parse(to)
    const queued = readMockOccurrences()
    const queuedIds = new Set(queued.map((o) => o.occurrence_id))
    const materialised = materialiseMockOccurrences(readMockTasks(), readMockMissions(), from, to, new Date(), siteId)
      .filter((o) => !queuedIds.has(o.occurrence_id))
    return [...queued, ...materialised]
      .filter((o) => o.site_id === siteId && Date.parse(o.due_at) >= lo && Date.parse(o.due_at) < hi)
      .sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at) || a.occurrence_id.localeCompare(b.occurrence_id))
  }

  /** Starts the task's mission on its robot at once, as POST /tasks/{id}/run-now
   * with steps does: a simulated run (see startRun) whose run_id is the
   * occurrence's id, and an occurrence recorded as running. A refusal records
   * nothing, so it leaves nothing on the calendar. */
  async runTaskNow(taskId: string, steps: Step[], onCommand?: (command: Command) => void): Promise<{ occurrence: TaskOccurrence; run: MissionRun }> {
    const task = readMockTasks().find((t) => t.task_id === taskId)
    if (!task) throw new RunStartRefused('task not found', 404)
    if (task.status !== 'enabled') throw new RunStartRefused(`task is ${task.status}; only an enabled task can be run`, 409)
    if (!task.robot_id) throw new RunStartRefused('task has no robot assigned', 409)
    const mission = readMockMissions().find((m) => m.mission_id === task.mission_id)
    if (!mission) throw new RunStartRefused('mission not found', 404)
    const stamp = new Date().toISOString().slice(0, 19)
    const occurrence_id = `${taskId}-${stamp.replace(/[-:]/g, '')}Z`
    const all = readMockOccurrences()
    if (all.some((o) => o.occurrence_id === occurrence_id && o.run_id)) throw new RunStartRefused(`run ${occurrence_id} already exists`, 409)
    const run = this.beginRun(task.robot_id, {
      mission, steps, source: 'run_now',
      ...(task.max_duration_min ? { maxDurationS: task.max_duration_min * 60 } : {}),
    }, occurrence_id)
    const occurrence: TaskOccurrence = {
      occurrence_id, task_id: taskId, mission_id: task.mission_id, site_id: task.site_id, robot_id: task.robot_id,
      due_at: `${stamp}Z`, status: 'running', run_id: run.run_id, skip_reason: null,
      message: 'Run-now: started on the robot.',
    }
    writeMockOccurrences([...all.filter((o) => o.occurrence_id !== occurrence_id), occurrence])
    onCommand?.(startedCommand(run))
    return { occurrence, run }
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

/** A mission stored by a console that predates `kind` and `version`: a program
 * iff it has `program_state` (the rule the backend's migration applies), and
 * version 1. Without this its `version` is undefined, and the first save would
 * compare undefined to undefined and then write NaN. */
function withKindAndVersion(m: MissionLibraryEntry): MissionLibraryEntry {
  return { ...m, kind: m.kind ?? (m.program_state ? 'program' : 'route'), version: m.version ?? 1 }
}

function readMockMissions(): MissionLibraryEntry[] {
  try {
    const raw = localStorage.getItem(MOCK_MISSIONS_KEY)
    if (raw) return (JSON.parse(raw) as MissionLibraryEntry[]).map(withKindAndVersion)
  } catch { /* fall back to the sample library */ }
  return mockMissionLibrary.map((m) => ({ ...m, site_id: m.site_id ?? 'site-north-yard' }))
}

function writeMockMissions(missions: MissionLibraryEntry[]): void {
  try { localStorage.setItem(MOCK_MISSIONS_KEY, JSON.stringify(missions)) } catch { /* per-viewer only */ }
}

const MOCK_TASKS_KEY = 'rh.mock.tasks'
const MOCK_OCCURRENCES_KEY = 'rh.mock.occurrences'

function readMockTasks(): MissionTask[] {
  try {
    const raw = localStorage.getItem(MOCK_TASKS_KEY)
    if (raw) return JSON.parse(raw) as MissionTask[]
  } catch { /* fall back to the sample tasks */ }
  return mockTaskLibrary.map((t) => ({ ...t }))
}

function writeMockTasks(tasks: MissionTask[]): void {
  try { localStorage.setItem(MOCK_TASKS_KEY, JSON.stringify(tasks)) } catch { /* per-viewer only */ }
}

function readMockOccurrences(): TaskOccurrence[] {
  try {
    const raw = localStorage.getItem(MOCK_OCCURRENCES_KEY)
    if (raw) return JSON.parse(raw) as TaskOccurrence[]
  } catch { /* none queued */ }
  return []
}

function writeMockOccurrences(occurrences: TaskOccurrence[]): void {
  try { localStorage.setItem(MOCK_OCCURRENCES_KEY, JSON.stringify(occurrences)) } catch { /* per-viewer only */ }
}
