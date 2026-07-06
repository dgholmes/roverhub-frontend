/**
 * PROVISIONAL — shared/schemas/commands.py is currently empty (0 bytes).
 * Mirrors the command lifecycle in docs/05-ui-ux.md §6 and the issue → validate
 * → execute → ack → state change → telemetry update flow in CLAUDE.md.
 */

export type CommandType =
  | 'PAUSE'
  | 'RESUME'
  | 'RETURN'
  | 'DOCK'
  | 'SNAPSHOT'
  | 'SPEAK'
  | 'ESTOP'

export type CommandStage =
  | 'requested'
  | 'cloud_received'
  | 'cloud_validated'
  | 'bridge_received'
  | 'local_safety_check'
  | 'sdk_sent'
  | 'robot_acknowledged'
  | 'execution_started'
  | 'execution_completed'
  | 'execution_failed'
  | 'timed_out'
  | 'cancelled'

export const COMMAND_STAGE_ORDER: CommandStage[] = [
  'requested',
  'cloud_received',
  'cloud_validated',
  'bridge_received',
  'local_safety_check',
  'sdk_sent',
  'robot_acknowledged',
  'execution_started',
  'execution_completed',
]

export interface CommandStageEvent {
  stage: CommandStage
  at: string
}

export interface Command {
  command_id: string
  robot_id: string
  type: CommandType
  label: string
  params?: Record<string, unknown>
  stages: CommandStageEvent[]
  current_stage: CommandStage
  failure_reason?: string
  initiated_by: string
}

/** Blocking reasons a command can be disabled for — surfaced via tooltip per
 * docs/05-ui-ux.md §6.4 and §14, never a silently-hidden control. */
export interface CommandAvailability {
  enabled: boolean
  reason?: string
}
