import { useRef, useState } from 'react'
import { ScanEye, EyeOff, ChevronUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { color, font, space } from '@/design-system/tokens'
import { DisabledReasonButton } from '@/components/common/DisabledReason'
import { CommandFace, commandButtonStyle, type CommandTone } from '../mission/ActionButton'
import { switchParams } from '@/liveops/detection'
import type { RobotState, SetDetectionParams } from '@/types'
import type { RobotRunView } from '@/liveops/robotRun'
import { BarCard } from './BarCard'
import { DetectionPanelBody, DetectionPanelSwitch } from './DetectionPanel'
import { ShowDetectionsRow } from './ShowDetectionsRow'
import { useDetectionControl } from './useDetectionControl'

/**
 * The "AI" toggle on the LiveOps command bar (schema 0.0.31, option B of
 * 2026-11-25): one click switches AI detection on or off, like Avoidance.
 * Works while a mission runs. Switching keeps whichever detectors were chosen.
 *
 * The chevron beside it opens the AI detection card (2026-11-26, the operator
 * wanted it on LiveOps as well as on Fleet): the switch, the status, and a line
 * per detector to choose it. It is the same DetectionPanel that Fleet › robot
 * draws, fed by this toggle's own control, so a change made in the card shows
 * as "applying" on the toggle too. A robot without perception has no chevron.
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
  const control = useDetectionControl(robot, onSend, run)
  const { status, button, setting, pending, meta, send } = control
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const noSwitch = button.kind === 'notInstalled' || button.kind === 'olderRobot'
  const on = setting?.enabled ?? false
  const showOn = on && button.kind !== 'survey'
  const hasCard = status != null

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

  const base = commandButtonStyle(tone)
  return (
    // Inside the touch dock's "..." sheet a click anywhere closes the sheet;
    // clicks in the card (a portal) bubble here through React too.
    <div ref={ref} onClick={(e) => e.stopPropagation()} style={{ display: 'inline-flex', flexShrink: 0 }}>
      <DisabledReasonButton
        enabled={button.enabled}
        reason={button.reason ?? meta}
        onClick={() => {
          if (!setting) return
          send(switchParams(setting, !on), t(on ? 'command.detection.offCommand' : 'command.detection.onCommand'))
        }}
        aria-pressed={noSwitch ? undefined : on}
        title={title}
        style={{
          ...base, cursor: button.enabled ? 'pointer' : 'not-allowed',
          ...(hasCard && { borderTopRightRadius: 0, borderBottomRightRadius: 0 }),
        }}
      >
        <CommandFace icon={showOn ? ScanEye : EyeOff} label={label} />
      </DisabledReasonButton>

      {hasCard && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-label={t('command.detection.openCard')}
          title={t('command.detection.openCard')}
          style={{
            ...base, padding: '0 6px', marginLeft: -1, cursor: 'pointer',
            borderTopLeftRadius: 0, borderBottomLeftRadius: 0,
            ...(open && tone === 'default' && { background: color.cardHover }),
          }}
        >
          <ChevronUp size={14} strokeWidth={2} aria-hidden
            style={{ transform: open ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
        </button>
      )}

      {hasCard && (
        <BarCard open={open} onClose={() => setOpen(false)} anchorRef={ref} width={300}
          style={{ padding: space[3] }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[3] }}>
            <span style={{ flex: 1, fontSize: font.size.md, fontWeight: font.weight.bold, color: color.t1 }}>
              {t('command.detection.title')}
            </span>
            <DetectionPanelSwitch control={control} />
          </div>
          <DetectionPanelBody control={control} />
          <ShowDetectionsRow robotId={robot.robot_id} />
        </BarCard>
      )}
    </div>
  )
}
