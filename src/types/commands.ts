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
  | 'RESET_ESTOP'
  | 'TAKE_CONTROL'
  | 'RELEASE_CONTROL'
  | 'SET_GAIT'
  | 'SET_OBSTACLE_AVOIDANCE'
  /** Flashes the robot's indicator lights (SDK-confirmed real capability —
   * LedsCmd/LEDControl, named lights like leg_light1-4/fill_light1/3, RGB +
   * brightness — LIVEOPS_AUDIT_TRACKER.md H.2). Non-motion operator action,
   * same tier as SNAPSHOT/SPEAK. */
  | 'LED_SIGNAL'
  /** Teleoperation velocity bursts (docs/01-prd.md §16.3: its own "low-latency
   * path" command class) never go through dispatchCommand's staged-ack
   * pipeline — see useLiveOpsStore.driveRobot. This entry exists only so
   * commandPolicy has a single source of truth for whether driving is
   * currently allowed. */
  | 'DRIVE'
  /** High-level SDK command surface wired for real by the edge/backend side
   * of the "Full High-Level SDK Command Expansion" plan (shared/schemas/commands.py
   * is the source of truth for this list) -- state/mode/speed, canned movement
   * routines, and balance/pose primitives. */
  | 'SET_STATE'
  | 'CHANGE_MODE'
  | 'SET_SPEED_RATIO'
  | 'VELOCITY_SEQUENCE'
  | 'LINE_WALK'
  | 'ROTATE'
  | 'CIRCLE'
  | 'BALANCE_AXIS'
  | 'BALANCE_NEUTRAL'
  | 'BALANCE_SEQUENCE'
  | 'DYNAMIC_POSE'
  | 'STATIC_POSE'

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
