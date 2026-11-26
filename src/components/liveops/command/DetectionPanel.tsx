import { useTranslation } from 'react-i18next'
import { KeyValue } from '@/components/kit'
import { color, font, radius, space } from '@/design-system/tokens'
import { formatAge } from '@/fleet/bridgeHealth'
import { checkboxParams, detectorRows, switchParams, type DetectorRow } from '@/liveops/detection'
import type { DetectorId } from '@/types'
import { Muted, Note } from '@/components/fleet/v2/parts'
import { DetectionSwitch } from './DetectionSwitch'
import type { DetectionControl } from './useDetectionControl'

const LABEL_KEY: Record<DetectorId, 'people' | 'poses' | 'falls'> = {
  'base.person': 'people', 'base.pose': 'poses', 'base.fall': 'falls',
}
const NEEDS_KEY: Partial<Record<DetectorId, 'posesNeed' | 'fallsNeed'>> = {
  'base.pose': 'posesNeed', 'base.fall': 'fallsNeed',
}

const STATE_COLOR: Record<DetectorRow['state'], string> = {
  running: color.green, slow: color.amber, failed: color.red, off: color.t3, notReported: color.t3,
}

/*
 * The AI detection card's parts (schema 0.0.31), shared by Fleet › robot ›
 * the Sensors tab (DetectionSection) and the card the LiveOps "AI" button's chevron
 * opens (DetectionButton), so the two cannot drift apart. Both take the same
 * `useDetectionControl` result their caller holds: on LiveOps that is the
 * toggle's own, so a click in the card and on the toggle share one "applying"
 * state.
 */

/** The on/off switch for a heading, or nothing for a robot too old to switch. */
export function DetectionPanelSwitch({ control }: { control: DetectionControl }) {
  const { t } = useTranslation()
  const { setting, button, send } = control
  if (!setting) return null
  return (
    <DetectionSwitch
      on={setting.enabled}
      enabled={button.enabled}
      reason={button.reason}
      label={setting.enabled ? t('command.detection.switchOff') : t('command.detection.switchOn')}
      onChange={(on) => send(switchParams(setting, on), t(on ? 'command.detection.onCommand' : 'command.detection.offCommand'))}
    />
  )
}

/** Status, camera and last report; a line per detector with its model and
 * frame rate, ticked to choose it; and a note. Everything shown comes from the
 * robot's retained perception/status. */
export function DetectionPanelBody({ control }: { control: DetectionControl }) {
  const { t } = useTranslation()
  const { status, view, button, setting, pending, meta, send } = control

  if (!status) return <Muted>{t('command.detection.notInstalled')}</Muted>

  const canSend = button.enabled && setting != null
  const rows = detectorRows(status, setting)
  // A robot whose software predates the switch still reports its models; say
  // whether they run, and leave the switch out.
  const statusText = setting ? meta
    : status.source_state === 'live' && status.fps != null ? t('command.detection.runningFps', { fps: status.fps.toFixed(1) })
    : status.source_state === 'live' ? t('command.detection.running') : t('command.detection.noFrames')
  const live = setting ? view.kind === 'on' : status.source_state === 'live'
  const metaColor = pending ? color.t2 : live ? color.green : view.kind === 'unavailable' ? color.amber : color.t2

  return (
    <>
      <KeyValue rows={[
        { label: t('command.detection.status'), value: <span style={{ color: metaColor }}>{statusText}</span> },
        {
          label: t('command.detection.camera'),
          value: status.source_state === 'live'
            ? status.camera
            : <Muted>{t('command.detection.cameraIdle', { camera: status.camera })}</Muted>,
        },
        { label: t('command.detection.lastReport'), value: formatAge(status.at) },
      ]} />

      <div role="group" aria-label={t('command.detection.detectors')}
        style={{ display: 'flex', flexDirection: 'column', gap: space[1], marginTop: space[3] }}>
        {rows.map((row) => (
          <DetectorLine
            key={row.id}
            row={row}
            canSend={canSend}
            onToggle={() => setting && send(checkboxParams(setting, row.id as DetectorId), t('command.detection.command'))}
          />
        ))}
      </div>

      <Note>
        {!setting ? t('command.detection.olderRobot')
          : view.kind === 'survey' ? t('command.detection.surveyFoot')
          : t('command.detection.foot')}
      </Note>
    </>
  )
}

function DetectorLine({ row, canSend, onToggle }: { row: DetectorRow; canSend: boolean; onToggle: () => void }) {
  const { t } = useTranslation()
  const known = row.known ? (row.id as DetectorId) : null
  const name = known ? t(`command.detection.${LABEL_KEY[known]}`) : row.id
  const needs = known ? NEEDS_KEY[known] : undefined
  const editable = canSend && row.known

  let stat: string
  switch (row.state) {
    case 'running': stat = row.fps != null ? t('command.detection.fps', { fps: row.fps.toFixed(1) }) : t('command.detection.stateRunning'); break
    case 'slow': stat = row.fps != null ? t('command.detection.stateSlowFps', { fps: row.fps.toFixed(1) }) : t('command.detection.stateSlow'); break
    case 'failed': stat = t('command.detection.stateFailed'); break
    case 'notReported': stat = t('command.detection.stateNotReported'); break
    default: stat = t('command.detection.stateOff')
  }
  const detail = [row.version, row.kind === 'derived' ? t('command.detection.derived') : null].filter(Boolean).join(' · ')

  return (
    <label title={row.reason ?? undefined} style={{
      display: 'flex', alignItems: 'center', gap: space[2], padding: `${space[1] + 2}px ${space[2]}px`,
      marginInline: -space[2], borderRadius: radius.sm, fontSize: font.size.md,
      cursor: editable ? 'pointer' : 'default',
    }}>
      {row.known ? (
        <input
          type="checkbox"
          checked={row.chosen}
          disabled={!editable}
          onChange={onToggle}
          style={{ width: 16, height: 16, margin: 0, flexShrink: 0, accentColor: color.accentSolid }}
        />
      ) : (
        <span aria-hidden style={{ width: 16, display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATE_COLOR[row.state] }} />
        </span>
      )}
      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span style={{ color: color.t1 }}>
          {name}
          {needs && <span style={{ marginLeft: space[2], fontSize: font.size.xs, color: color.t3 }}>{t(`command.detection.${needs}`)}</span>}
        </span>
        {detail && <span style={{ fontSize: font.size.xs, color: color.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{detail}</span>}
      </span>
      <span style={{ marginLeft: 'auto', fontSize: font.size.sm, color: STATE_COLOR[row.state], whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        {stat}
      </span>
    </label>
  )
}
