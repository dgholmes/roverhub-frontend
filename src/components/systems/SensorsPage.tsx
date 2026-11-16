import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { hashForSystemsPage } from '@/app/routes'
import { robotFromSensorsHash } from '@/sensors/lidarMountAlerts'
import { ChevronDown, History as HistoryIcon, Pencil } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Button, ICON, Segmented } from '@/components/kit'
import { formatLocale } from '@/i18n'
import { formatAge } from '@/fleet/bridgeHealth'
import { useSiteRobots } from '@/org/useSiteRobots'
import { useCan } from '@/org/useCan'
import {
  bridgeHasSensors, formToMount, tiltMeasured, formatMountValue, formatSpread, measuredMount, mountRows, mountToForm, sameMount,
  type MountFieldError, type MountForm, type MountRow,
} from '@/sensors/lidarMount'
import { setCalibrationMode, setLidarMount } from '@/sensors/sensorCommands'
import { useLidarMounts } from '@/sensors/useLidarMounts'
import type { CommandOutcome } from '@/store/useLiveOpsStore'
import {
  CALIBRATION_MODES, MOUNT_BOUNDS, type CalibrationMode, type LidarMount, type LidarMountChange, type LidarMountStatus,
} from '@/types/sensors'
import { defaultLogRobot } from './LogsPage'

const robotStorageKey = (siteId: string) => `rh.systems.sensors.robot.${siteId}`
function readStoredRobot(siteId: string): string | null {
  try { return localStorage.getItem(robotStorageKey(siteId)) } catch { return null }
}
function storeRobot(siteId: string, robotId: string): void {
  try { localStorage.setItem(robotStorageKey(siteId), robotId) } catch { /* private window, blocked storage */ }
}

/** The form's fields, in the order the table shows them. */
const FIELDS: { field: keyof LidarMount; row: MountRow['key']; unit: 'm' | 'deg' }[] = [
  { field: 'x_m', row: 'forward', unit: 'm' },
  { field: 'y_m', row: 'left', unit: 'm' },
  { field: 'z_m', row: 'height', unit: 'm' },
  { field: 'pitch_deg', row: 'pitch', unit: 'deg' },
  { field: 'roll_deg', row: 'roll', unit: 'deg' },
  { field: 'yaw_deg', row: 'yaw', unit: 'deg' },
]

/** What the page shows after a command: nothing, sending, or how it ended. */
type Sent =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'done'; what: 'mount' | 'mode'; mode?: CalibrationMode }
  | { kind: 'failed'; reason: string }
  | { kind: 'unknown' }

/** In-page panels: one at a time, so a confirmation is never off-screen. */
type Panel =
  | { kind: 'none' }
  | { kind: 'apply'; mount: LidarMount }
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
 * Systems › Sensors: where each robot's lidar sits (schema 0.0.23), as the
 * operator chose on 2026-11-16 (option A). The mode on top -- Off, Suggest
 * (the default) or Auto; what is in use next to what the robot measured, with
 * how sure it is and from how many turns; Apply measured, Edit values, and the
 * history with Revert. Every change asks first, in the page, because moving
 * the lidar's pose moves where the robot thinks it is.
 *
 * Engineers change it (`configure`); everyone else reads it. A bridge older
 * than 0.0.23 neither reports it nor understands the commands, so it gets a
 * plain note instead.
 */
export function SensorsPage({ siteId }: { siteId: string }) {
  const { t } = useTranslation()
  const robots = useSiteRobots()
  const mounts = useLidarMounts()
  const canConfigure = useCan('configure')
  const [chosen, setChosen] = useState<string | null>(() => robotFromSensorsHash(window.location.hash) ?? readStoredRobot(siteId))
  // The bell's link names the robot (`?robot=`): open on it, remember it, and
  // drop it from the address so a reload does not keep forcing it.
  useEffect(() => {
    const follow = () => {
      const named = robotFromSensorsHash(window.location.hash)
      if (!named) return
      setChosen(named)
      storeRobot(siteId, named)
      window.history.replaceState(window.history.state, '', hashForSystemsPage(siteId, 'sensors'))
    }
    follow()
    window.addEventListener('hashchange', follow)
    return () => window.removeEventListener('hashchange', follow)
  }, [siteId])
  const robotId = chosen && robots.some((r) => r.robot_id === chosen) ? chosen : defaultLogRobot(robots)
  const robot = robots.find((r) => r.robot_id === robotId) ?? null
  const robotName = robot?.name ?? robotId ?? ''
  const status = robotId ? mounts[robotId] ?? null : null
  const [panel, setPanel] = useState<Panel>({ kind: 'none' })
  const [showHistory, setShowHistory] = useState(false)
  const [sent, setSent] = useState<Sent>({ kind: 'idle' })

  const choose = (id: string) => {
    setChosen(id)
    storeRobot(siteId, id)
    setPanel({ kind: 'none' })
    setSent({ kind: 'idle' })
  }

  if (robots.length === 0) {
    return <div style={{ flex: 1, padding: space[4], color: color.t3, fontSize: font.size.md }}>{t('sensors.noRobots')}</div>
  }

  const schema = robot?.bridge?.schema_version ?? null
  const supported = bridgeHasSensors(schema)
  const busy = sent.kind === 'sending'
  const online = robot?.connectivity.bridge_state === 'connected'
  const canChange = canConfigure && supported && !!status && online

  const send = async (run: () => Promise<CommandOutcome>, what: 'mount' | 'mode', mode?: CalibrationMode) => {
    setSent({ kind: 'sending' })
    setPanel({ kind: 'none' })
    setSent(sentFrom(await run(), what, mode))
  }
  const sendMount = (mount: LidarMount, source: 'manual' | 'measured') => {
    if (robotId) void send(() => setLidarMount(robotId, { mount, source }), 'mount')
  }
  const sendMode = (mode: CalibrationMode) => {
    if (robotId && status && mode !== status.mode) void send(() => setCalibrationMode(robotId, mode), 'mode', mode)
  }

  const header = (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: space[2], padding: `${space[4]}px ${space[5]}px ${space[3]}px` }}>
      {robots.length > 1 ? (
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', height: 28, marginLeft: -space[2] }}>
          <select
            aria-label={t('sensors.robotAria')} value={robotId ?? ''} onChange={(e) => choose(e.target.value)}
            style={{
              height: 28, border: 0, background: 'transparent', color: color.t1, fontFamily: font.family, appearance: 'none',
              padding: `0 ${space[6]}px 0 ${space[2]}px`, fontSize: font.size.lg, fontWeight: font.weight.bold, cursor: 'pointer', maxWidth: '100%',
            }}
          >
            {robots.map((r) => <option key={r.robot_id} value={r.robot_id}>{r.name}</option>)}
          </select>
          <ChevronDown size={14} strokeWidth={ICON.stroke} aria-hidden style={{ position: 'absolute', right: 6, pointerEvents: 'none', color: color.t2 }} />
        </div>
      ) : (
        <h2 style={{ margin: 0, fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.t1 }}>{robotName}</h2>
      )}
      <span style={{ fontSize: font.size.lg, color: color.t3 }}>·</span>
      <h3 style={{ margin: 0, fontSize: font.size.lg, fontWeight: font.weight.semibold, color: color.t2 }}>{t('sensors.lidarMount')}</h3>
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
        status={status} canChange={canChange} canConfigure={canConfigure} busy={busy} panel={panel} setPanel={setPanel}
        showHistory={showHistory} setShowHistory={setShowHistory} onMode={sendMode} onMount={sendMount}
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
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: space[4] }}>
      <div style={{ maxWidth: 760, background: color.surface, borderRadius: radius.xl }}>
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

function MountView({ status, canChange, canConfigure, busy, panel, setPanel, showHistory, setShowHistory, onMode, onMount }: {
  status: LidarMountStatus
  canChange: boolean
  canConfigure: boolean
  busy: boolean
  panel: Panel
  setPanel: (p: Panel) => void
  showHistory: boolean
  setShowHistory: (v: boolean) => void
  onMode: (mode: CalibrationMode) => void
  onMount: (mount: LidarMount, source: 'manual' | 'measured') => void
}) {
  const { t } = useTranslation()
  const mountText = useMountText()
  const rows = mountRows(status)
  const [withTilt, setWithTilt] = useState(false)
  const measured = measuredMount(status, withTilt)
  const tiltKnown = tiltMeasured(status.measured)
  const m = status.measured
  const applyBlocked = !measured.ok ? t(measured.reason === 'nothing' ? 'sensors.applyNothing' : 'sensors.applyOutOfRange')
    : sameMount(measured.mount, status.in_use) ? t('sensors.applySame') : null
  const note: React.CSSProperties = { margin: 0, fontSize: font.size.sm, color: color.t2, lineHeight: 1.5, wordBreak: 'keep-all' }
  const cell: React.CSSProperties = { padding: `${space[2]}px 0`, fontSize: font.size.md, fontVariantNumeric: 'tabular-nums', color: color.t1 }
  const head: React.CSSProperties = { fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.t3, textTransform: 'uppercase', letterSpacing: 0.4 }

  return (
    <>
      <p style={note}>{t('sensors.lidarMountHint')}</p>

      <div style={{ display: 'grid', gap: space[2], justifyItems: 'start' }}>
        {canChange && !busy ? (
          <Segmented<CalibrationMode>
            label={t('sensors.modeAria')} value={status.mode} onChange={onMode}
            options={CALIBRATION_MODES.map((mode) => ({ value: mode, label: t(`sensors.mode.${mode}`) }))}
          />
        ) : (
          <Segmented<CalibrationMode>
            label={t('sensors.modeAria')} value={status.mode} onChange={() => {}}
            options={CALIBRATION_MODES.map((mode) => ({ value: mode, label: t(`sensors.mode.${mode}`), disabled: mode !== status.mode }))}
          />
        )}
        <p style={note}>{t(`sensors.modeHint.${status.mode}`)}</p>
      </div>

      <div role="table" aria-label={t('sensors.lidarMount')} style={{ display: 'grid', gridTemplateColumns: 'minmax(84px, 1fr) minmax(90px, 1fr) minmax(120px, 1.4fr)', columnGap: space[4] }}>
        <div role="row" style={{ display: 'contents' }}>
          <span role="columnheader" style={head}>{t('sensors.col.value')}</span>
          <span role="columnheader" style={head}>{t('sensors.col.inUse')}</span>
          <span role="columnheader" style={head}>{t('sensors.col.measured')}</span>
        </div>
        {rows.map((r) => (
          <div role="row" key={r.key} data-row={r.key} style={{ display: 'contents' }}>
            <span role="rowheader" title={t(`sensors.rowTitle.${r.key}`)} style={{ ...cell, color: color.t2 }}>{t(`sensors.row.${r.key}`)}</span>
            <span role="cell" style={cell}>{formatMountValue(r.inUse, r.unit)}</span>
            <span role="cell" data-differs={r.differs || undefined} style={{
              ...cell, color: r.differs ? color.amber : r.typedOnly || r.measured === null ? color.t3 : color.t1,
              fontWeight: r.differs ? font.weight.semibold : undefined,
            }}>
              {r.typedOnly ? t('sensors.typedOnly')
                : status.mode === 'off' && r.measured === null ? t('sensors.off')
                  : r.measuring && r.unit === 'm' ? t('sensors.measuringTurns', { count: m?.turns ?? 0 })
                    : r.measuring ? t('sensors.measuringTilt')
                  : r.measured === null ? t('sensors.notYet')
                    : <>{formatMountValue(r.measured, r.unit)}{r.sd !== null && <span style={{ color: color.t3, fontWeight: font.weight.regular }}> {formatSpread(r.sd, r.unit)}</span>}</>}
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gap: space[1] }}>
        <p style={{ ...note, color: color.t3 }} data-testid="basis">
          {m && (m.turns > 0 || m.still_samples > 0)
            ? t('sensors.basis', {
              turns: m.turns.toLocaleString(formatLocale()), still: m.still_samples.toLocaleString(formatLocale()),
              since: dateText(m.since), age: formatAge(m.updated_at ?? status.updated_at),
            })
            : status.mode === 'off' ? t('sensors.modeHint.off') : t('sensors.basisNone')}
        </p>
        {status.differs && (
          <p style={{ ...note, color: color.t1, display: 'flex', gap: space[2], alignItems: 'center' }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: radius.full, background: color.amber, flexShrink: 0 }} />
            {t('sensors.differs')}
          </p>
        )}
      </div>

      {canConfigure && tiltKnown && (
        <div style={{ display: 'grid', gap: 2 }}>
          <label style={{ display: 'inline-flex', gap: space[2], alignItems: 'center', fontSize: font.size.md, color: color.t1, cursor: 'pointer' }}>
            <input type="checkbox" checked={withTilt} disabled={!canChange || busy} onChange={(e) => setWithTilt(e.target.checked)}
              style={{ accentColor: color.accent, width: 15, height: 15 }} />
            {t('sensors.withTilt')}
          </label>
          <p style={{ ...note, color: color.t3, paddingLeft: 23 }}>{t('sensors.withTiltNote')}</p>
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[2], alignItems: 'center' }}>
        {canConfigure && (
          <>
            <Button
              variant="primary" disabled={!canChange || busy || !!applyBlocked} title={applyBlocked ?? undefined}
              onClick={() => { if (measured.ok) setPanel({ kind: 'apply', mount: measured.mount }) }}
            >
              {t('sensors.applyMeasured')}
            </Button>
            <Button icon={Pencil} disabled={!canChange || busy}
              onClick={() => setPanel({ kind: 'edit', form: mountToForm(status.in_use), tried: false })}>
              {t('sensors.editValues')}
            </Button>
          </>
        )}
        <Button icon={HistoryIcon} active={showHistory} onClick={() => setShowHistory(!showHistory)}>{t('sensors.history')}</Button>
        {!canConfigure && <span style={{ fontSize: font.size.sm, color: color.t3 }}>{t('sensors.readOnly')}</span>}
      </div>

      {panel.kind === 'apply' && (
        <Confirm
          question={t('sensors.confirmApply.question')} detail={mountText(panel.mount)} confirm={t('sensors.confirmApply.confirm')}
          onConfirm={() => onMount(panel.mount, 'measured')} onCancel={() => setPanel({ kind: 'none' })}
        />
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

      {showHistory && (
        <HistoryList
          history={status.history} inUse={status.in_use} canRevert={canChange && !busy} panel={panel}
          onRevert={(change) => setPanel({ kind: 'revert', change })}
          onConfirm={(change) => onMount(change.mount, 'manual')} onCancel={() => setPanel({ kind: 'none' })}
        />
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
                {t(`sensors.source.${change.source}`)}{change.by ? ` · ${t('sensors.by', { by: change.by })}` : ''}
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
