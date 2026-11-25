import { useEffect, useRef, useState } from 'react'
import { ScanEye, EyeOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { color, font, radius, space } from '@/design-system/tokens'
import { DisabledReasonButton } from '@/components/common/DisabledReason'
import { CommandFace, commandButtonStyle, type CommandTone } from '../mission/ActionButton'
import { BarCard } from './BarCard'
import { usePerceptionStatus } from './usePerceptionStatus'
import {
  checkboxParams, detectionButton, detectionMenu, detectionView, switchParams, withNeeds,
  type DetectionSetting,
} from '@/liveops/detection'
import { DETECTOR_IDS, type DetectorId, type RobotState, type SetDetectionParams } from '@/types'
import type { RobotRunView } from '@/liveops/robotRun'

/** How long a sent setting is shown as the robot's while perception restarts
 * into it. Past this the robot's own report wins again, whatever it says. */
const PENDING_MS = 30_000

const LABEL_KEY: Record<DetectorId, 'people' | 'poses' | 'falls'> = {
  'base.person': 'people', 'base.pose': 'poses', 'base.fall': 'falls',
}
const NEEDS_KEY: Partial<Record<DetectorId, 'posesNeed' | 'fallsNeed'>> = {
  'base.pose': 'posesNeed', 'base.fall': 'fallsNeed',
}

function sameSetting(a: DetectionSetting, b: SetDetectionParams): boolean {
  const chosen = withNeeds(b.detectors ?? DETECTOR_IDS)
  return a.enabled === b.enabled && a.selected.length === chosen.length && a.selected.every((id, i) => id === chosen[i])
}

/**
 * The "AI" button on the LiveOps command bar and its menu (schema 0.0.31,
 * option A of 2026-11-25): an on/off switch and a box per detector -- People,
 * Poses, Falls -- sent as SET_DETECTION. Works while a mission runs.
 *
 * The robot answers on its retained perception/status, not in the ack:
 * perception restarts into the new setting a few seconds later. Until it does
 * (or PENDING_MS passes), the menu shows what was sent and says it is being
 * applied, so a click is never visibly undone by a status that predates it.
 *
 * Inside the touch dock's "..." sheet a click anywhere closes the sheet; this
 * control keeps its own clicks from reaching it, or opening the menu would
 * close it at once.
 */
export function DetectionButton({
  robot, run, onSend,
}: {
  robot: RobotState
  run?: RobotRunView
  onSend: (params: SetDetectionParams, label: string) => void
}) {
  const { t } = useTranslation()
  const status = usePerceptionStatus(robot.robot_id)
  const button = detectionButton(robot, status, run)
  const view = detectionView(status)
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState<{ params: SetDetectionParams; at: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)

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

  const noSwitch = button.kind === 'notInstalled' || button.kind === 'olderRobot'
  const setting: DetectionSetting | null = pending
    ? { enabled: pending.params.enabled, selected: withNeeds(pending.params.detectors ?? DETECTOR_IDS) }
    : button.setting
  const menu = pending && setting ? { switchOn: setting.enabled, checked: checkedOf(setting) } : detectionMenu(view)

  function send(params: SetDetectionParams, label: string) {
    setPending({ params, at: Date.now() })
    onSend(params, label)
  }

  // The face: what the robot is doing, or what was just asked of it.
  const showOn = setting ? setting.enabled && button.kind !== 'survey' : false
  const count = setting?.selected.length ?? 0
  let label: string
  let tone: CommandTone = 'default'
  if (noSwitch) label = t('command.detection.label')
  else if (button.kind === 'survey') label = t('command.detection.offSurvey')
  else if (showOn) {
    label = t('command.detection.on', { count })
    tone = button.kind === 'unavailable' && !pending ? 'amber' : 'green'
  } else label = t('command.detection.off')

  const reason = noSwitch
    ? t(button.kind === 'notInstalled' ? 'command.detection.notInstalled' : 'command.detection.olderRobot')
    : button.reason

  let meta: string
  if (pending) meta = t('command.detection.applying')
  else if (view.kind === 'on') meta = status?.fps != null ? t('command.detection.runningFps', { fps: status.fps.toFixed(1) }) : t('command.detection.running')
  else if (view.kind === 'unavailable') meta = view.reason ?? t('command.detection.unavailable')
  else if (view.kind === 'survey') meta = t('command.detection.surveyHold')
  else meta = t('command.detection.offMeta')

  return (
    <div ref={ref} onClick={(e) => e.stopPropagation()}>
      <DisabledReasonButton
        enabled={!noSwitch}
        reason={reason}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={noSwitch ? reason : meta}
        style={{ ...commandButtonStyle(tone), cursor: noSwitch ? 'not-allowed' : 'pointer' }}
      >
        <CommandFace icon={showOn ? ScanEye : EyeOff} label={label} />
      </DisabledReasonButton>

      {setting && menu && (
        <BarCard open={open} onClose={() => setOpen(false)} anchorRef={ref} width={264}
          style={{ padding: space[3], display: 'flex', flexDirection: 'column', gap: space[3] }}>
          <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: space[3] }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1 }}>
                  {t('command.detection.title')}
                </div>
                <div style={{ fontSize: font.size.sm, color: color.t3 }}>{meta}</div>
              </div>
              <DetectionSwitch
                on={menu.switchOn}
                enabled={button.enabled}
                reason={button.reason}
                label={menu.switchOn ? t('command.detection.switchOff') : t('command.detection.switchOn')}
                onChange={(on) => send(switchParams(setting, on), t(on ? 'command.detection.onCommand' : 'command.detection.offCommand'))}
              />
            </div>

            <div role="group" aria-label={t('command.detection.detectors')} style={{ display: 'flex', flexDirection: 'column', gap: space[1] }}>
              {DETECTOR_IDS.map((id) => {
                const needs = NEEDS_KEY[id]
                return (
                  <label key={id} style={{
                    display: 'flex', alignItems: 'center', gap: space[2], padding: `${space[1] + 2}px ${space[2]}px`,
                    borderRadius: radius.sm, fontSize: font.size.md, color: button.enabled ? color.t1 : color.t3,
                    cursor: button.enabled ? 'pointer' : 'not-allowed',
                  }}>
                    <input
                      type="checkbox"
                      checked={menu.checked[id]}
                      disabled={!button.enabled}
                      onChange={() => send(checkboxParams(setting, id), t('command.detection.command'))}
                      style={{ width: 16, height: 16, margin: 0, accentColor: color.accentSolid }}
                    />
                    <span>{t(`command.detection.${LABEL_KEY[id]}`)}</span>
                    {needs && (
                      <span style={{ marginLeft: 'auto', fontSize: font.size.xs, color: color.t3 }}>
                        {t(`command.detection.${needs}`)}
                      </span>
                    )}
                  </label>
                )
              })}
            </div>

            <div style={{ fontSize: font.size.xs, color: color.t3 }}>
              {button.kind === 'survey' ? t('command.detection.surveyFoot') : t('command.detection.foot')}
            </div>
          </div>
        </BarCard>
      )}
    </div>
  )
}

function checkedOf(setting: DetectionSetting): Record<DetectorId, boolean> {
  return Object.fromEntries(DETECTOR_IDS.map((id) => [id, setting.selected.includes(id)])) as Record<DetectorId, boolean>
}

/** A track-and-thumb switch, drawn like Data › Surveys' ShowSwitch. */
function DetectionSwitch({ on, enabled, reason, label, onChange }: {
  on: boolean; enabled: boolean; reason?: string; label: string; onChange: (on: boolean) => void
}) {
  return (
    <button
      type="button" role="switch" aria-checked={on} aria-label={label}
      title={enabled ? label : reason}
      disabled={!enabled}
      onClick={() => onChange(!on)}
      style={{
        width: 36, height: 20, borderRadius: 10, flexShrink: 0, position: 'relative', border: 'none', padding: 0,
        cursor: enabled ? 'pointer' : 'not-allowed', opacity: enabled ? 1 : 0.5,
        background: on ? color.green : color.t4, transition: 'background 0.15s',
      }}
    >
      <span aria-hidden style={{
        position: 'absolute', top: 2, left: on ? 18 : 2, width: 16, height: 16, borderRadius: '50%',
        background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.3)', transition: 'left 0.15s',
      }} />
    </button>
  )
}
