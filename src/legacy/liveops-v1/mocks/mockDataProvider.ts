import type { RobotState, Command, CommandType, TimelineEvent } from '@/legacy/liveops-v1/types'
import { COMMAND_STAGE_ORDER } from '@/legacy/liveops-v1/types/commands'
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
  dispatchCommand(robotId: string, type: CommandType, label: string, onUpdate: CommandListener): Command {
    const commandId = `cmd-${Math.random().toString(16).slice(2, 10)}`
    const now = () => new Date().toISOString()

    const command: Command = {
      command_id: commandId,
      robot_id: robotId,
      type,
      label,
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

  private emitEvent(evt: TimelineEvent) {
    this.eventListeners.forEach(l => l(evt))
  }
}

export const mockDataProvider = new MockDataProvider()
