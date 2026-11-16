import i18n from '@/i18n'
import type { CommandOutcome } from '@/store/useLiveOpsStore'
import type { FindMovingParams } from '@/types/survey'
import type { CalibrationMode, SetLidarMountParams } from '@/types/sensors'

/**
 * The three commands Systems › Sensors and the map editor send (schema
 * 0.0.23), through the same path as every other command: the store's
 * dispatch, so each gets the command toast and its acks, and the mock walks
 * them like the bridge would. Each resolves once the command reaches a
 * terminal stage; `unknown` is a command the robot never answered in time.
 *
 * The store is imported when a command is sent, not with this module, so the
 * pages that import these do not build the store (and its provider) just by
 * being imported -- their tests mock the provider with only what they read.
 */

async function dispatch(robotId: string, type: 'SET_LIDAR_MOUNT' | 'SET_CALIBRATION_MODE' | 'FIND_MOVING', label: string,
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
