import { ScanEye, EyeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DisabledReasonButton } from '@/components/common/DisabledReason'
import { CommandFace, commandButtonStyle, type CommandTone } from '../mission/ActionButton'
import { switchParams } from '@/liveops/detection'
import type { RobotState, SetDetectionParams } from '@/types'
import type { RobotRunView } from '@/liveops/robotRun'
import { useDetectionControl } from './useDetectionControl'

/**
 * The "AI" toggle on the LiveOps command bar (schema 0.0.31, option B of
 * 2026-11-25): one click switches AI detection on or off, like Avoidance.
 * Works while a mission runs. Which detectors run is chosen on Fleet › robot
 * (DetectionSection); switching here keeps that choice.
 *
 * While a survey holds detection off, a click still changes the setting the
 * robot comes back to; the face says "AI off · survey" until then.
 */
export function DetectionButton({
  robot, run, onSend,
}: {
  robot: RobotState
  run?: RobotRunView
  onSend: (params: SetDetectionParams, label: string) => void
}) {
  const { t } = useTranslation()
  const { button, setting, pending, meta, send } = useDetectionControl(robot, onSend, run)

  const noSwitch = button.kind === 'notInstalled' || button.kind === 'olderRobot'
  const on = setting?.enabled ?? false
  const showOn = on && button.kind !== 'survey'

  let label: string
  let tone: CommandTone = 'default'
  if (noSwitch) label = t('command.detection.label')
  else if (button.kind === 'survey') label = t('command.detection.offSurvey')
  else if (showOn) {
    label = t('command.detection.on')
    tone = button.kind === 'unavailable' && !pending ? 'amber' : 'green'
  } else label = t('command.detection.off')

  const title = noSwitch || !button.enabled
    ? (button.reason ?? meta)
    : `${meta} · ${on ? t('command.detection.switchOff') : t('command.detection.switchOn')}`

  return (
    // Inside the touch dock's "..." sheet a click anywhere closes the sheet.
    <div onClick={(e) => e.stopPropagation()}>
      <DisabledReasonButton
        enabled={button.enabled}
        reason={button.reason ?? meta}
        onClick={() => {
          if (!setting) return
          send(switchParams(setting, !on), t(on ? 'command.detection.offCommand' : 'command.detection.onCommand'))
        }}
        aria-pressed={noSwitch ? undefined : on}
        title={title}
        style={{ ...commandButtonStyle(tone), cursor: button.enabled ? 'pointer' : 'not-allowed' }}
      >
        <CommandFace icon={showOn ? ScanEye : EyeOff} label={label} />
      </DisabledReasonButton>
    </div>
  )
}
