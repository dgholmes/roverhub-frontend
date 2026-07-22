import type { RobotState, Command, CommandType, TimelineEvent } from '@/types'
import { COMMAND_STAGE_ORDER } from '@/types/commands'
import { initialRobots } from './mockRobots'
import { nextEventId } from './mockEvents'

/**
 * Stands in for the real MQTT-over-WS client. Exposes the same subscribe/
 * dispatch shape a real transport would, so swapping to the real backend later
 * is a provider swap rather than a component rewrite.
 */

type TelemetryListener = (robots: RobotState[]) => void
type EventListener = (event: TimelineEvent) => void
type CommandListener = (command: Command) => void

class MockDataProvider {
  private robots: RobotState[] = initialRobots.map(r => ({ ...r }))
  private telemetryListeners = new Set<TelemetryListener>()
  private eventListeners = new Set<EventListener>()
  private tickHandle: ReturnType<typeof setInterval> | null = null
  private lastDriveAt = new Map<string, number>()

  getRobots(): RobotState[] {
    return this.robots
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
    if (r.abstract_state !== 'AUTO_MISSION') return { ...r, updated_at: now }

    const headingRad = (r.position.heading_deg * Math.PI) / 180
    const dx = Math.cos(headingRad) * r.speed_mps
    const dy = Math.sin(headingRad) * r.speed_mps
    const battery = Math.max(0, r.battery.percent - 0.02)

    return {
      ...r,
      battery: { ...r.battery, percent: Math.round(battery * 100) / 100 },
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
  driveRobot(robotId: string, vx: number, vy: number, vyaw: number) {
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

  /** Mock counterpart to RealDataProvider.uploadAudioClip -- there's no real
   * filesystem/backend to save to in mock mode, so this fabricates a
   * plausible-looking path. Harmless: mockDataProvider.dispatchCommand
   * already fully simulates the ack lifecycle regardless of what's in
   * `params`, so nothing downstream actually reads this path off disk. */
  async uploadAudioClip(robotId: string, file: File): Promise<{ file_path: string }> {
    return { file_path: `mock://audio-clips/${robotId}/${Date.now()}-${file.name}` }
  }
}

export const mockDataProvider = new MockDataProvider()
