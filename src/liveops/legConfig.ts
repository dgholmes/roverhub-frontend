import type { LegConfig, RobotState } from '@/types'

/** The bridge's reading of the leg configuration (leg_config_detector.py).
 *
 * The SDK's CHANGE_MODE is a blind toggle; this reading is the only way to
 * know which way it went. A bridge older than schema 0.0.12 never sends it,
 * and that is 'unknown' -- never 'normal'. Nothing may aim a switch at a
 * configuration while it is unknown. */
export function legConfigOf(robot: RobotState): LegConfig {
  return robot.leg_config ?? 'unknown'
}

/** The switch control names its target only when the reading says where the
 * legs are now; otherwise it stays an honest toggle. */
export function switchLegLabelKey(config: LegConfig) {
  return config === 'normal' ? 'command.taskBar.switchToX' as const
    : config === 'x' ? 'command.taskBar.switchToNormal' as const
    : 'command.taskBar.switchLegConfig' as const
}

export function switchLegBodyKey(config: LegConfig) {
  return config === 'unknown' ? 'command.taskBar.switchLegBody' as const : 'command.taskBar.switchLegBodyKnown' as const
}

export function legConfigLabelKey(config: LegConfig) {
  return config === 'normal' ? 'liveops.telemetry.legsNormal' as const
    : config === 'x' ? 'liveops.telemetry.legsX' as const
    : 'common.unknown' as const
}
