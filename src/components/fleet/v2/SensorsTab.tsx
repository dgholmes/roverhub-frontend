import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Button, Segmented } from '@/components/kit'
import { formatLocale } from '@/i18n'
import { formatAge } from '@/fleet/bridgeHealth'
import { useCan } from '@/org/useCan'
import { useUserNames } from '@/lib/auth/useUserNames'
import {
  bridgeHasSensors, formToMount, formatMountValue, formatSpread, measuredMount, mountCell, mountRows, mountToForm, sameMount,
  type MountCellTone, type MountFieldError, type MountForm, type MountRow,
} from '@/sensors/lidarMount'
import { barFraction, mountSteps } from '@/sensors/mountSteps'
import { TURN_COUNT } from '@/sensors/turnRunner'
import { setCalibrationMode, setLidarMount } from '@/sensors/sensorCommands'
import { useLidarMounts } from '@/sensors/useLidarMounts'
import type { CommandOutcome } from '@/store/useLiveOpsStore'
import type { RobotState } from '@/types'
import {
  CALIBRATION_MODES, MOUNT_BOUNDS, type CalibrationMode, type LidarMount, type LidarMountChange, type LidarMountStatus,
} from '@/types/sensors'
import { CalibrationTurns } from './CalibrationTurns'
import { CountBar, STEP_INDENT, Step, StepActions, StepText } from './sensorsParts'

/** The form's fields, in the order the table shows them. */
const FIELDS: { field: keyof LidarMount; row: MountRow['key']; unit: 'm' | 'deg' }[] = [
  { field: 'x_m', row: 'forward', unit: 'm' },
  { field: 'y_m', row: 'left', unit: 'm' },
  { field: 'z_m', row: 'height', unit: 'm' },
  { field: 'pitch_deg', row: 'pitch', unit: 'deg' },
  { field: 'roll_deg', row: 'roll', unit: 'deg' },
  { field: 'yaw_deg', row: 'yaw', unit: 'deg' },
]

/** What the tab shows after a command: nothing, sending, or how it ended. */
type Sent =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'done'; what: 'mount' | 'mode'; mode?: CalibrationMode }
  | { kind: 'failed'; reason: string }
  | { kind: 'unknown' }

/** In-page panels: one at a time, so a confirmation is never off-screen. */
type Panel =
  | { kind: 'none' }
  | { kind: 'apply'; part: 'tilt' | 'offset'; mount: LidarMount }
  | { kind: 'edit'; form: MountForm; tried: boolean }
  | { kind: 'revert'; change: LidarMountChange }

function sentFrom(outcome: CommandOutcome, what: 'mount' | 'mode', mode?: CalibrationMode): Sent {
  if (outcome.result === 'completed') return { kind: 'done', what, mode }
  if (outcome.result === 'unknown') return { kind: 'unknown' }
  // Verbatim: the bridge's own reason (it refuses while the robot moves,
  // walks or surveys) and the backend's are what the engineer needs.
  return { kind: 'failed', reason: outcome.command.failure_reason ?? outcome.result }
}

const dateText = (iso: string | null | undefined) => {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isNaN(t) ? '' : new Date(t).toLocaleDateString(formatLocale(), { day: 'numeric', month: 'short' })
}
const dateTimeText = (iso: string) => {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? iso : new Date(t).toLocaleString(formatLocale(), { dateStyle: 'medium', timeStyle: 'short' })
}

/**
 * Fleet › a robot › Sensors: where the robot's lidar sits (schema 0.0.23;
 * turn counts and refusals 0.0.25), as three steps -- the operator's choice A
 * of 2026-11-18 -- with "turn it for me" (choice C) in step 2. The value
 * table, the mode (Off, Suggest, Auto) and the history stand beside the steps.
 * Every change asks first, in the tab, because moving the lidar's pose moves
 * where the robot thinks it is.
 *
 * Engineers change it (`configure`); everyone else reads it. A bridge older
 * than 0.0.23 neither reports it nor understands the commands, so it gets a
 * plain note instead.
 *
 * The inspector names the robot, so there is no picker. It keeps this tab
 * mounted when another robot is picked in the roster: the statuses are heard
 * here, for every robot, and everything about one robot -- an open form or
 * question, the last command's result, a turn run -- starts over with the next.
 */
export function SensorsTab({ robot }: { robot: RobotState }) {
  const mounts = useLidarMounts()
  return <RobotSensors key={robot.robot_id} robot={robot} status={mounts[robot.robot_id] ?? null} />
}

function RobotSensors({ robot, status }: { robot: RobotState; status: LidarMountStatus | null }) {
  const { t } = useTranslation()
  const canConfigure = useCan('configure')
  const robotId = robot.robot_id
  const robotName = robot.name
  const [panel, setPanel] = useState<Panel>({ kind: 'none' })
  const [sent, setSent] = useState<Sent>({ kind: 'idle' })

  const schema = robot.bridge?.schema_version ?? null
  const supported = bridgeHasSensors(schema)
  const busy = sent.kind === 'sending'
  const online = robot.connectivity.bridge_state === 'connected'
  const canChange = canConfigure && supported && !!status && online

  const send = async (run: () => Promise<CommandOutcome>, what: 'mount' | 'mode', mode?: CalibrationMode) => {
    setSent({ kind: 'sending' })
    setPanel({ kind: 'none' })
    setSent(sentFrom(await run(), what, mode))
  }
  const sendMount = (mount: LidarMount, source: 'manual' | 'measured') => {
    void send(() => setLidarMount(robotId, { mount, source }), 'mount')
  }
  const sendMode = (mode: CalibrationMode) => {
    if (status && mode !== status.mode) void send(() => setCalibrationMode(robotId, mode), 'mode', mode)
  }

  const header = (
    <div style={{ padding: `${space[4]}px ${space[5]}px ${space[3]}px` }}>
      <h3 style={{ margin: 0, fontSize: font.size.lg, fontWeight: font.weight.semibold, color: color.t1 }}>{t('sensors.lidarMount')}</h3>
    </div>
  )

  let body: React.ReactNode
  if (!supported) {
    body = (
      <Note>{schema ? t('sensors.oldBridge', { robot: robotName, version: schema }) : t('sensors.oldBridgeUnknown', { robot: robotName })}</Note>
    )
  } else if (!status) {
    body = <Note hint={t('sensors.waitingHint')}>{t('sensors.waiting', { robot: robotName })}</Note>
  } else {
    body = (
      <MountView
        robot={robot} status={status} canChange={canChange} canConfigure={canConfigure} busy={busy} panel={panel}
        setPanel={setPanel} onMode={sendMode} onMount={sendMount}
      />
    )
  }

  const result = sent.kind === 'sending' ? { tone: 'neutral' as const, text: t('sensors.sending', { robot: robotName }) }
    : sent.kind === 'done' ? {
      tone: 'green' as const,
      text: sent.what === 'mode' && sent.mode
        ? t('sensors.result.modeDone', { robot: robotName, mode: t(`sensors.mode.${sent.mode}`) })
        : t('sensors.result.done', { robot: robotName }),
    }
      : sent.kind === 'failed' ? { tone: 'red' as const, text: t('sensors.result.failed', { robot: robotName, reason: sent.reason }) }
        : sent.kind === 'unknown' ? { tone: 'amber' as const, text: t('sensors.result.unknown', { robot: robotName }) }
          : null

  return (
    <div className="rh-sensors">
      <div style={{ maxWidth: 1180, background: color.surface, borderRadius: radius.xl }}>
        {header}
        <div style={{ display: 'grid', gap: space[4], padding: `0 ${space[5]}px ${space[5]}px` }}>
          {result && (
            <div role="status" data-tone={result.tone} style={{
              padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.md, fontSize: font.size.md, color: color.t1, lineHeight: 1.45,
              background: result.tone === 'green' ? color.greenBg : result.tone === 'red' ? color.redBg : result.tone === 'amber' ? color.amberBg : color.hover,
              overflowWrap: 'anywhere', wordBreak: 'keep-all',
            }}>
              {result.text}
            </div>
          )}
          {body}
        </div>
      </div>
    </div>
  )
}

function Note({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div role="status" style={{
      padding: `${space[3]}px ${space[3]}px`, borderRadius: radius.md, background: color.hover, fontSize: font.size.md,
      color: color.t1, lineHeight: 1.5, wordBreak: 'keep-all', overflowWrap: 'anywhere',
    }}>
      {children}
      {hint && <div style={{ marginTop: space[1], fontSize: font.size.sm, color: color.t2 }}>{hint}</div>}
    </div>
  )
}

/** A mount as one line: "Forward 0.251 m · Left 0.012 m · …". */
function useMountText() {
  const { t } = useTranslation()
  return (mount: LidarMount) => FIELDS.map((f) => `${t(`sensors.row.${f.row}`)} ${formatMountValue(mount[f.field], f.unit)}`).join(' · ')
}

const STEP_TONE = { ok: 'green', differs: 'amber', measuring: 'neutral' } as const

/**
 * The tab as three steps (operator's choice A, 2026-11-18): a one-sentence
 * summary, then 1 tilt, 2 forward/sideways, 3 height and heading, each saying
 * whether it is done and what to do if not. Each step applies only its own
 * values. Beside them (the operator's "A with the table and settings beside
 * it", the same day) and always open: every value with a dot, the measuring
 * mode, and the history. Below ~900 px of room that column drops under the
 * steps (`.rh-sensors__cols`, kit.css).
 */
function MountView({ robot, status, canChange, canConfigure, busy, panel, setPanel, onMode, onMount }: {
  robot: RobotState
  status: LidarMountStatus
  canChange: boolean
  canConfigure: boolean
  busy: boolean
  panel: Panel
  setPanel: (p: Panel) => void
  onMode: (mode: CalibrationMode) => void
  onMount: (mount: LidarMount, source: 'manual' | 'measured') => void
}) {
  const { t } = useTranslation()
  const mountText = useMountText()
  const steps = mountSteps(status)
  const { tilt, offset } = steps
  const [turning, setTurning] = useState<number | null>(null)
  const off = status.mode === 'off'
  const deg = (v: number) => formatMountValue(v, 'deg')
  const m = (v: number) => formatMountValue(v, 'm')

  const summary = off ? { tone: 'amber' as const, text: t('sensors.summary.off') }
    : steps.allDone ? { tone: 'green' as const, text: t('sensors.summary.allDone') }
      : { tone: 'amber' as const, text: `${t(`sensors.summary.tilt.${tilt.state}`)} ${t(`sensors.summary.offset.${offset.state}`)}` }

  // --- step 1: tilt
  const tiltText = (p: { pitch: number; roll: number }) =>
    tilt.rollDiffers ? t('sensors.tilt.withRoll', { pitch: deg(p.pitch), roll: deg(p.roll) }) : deg(p.pitch)
  const applyTilt = measuredMount(status, 'tilt')
  // --- step 2: forward and sideways
  const pair = (p: { x: number; y: number }) => t('sensors.offset.pair', { x: m(p.x), y: m(p.y) })
  const applyOffset = measuredMount(status, 'offset')
  const offsetChip = turning !== null ? { tone: 'amber' as const, text: t('sensors.chip.running', { turn: turning, of: TURN_COUNT }) }
    : offset.state === 'measuring' ? { tone: 'amber' as const, text: t('sensors.chip.turns', { n: offset.turns, target: offset.target }) }
      : { tone: STEP_TONE[offset.state], text: t(`sensors.chip.${offset.state}`) }
  const last = offset.lastTurn
  const outOfRange = (a: typeof applyTilt) => (!a.ok && a.reason === 'outOfRange' ? t('sensors.applyOutOfRange') : null)

  return (
    <div className="rh-sensors__cols">
      <div data-column="steps" style={{ display: 'grid', gap: space[4], minWidth: 0 }}>
        <div role="status" data-testid="summary" data-tone={summary.tone} style={{
          display: 'flex', gap: space[2], alignItems: 'baseline', padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.md,
          background: summary.tone === 'green' ? color.greenBg : color.amberBg, fontSize: font.size.md, color: color.t1,
          lineHeight: 1.45, wordBreak: 'keep-all', overflowWrap: 'anywhere',
        }}>
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: radius.full, flexShrink: 0, transform: 'translateY(-1px)', background: summary.tone === 'green' ? color.green : color.amber }} />
          <span>{summary.text}</span>
        </div>

        <div style={{ display: 'grid', gap: space[2] }}>
          <Step num={1} testId="tilt" title={t('sensors.step.tilt')} now={!off && tilt.state === 'differs'}
            chip={{ tone: STEP_TONE[tilt.state], text: t(`sensors.chip.${tilt.state}`) }}>
            <StepText testId="tilt-line">
              {tilt.measured
                ? t('sensors.tilt.line', { inUse: tiltText(tilt.inUse), measured: tiltText(tilt.measured) })
                : t('sensors.tilt.lineMeasuring', { inUse: tiltText(tilt.inUse), still: tilt.stillSamples.toLocaleString(formatLocale()) })}
            </StepText>
            {canConfigure && tilt.state === 'differs' && (
              <StepActions caption={outOfRange(applyTilt)}>
                <Button variant="primary" disabled={!canChange || busy || !applyTilt.ok}
                  onClick={() => { if (applyTilt.ok) setPanel({ kind: 'apply', part: 'tilt', mount: applyTilt.mount }) }}>
                  {t('sensors.tilt.apply')}
                </Button>
              </StepActions>
            )}
            {panel.kind === 'apply' && panel.part === 'tilt' && (
              <Confirm
                question={t('sensors.confirmApply.question')} detail={mountText(panel.mount)} confirm={t('sensors.confirmApply.confirm')}
                onConfirm={() => onMount(panel.mount, 'measured')} onCancel={() => setPanel({ kind: 'none' })}
              />
            )}
          </Step>

          <Step num={2} testId="offset" title={t('sensors.step.offset')} now={!off && offset.state !== 'ok'} chip={offsetChip}>
            <StepText testId="offset-line">
              {offset.measured ? t('sensors.offset.line', { inUse: pair(offset.inUse), measured: pair(offset.measured) }) : t('sensors.offset.howTo')}
            </StepText>
            {offset.state === 'measuring' && offset.left !== null && offset.right !== null && (
              <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', paddingLeft: STEP_INDENT }}>
                <CountBar label={t('sensors.offset.left', { n: offset.left, target: offset.eachWayTarget })} fraction={barFraction(offset.left, offset.eachWayTarget)} />
                <CountBar label={t('sensors.offset.right', { n: offset.right, target: offset.eachWayTarget })} fraction={barFraction(offset.right, offset.eachWayTarget)} />
              </div>
            )}
            {offset.unsteady && <StepText>{t('sensors.offset.unsteady', { target: offset.target })}</StepText>}
            {offset.state === 'measuring' && last && (
              <StepText testId="last-turn">
                {last.kept ? t('sensors.offset.lastKept') : t('sensors.offset.lastRefused', { reason: t(`sensors.refusal.${last.reason ?? 'unknown'}`) })}
              </StepText>
            )}
            {canConfigure && offset.state !== 'ok' && (
              <StepActions caption={offset.state === 'measuring'
                ? t(offset.unsteady ? 'sensors.offset.applyCaptionUnsteady' : 'sensors.offset.applyCaption', { target: offset.target })
                : outOfRange(applyOffset)}>
                <Button variant={offset.state === 'differs' ? 'primary' : 'secondary'} disabled={!canChange || busy || !applyOffset.ok}
                  onClick={() => { if (applyOffset.ok) setPanel({ kind: 'apply', part: 'offset', mount: applyOffset.mount }) }}>
                  {t('sensors.offset.apply')}
                </Button>
              </StepActions>
            )}
            {panel.kind === 'apply' && panel.part === 'offset' && (
              <Confirm
                question={t('sensors.confirmApply.question')} detail={mountText(panel.mount)} confirm={t('sensors.confirmApply.confirm')}
                onConfirm={() => onMount(panel.mount, 'measured')} onCancel={() => setPanel({ kind: 'none' })}
              />
            )}
            {canConfigure && <CalibrationTurns robot={robot} status={status} onTurning={setTurning} />}
          </Step>

          <Step num={3} testId="typed" title={t('sensors.step.typed')} chip={{ tone: 'neutral', text: t('sensors.chip.typed') }}>
            <StepText>{t('sensors.typed.line')}</StepText>
            <StepText testId="typed-values">{t('sensors.typed.values', { z: m(status.in_use.z_m), yaw: deg(status.in_use.yaw_deg) })}</StepText>
            {canConfigure && panel.kind !== 'edit' && (
              <StepActions>
                <Button icon={Pencil} disabled={!canChange || busy}
                  onClick={() => setPanel({ kind: 'edit', form: mountToForm(status.in_use), tried: false })}>
                  {t('sensors.typed.edit')}
                </Button>
              </StepActions>
            )}
            {panel.kind === 'edit' && (
              <EditForm
                form={panel.form} tried={panel.tried} inUse={status.in_use}
                onChange={(form) => setPanel({ ...panel, form })}
                onSubmit={() => {
                  const parsed = formToMount(panel.form)
                  if (parsed.ok && !sameMount(parsed.mount, status.in_use)) onMount(parsed.mount, 'manual')
                  else setPanel({ ...panel, tried: true })
                }}
                onCancel={() => setPanel({ kind: 'none' })}
              />
            )}
          </Step>
        </div>

        {!canConfigure && <span style={{ fontSize: font.size.sm, color: color.t3 }}>{t('sensors.readOnly')}</span>}
      </div>

      <div data-column="side" style={{ display: 'grid', gap: space[2], minWidth: 0 }}>
        <Step testId="values" title={t('sensors.block.values')}>
          <ValueTable status={status} />
        </Step>

        <Step testId="mode" title={t('sensors.block.mode')}>
          <div style={{ display: 'grid', gap: space[2], justifyItems: 'start' }}>
            <Segmented<CalibrationMode>
              label={t('sensors.modeAria')} value={status.mode} onChange={canChange && !busy ? onMode : () => {}}
              options={CALIBRATION_MODES.map((mode) => ({
                value: mode, label: t(`sensors.mode.${mode}`), disabled: !(canChange && !busy) && mode !== status.mode,
              }))}
            />
            <p data-testid="mode-hint" style={{ margin: 0, fontSize: font.size.sm, lineHeight: 1.5, color: color.t2, wordBreak: 'keep-all' }}>
              {t(`sensors.modeHint.${status.mode}`)}
            </p>
          </div>
        </Step>

        <Step testId="history" title={t('sensors.block.history')}>
          <HistoryList
            history={status.history} inUse={status.in_use} canRevert={canChange && !busy} panel={panel}
            onRevert={(change) => setPanel({ kind: 'revert', change })}
            onConfirm={(change) => onMount(change.mount, 'manual')} onCancel={() => setPanel({ kind: 'none' })}
          />
        </Step>
      </div>
    </div>
  )
}

const CELL_DOT: Record<MountCellTone, string> = { green: color.green, amber: color.amber, grey: color.t3 }

/** "All values": every value in use next to what the robot measured, each
 * measured cell led by a dot (green matches, amber needs something, grey typed
 * or a small difference) and kept short to fit the right column. The spread is
 * in the value's tooltip. */
function ValueTable({ status }: { status: LidarMountStatus }) {
  const { t } = useTranslation()
  const rows = mountRows(status)
  const m = status.measured
  const measuredAny = !!m && (m.turns > 0 || m.still_samples > 0)
  const cell: React.CSSProperties = { padding: `${space[1]}px 0`, fontSize: font.size.sm, fontVariantNumeric: 'tabular-nums', color: color.t1 }
  const head: React.CSSProperties = { fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.t3, textTransform: 'uppercase', letterSpacing: 0.4, wordBreak: 'keep-all' }
  return (
    <>
      <div role="table" aria-label={t('sensors.lidarMount')} style={{
        display: 'grid', gridTemplateColumns: 'auto auto minmax(0, 1fr)', columnGap: space[4], alignItems: 'center',
      }}>
        <div role="row" style={{ display: 'contents' }}>
          <span role="columnheader" style={head}>{t('sensors.col.value')}</span>
          <span role="columnheader" style={head}>{t('sensors.col.inUse')}</span>
          <span role="columnheader" style={head}>{t('sensors.col.measured')}</span>
        </div>
        {rows.map((r) => {
          const c = mountCell(r, status.mode)
          const tip = c.kind === 'value'
            ? [t(`sensors.cellTone.${c.tone}`), r.sd !== null ? formatSpread(r.sd, r.unit) : null].filter(Boolean).join(' · ')
            : undefined
          return (
            <div role="row" key={r.key} data-row={r.key} style={{ display: 'contents' }}>
              <span role="rowheader" title={t(`sensors.rowTitle.${r.key}`)} style={{ ...cell, color: color.t2 }}>{t(`sensors.row.${r.key}`)}</span>
              <span role="cell" style={{ ...cell, fontWeight: font.weight.semibold, whiteSpace: 'nowrap' }}>{formatMountValue(r.inUse, r.unit)}</span>
              <span role="cell" data-tone={c.tone} title={tip} style={{
                ...cell, display: 'flex', alignItems: 'center', gap: space[2], minWidth: 0,
                color: c.kind === 'value' ? color.t1 : color.t2, wordBreak: 'keep-all',
              }}>
                <span aria-hidden style={{ width: 8, height: 8, borderRadius: radius.full, background: CELL_DOT[c.tone], flexShrink: 0 }} />
                <span>{c.kind === 'value' ? formatMountValue(c.value, r.unit) : t(`sensors.cell.${c.kind}`)}</span>
              </span>
            </div>
          )
        })}
      </div>
      {/* With measuring off and nothing measured, the mode block below says so. */}
      {(measuredAny || status.mode !== 'off') && (
        <p data-testid="basis" style={{ margin: 0, fontSize: font.size.xs, color: color.t3, lineHeight: 1.5, wordBreak: 'keep-all' }}>
          {m && measuredAny
            ? t('sensors.basis', {
              turns: m.turns.toLocaleString(formatLocale()), still: m.still_samples.toLocaleString(formatLocale()),
              since: dateText(m.since), age: formatAge(m.updated_at ?? status.updated_at),
            })
            : t('sensors.basisNone')}
        </p>
      )}
    </>
  )
}

/** An in-page question with the shift warning: Apply measured and Revert. */
function Confirm({ question, detail, confirm, onConfirm, onCancel }: {
  question: string; detail: string; confirm: string; onConfirm: () => void; onCancel: () => void
}) {
  const { t } = useTranslation()
  return (
    <div role="alertdialog" aria-label={question} style={{
      display: 'grid', gap: space[2], padding: space[3], borderRadius: radius.md, background: color.amberBg,
    }}>
      <p style={{ margin: 0, fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1 }}>{question}</p>
      <p style={{ margin: 0, fontSize: font.size.sm, color: color.t1, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{detail}</p>
      <p style={{ margin: 0, fontSize: font.size.sm, color: color.t2, wordBreak: 'keep-all' }}>{t('sensors.shiftWarning')}</p>
      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
        <Button variant="primary" onClick={onConfirm}>{confirm}</Button>
        <Button onClick={onCancel}>{t('sensors.cancel')}</Button>
      </div>
    </div>
  )
}

function EditForm({ form, tried, inUse, onChange, onSubmit, onCancel }: {
  form: MountForm
  tried: boolean
  inUse: LidarMount
  onChange: (form: MountForm) => void
  onSubmit: () => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const parsed = formToMount(form)
  const errors: Partial<Record<keyof LidarMount, MountFieldError>> = parsed.ok ? {} : parsed.errors
  const unchanged = parsed.ok && sameMount(parsed.mount, inUse)
  const range = (field: keyof LidarMount, unit: 'm' | 'deg') => {
    const [lo, hi] = MOUNT_BOUNDS[field]
    const text = (v: number) => (unit === 'm' ? `${v} m` : `${v}°`)
    return { min: text(lo), max: text(hi) }
  }
  return (
    <form
      aria-label={t('sensors.edit.title')} noValidate
      onSubmit={(e) => { e.preventDefault(); onSubmit() }}
      style={{ display: 'grid', gap: space[3], padding: space[3], borderRadius: radius.md, background: color.hover }}
    >
      <p style={{ margin: 0, fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1 }}>{t('sensors.edit.title')}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: space[3] }}>
        {FIELDS.map(({ field, row, unit }) => {
          const error = tried || form[field].trim() !== '' ? errors[field] : undefined
          const r = range(field, unit)
          const id = `lidar-mount-${field}`
          return (
            <label key={field} htmlFor={id} style={{ display: 'grid', gap: 4, fontSize: font.size.sm, color: color.t2 }}>
              <span title={t(`sensors.rowTitle.${row}`)}>{t(`sensors.row.${row}`)} ({unit === 'm' ? 'm' : '°'})</span>
              <input
                id={id} name={field} inputMode="decimal" value={form[field]} aria-invalid={error ? true : undefined}
                onChange={(e) => onChange({ ...form, [field]: e.target.value })}
                style={{
                  height: 30, padding: `0 ${space[2]}px`, borderRadius: 6, border: 0, background: color.card, color: color.t1,
                  fontFamily: font.family, fontSize: font.size.md, fontVariantNumeric: 'tabular-nums',
                  outline: error ? `2px solid ${color.red}` : undefined,
                }}
              />
              <span style={{ fontSize: font.size.xs, color: error ? color.red : color.t3 }}>
                {error ? t(`sensors.edit.errors.${error}`, r) : t('sensors.edit.range', r)}
              </span>
            </label>
          )
        })}
      </div>
      <p style={{ margin: 0, fontSize: font.size.sm, color: color.t2, wordBreak: 'keep-all' }}>
        {unchanged ? t('sensors.edit.unchanged') : t('sensors.shiftWarning')}
      </p>
      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
        <Button type="submit" variant="primary" disabled={unchanged}>{t('sensors.edit.save')}</Button>
        <Button onClick={onCancel}>{t('sensors.cancel')}</Button>
      </div>
    </form>
  )
}

function HistoryList({ history, inUse, canRevert, panel, onRevert, onConfirm, onCancel }: {
  history: LidarMountChange[]
  inUse: LidarMount
  canRevert: boolean
  panel: Panel
  onRevert: (change: LidarMountChange) => void
  onConfirm: (change: LidarMountChange) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const mountText = useMountText()
  const names = useUserNames(history.map((c) => c.by))
  if (history.length === 0) return <p style={{ margin: 0, fontSize: font.size.sm, color: color.t3 }}>{t('sensors.historyEmpty')}</p>
  return (
    <ul aria-label={t('sensors.historyAria')} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
      {history.map((change, k) => {
        const current = sameMount(change.mount, inUse)
        const confirming = panel.kind === 'revert' && panel.change === change
        return (
          <li key={`${change.at}-${k}`} data-change={k} style={{
            display: 'grid', gap: space[1], padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.md,
            background: current ? color.selected : color.hover,
          }}>
            <div style={{ display: 'flex', gap: space[2], alignItems: 'baseline', flexWrap: 'wrap' }}>
              <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1 }}>{dateTimeText(change.at)}</span>
              <span style={{ fontSize: font.size.sm, color: color.t2 }}>
                {t(`sensors.source.${change.source}`)}{change.by ? ` · ${t('sensors.by', { by: names[change.by] ?? change.by })}` : ''}
              </span>
              <span style={{ flex: 1 }} />
              {current ? <span style={{ fontSize: font.size.sm, color: color.t2 }}>{t('sensors.current')}</span>
                : canRevert && !confirming && <Button size="sm" onClick={() => onRevert(change)}>{t('sensors.revert')}</Button>}
            </div>
            <span style={{ fontSize: font.size.sm, color: color.t2, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>{mountText(change.mount)}</span>
            {confirming && (
              <Confirm
                question={t('sensors.confirmRevert.question', { when: dateTimeText(change.at) })} detail={mountText(change.mount)}
                confirm={t('sensors.confirmRevert.confirm')} onConfirm={() => onConfirm(change)} onCancel={onCancel}
              />
            )}
          </li>
        )
      })}
    </ul>
  )
}
