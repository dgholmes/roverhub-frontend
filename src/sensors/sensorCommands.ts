import i18n from '@/i18n'
import type { CommandOutcome } from '@/store/useLiveOpsStore'
import type { FindMovingParams } from '@/types/survey'
import type { CalibrationMode, SetLidarMountParams } from '@/types/sensors'

/**
 * The commands a robot's Sensors tab in Fleet and the map editor send (schema
 * 0.0.23), through the same path as every other command: the store's
 * dispatch, so each gets the command toast and its acks, and the mock walks
 * them like the bridge would. Each resolves once the command reaches a
 * terminal stage; `unknown` is a command the robot never answered in time.
 *
 * The store is imported when a command is sent, not with this module, so the
 * pages that import these do not build the store (and its provider) just by
 * being imported -- their tests mock the provider with only what they read.
 */

async function dispatch(robotId: string, type: 'SET_LIDAR_MOUNT' | 'SET_CALIBRATION_MODE' | 'FIND_MOVING' | 'ROTATE' | 'TAKE_CONTROL', label: string,
  params: Record<string, unknown>): Promise<CommandOutcome> {
  const { useLiveOpsStore } = await import('@/store/useLiveOpsStore')
  return useLiveOpsStore.getState().dispatchCommandAsync(robotId, type, label, params)
}

export function setLidarMount(robotId: string, params: SetLidarMountParams): Promise<CommandOutcome> {
  const label = i18n.t(params.source === 'measured' ? 'sensors.command.applyMeasured' : 'sensors.command.setMount')
  return dispatch(robotId, 'SET_LIDAR_MOUNT', label, { ...params })
}

export function setCalibrationMode(robotId: string, mode: CalibrationMode): Promise<CommandOutcome> {
  const label = i18n.t('sensors.command.setMode', { mode: i18n.t(`sensors.mode.${mode}`) })
  return dispatch(robotId, 'SET_CALIBRATION_MODE', label, { mode })
}

export function findMoving(robotId: string, params: FindMovingParams): Promise<CommandOutcome> {
  const label = i18n.t('missions.maps.editor.findMoving.commandLabel')
  return dispatch(robotId, 'FIND_MOVING', label, { ...params })
}

/** One half turn on the spot for the lidar calibration (Sensors' "turn it
 * for me"): the already-wired ROTATE, as LiveOps and Fleet send it. */
export function calibrationTurn(robotId: string, direction: 'left' | 'right', angle: number, turn: number, of: number): Promise<CommandOutcome> {
  const label = i18n.t('sensors.turns.commandLabel', { turn, of, direction: i18n.t(`sensors.turns.dir.${direction}`) })
  return dispatch(robotId, 'ROTATE', label, { direction, angle })
}

/** Take control, as LiveOps' Take control sends it (it stands a lying robot
 * up first, on the bridge). */
export function takeControl(robotId: string, operator: string): Promise<CommandOutcome> {
  return dispatch(robotId, 'TAKE_CONTROL', i18n.t('command.control.takeCommand'), { operator })
}
