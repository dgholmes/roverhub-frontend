import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  detectionButton, detectionView, withNeeds,
  type DetectionButton, type DetectionSetting, type DetectionView,
} from '@/liveops/detection'
import { DETECTOR_IDS, type PerceptionStatus, type RobotState, type SetDetectionParams } from '@/types'
import type { RobotRunView } from '@/liveops/robotRun'
import { usePerceptionStatus } from './usePerceptionStatus'

/** How long a sent setting is shown as the robot's while perception restarts
 * into it. Past this the robot's own report wins again, whatever it says. */
const PENDING_MS = 30_000

function sameSetting(a: DetectionSetting, b: SetDetectionParams): boolean {
  const chosen = withNeeds(b.detectors ?? DETECTOR_IDS)
  return a.enabled === b.enabled && a.selected.length === chosen.length && a.selected.every((id, i) => id === chosen[i])
}

export interface DetectionControl {
  status: PerceptionStatus | undefined
  view: DetectionView
  button: DetectionButton
  /** What to show: the setting just sent while it is being applied, else the robot's. */
  setting: DetectionSetting | null
  pending: boolean
  /** One line on what detection is doing ("Running · 9.8 fps", "Applying …"). */
  meta: string
  send: (params: SetDetectionParams, label: string) => void
}

/**
 * The AI detection switch (SET_DETECTION, schema 0.0.31) for one robot, shared
 * by the LiveOps toggle and Fleet's AI detection section.
 *
 * The robot answers on its retained perception/status, not in the ack:
 * perception restarts into the new setting a few seconds later. Until it does
 * (or PENDING_MS passes), `setting` is what was sent, so a click is never
 * visibly undone by a status that predates it.
 */
export function useDetectionControl(
  robot: RobotState,
  onSend: (params: SetDetectionParams, label: string) => void,
  run?: RobotRunView,
): DetectionControl {
  const { t } = useTranslation()
  const status = usePerceptionStatus(robot.robot_id)
  const button = detectionButton(robot, status, run)
  const view = detectionView(status)
  const [pending, setPending] = useState<{ params: SetDetectionParams; at: number } | null>(null)

  // The robot reported the setting that was sent, or it took too long: drop it.
  const reported = button.setting
  useEffect(() => {
    if (!pending) return
    if (reported && sameSetting(reported, pending.params)) {
      setPending(null)
      return
    }
    const left = pending.at + PENDING_MS - Date.now()
    const timer = setTimeout(() => setPending(null), Math.max(0, left))
    return () => clearTimeout(timer)
  }, [pending, reported])

  const setting: DetectionSetting | null = pending && button.setting
    ? { enabled: pending.params.enabled, selected: withNeeds(pending.params.detectors ?? DETECTOR_IDS) }
    : button.setting

  let meta: string
  if (pending) meta = t('command.detection.applying')
  else if (view.kind === 'on') meta = status?.fps != null ? t('command.detection.runningFps', { fps: status.fps.toFixed(1) }) : t('command.detection.running')
  else if (view.kind === 'unavailable') meta = view.reason ?? t('command.detection.unavailable')
  else if (view.kind === 'survey') meta = t('command.detection.surveyHold')
  else if (view.kind === 'off') meta = t('command.detection.offMeta')
  else meta = t(view.kind === 'notInstalled' ? 'command.detection.notInstalled' : 'command.detection.olderRobot')

  return {
    status, view, button, setting, pending: pending != null, meta,
    send: (params, label) => {
      setPending({ params, at: Date.now() })
      onSend(params, label)
    },
  }
}
