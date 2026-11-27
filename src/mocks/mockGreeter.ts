/**
 * The mock bridge's greeter (schema 0.0.36), so the Greet tab, Greeter mode's
 * panel and its status chip can be seen and exercised with
 * VITE_USE_REAL_BACKEND=false. Nothing here reaches a robot.
 *
 * Every mock robot has a greeter except the wheel one (zaezae-x1-003), which
 * plays a bridge older than 0.0.36 so "Update the robot to use this" is
 * visible too.
 */
import { clampField, isGreetDance } from '@/liveops/greeter'
import { GREET_STANDING_SDK_STATES } from '@/liveops/commandPolicy'
import { DEFAULT_GREETER_SETTING, type GreeterSetting, type GreeterStatus, type RobotState } from '@/types'

/** The mock robot playing an older bridge. */
export const MOCK_ROBOT_WITHOUT_GREETER = 'zaezae-x1-003'

const STANDING = new Set<RobotState['abstract_state']>(['STAND', 'MANUAL', 'ASSISTED'])

/** What the robot's greeter would say about itself in this state. */
export function mockGreeterPhase(robot: RobotState, enabled: boolean): Pick<GreeterStatus, 'phase' | 'blocked_reason'> {
  if (!enabled) return { phase: 'off', blocked_reason: null }
  const blocked = (reason: string) => ({ phase: 'blocked' as const, blocked_reason: reason })
  if (robot.abstract_state === 'E_STOP') return blocked('estop')
  if (robot.active_run != null || robot.abstract_state === 'AUTO_MISSION') return blocked('mission_running')
  if (!STANDING.has(robot.abstract_state)) return blocked('lying_down')
  if (robot.control_owner != null) return blocked('operator_control')
  if (robot.battery.percent != null && robot.battery.percent < DEFAULT_GREETER_SETTING.min_battery_pct) return blocked('battery')
  return { phase: 'watching', blocked_reason: null }
}

/** The greeter a mock robot starts with: on (so Watching and Blocked are both
 * on show) for every robot except the one playing an old bridge. */
export function mockInitialGreeter(robot: RobotState): GreeterStatus | null {
  if (robot.robot_id === MOCK_ROBOT_WITHOUT_GREETER) return null
  const enabled = robot.abstract_state !== 'PASSIVE'
  return {
    enabled,
    ...mockGreeterPhase(robot, enabled),
    last_greeted_at: enabled ? new Date(Date.now() - 42 * 60_000).toISOString() : null,
    greetings_today: enabled ? 7 : 0,
    setting: { ...DEFAULT_GREETER_SETTING, enabled, clip_id: enabled ? 'mock-greeting' : null },
  }
}

/** Why the mock bridge refuses GREET or SET_GREETER, or null. */
export function mockGreeterRefusal(robot: RobotState | undefined, type: string, params: Record<string, unknown> | undefined): string | null {
  if (type !== 'GREET' && type !== 'SET_GREETER') return null
  if (!robot) return 'REJECTED_NO_CONNECTION: no such robot'
  if (!robot.greeter) return 'REJECTED_GREETER_UNAVAILABLE: this bridge has no greeter (older than 0.0.36)'
  if (type === 'SET_GREETER') {
    return typeof params?.enabled === 'boolean' ? null : 'REJECTED_INVALID_PARAMS: enabled is required'
  }
  if (params?.dance != null && !isGreetDance(params.dance)) return 'REJECTED_INVALID_PARAMS: not a greeting dance'
  if (!GREET_STANDING_SDK_STATES.has(robot.sdk_state)) return 'REJECTED_NOT_STANDING: stand the robot up first'
  if (robot.active_run != null) return 'REJECTED_RUN_ACTIVE: a mission is running'
  return null
}

/** The greeter once GREET has finished: one more greeting today. */
export function mockAfterGreet(status: GreeterStatus, now = new Date()): GreeterStatus {
  return { ...status, last_greeted_at: now.toISOString(), greetings_today: status.greetings_today + 1 }
}

/** The greeter once SET_GREETER has been applied, as the robot would report it. */
export function mockAfterSetGreeter(robot: RobotState, params: Record<string, unknown>): GreeterStatus | null {
  const status = robot.greeter
  if (!status) return null
  const n = (k: keyof typeof DEFAULT_GREETER_SETTING & ('trigger_distance_m' | 'facing_distance_m' | 'dance_min_distance_m' | 'cooldown_s' | 'min_battery_pct')) =>
    typeof params[k] === 'number' ? clampField(k, params[k] as number) : DEFAULT_GREETER_SETTING[k]
  const setting: GreeterSetting = {
    enabled: params.enabled === true,
    clip_id: typeof params.clip_id === 'string' ? params.clip_id : null,
    dance: params.dance === null ? null : isGreetDance(params.dance) ? params.dance : DEFAULT_GREETER_SETTING.dance,
    trigger_distance_m: n('trigger_distance_m'),
    facing_distance_m: n('facing_distance_m'),
    dance_min_distance_m: n('dance_min_distance_m'),
    cooldown_s: n('cooldown_s'),
    min_battery_pct: n('min_battery_pct'),
    greet_on_wave: typeof params.greet_on_wave === 'boolean' ? params.greet_on_wave : DEFAULT_GREETER_SETTING.greet_on_wave,
  }
  return { ...status, enabled: setting.enabled, ...mockGreeterPhase(robot, setting.enabled), setting }
}
