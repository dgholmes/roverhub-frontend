import { useRef, useState } from 'react'
import { Hand } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, InlineAlertDialog } from '@/components/kit'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import type { OverflowEntry } from '@/components/liveops/command/CommandOverflowMenu'
import { color, font, radius, space } from '@/design-system/tokens'
import { refusalText } from '@/lib/refusals'
import { getCommandAvailability } from '@/liveops/commandPolicy'
import { greeterParams, hasGreeter, settingOf } from '@/liveops/greeter'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { GREETER_BOUNDS, type GreeterSetting, type RobotState } from '@/types'
import { DanceSelect, fieldStyle } from './GreetPanel'
import { GreeterStatusChip } from './GreeterStatusChip'
import { useSavedGreetings } from './useSavedGreetings'

/** Which greeting Greeter mode says: the clip already on the robot, one of the
 * saved greetings, a new one typed here, or none (wave and dance only). */
type GreetingChoice = 'keep' | 'none' | 'custom' | `saved:${string}`

/** A number field with its unit. `scale` shows seconds as minutes. */
function NumberRow({ label, unit, value, onChange, min, max, step, scale = 1 }: {
  label: string
  unit: string
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step: number
  scale?: number
}) {
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.sm, color: color.t2 }}>
      <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
      <input
        type="number"
        aria-label={label}
        value={Number((value / scale).toFixed(2))}
        min={min / scale} max={max / scale} step={step}
        onChange={(e) => { const n = Number(e.target.value); if (Number.isFinite(n)) onChange(n * scale) }}
        style={{ ...fieldStyle, width: 76, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}
      />
      <span style={{ width: 28, color: color.t3 }}>{unit}</span>
    </label>
  )
}

/**
 * Greeter mode's switch and settings (schema 0.0.36): the greeting, the dance,
 * the three distances, the cooldown and the minimum battery, from the robot's
 * own setting or the schema's defaults. Turning the switch on asks first, in
 * the spec's words. Save sends ONE SET_GREETER with the whole setting, the
 * greeting made into a speech clip first (`createSpokenClip`, as Say and Greet
 * make theirs). A bridge older than 0.0.36 reports no `greeter`: the switch is
 * disabled and the panel says to update the robot.
 */
export function GreeterPanel({ robot, onSaved }: { robot: RobotState; onSaved?: () => void }) {
  const { t } = useTranslation()
  const createSpokenClip = useLiveOpsStore((s) => s.createSpokenClip)
  const dispatchCommandAsync = useLiveOpsStore((s) => s.dispatchCommandAsync)
  const [greetings] = useSavedGreetings()
  const supported = hasGreeter(robot)
  const current = settingOf(robot.greeter)
  const [form, setForm] = useState<GreeterSetting>(current)
  const [greeting, setGreeting] = useState<GreetingChoice>(() =>
    current.clip_id ? 'keep' : greetings[0] ? `saved:${greetings[0].id}` : 'none')
  const [custom, setCustom] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState<'making' | 'saving' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const switchRef = useRef<HTMLButtonElement>(null)
  const availability = getCommandAvailability(robot, 'SET_GREETER')

  const set = <K extends keyof GreeterSetting>(key: K, value: GreeterSetting[K]) => setForm((f) => ({ ...f, [key]: value }))

  const greetingText = greeting === 'custom' ? custom.trim()
    : greeting.startsWith('saved:') ? greetings.find((g) => `saved:${g.id}` === greeting)?.text ?? '' : ''
  const needsText = greeting === 'custom' || greeting.startsWith('saved:')
  const canSave = supported && availability.enabled && busy === null && (!needsText || greetingText.length > 0)

  async function save() {
    if (!canSave) return
    setError(null)
    let clipId: string | null = greeting === 'keep' ? current.clip_id : null
    if (needsText) {
      setBusy('making')
      try {
        clipId = (await createSpokenClip(robot.robot_id, greetingText)).clip_id
      } catch (e) {
        setError(e instanceof Error ? e.message : t('command.speak.synthFailed'))
        setBusy(null)
        return
      }
    }
    setBusy('saving')
    const params = greeterParams(form, clipId)
    const label = form.enabled === current.enabled
      ? t('greeter.mode.commandSave')
      : t(form.enabled ? 'greeter.mode.commandOn' : 'greeter.mode.commandOff')
    try {
      const { result, command } = await dispatchCommandAsync(robot.robot_id, 'SET_GREETER', label, { ...params })
      if (result === 'failed') {
        setError(command.failure_reason
          ? t('greeter.mode.refused', { reason: refusalText(t, command.failure_reason) })
          : t('greeter.mode.failed'))
      } else {
        onSaved?.()
      }
    } finally {
      setBusy(null)
    }
  }

  const sectionLabel: React.CSSProperties = { fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.t2 }

  return (
    <div data-greeter-panel="" style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      {!supported && (
        <div data-greeter-old-bridge="" style={{ padding: space[3], borderRadius: radius.md, background: color.amberBg, color: color.t1, fontSize: font.size.sm }}>
          {t('greeter.mode.updateRobot')}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
        <button
          ref={switchRef}
          type="button"
          role="switch"
          aria-checked={form.enabled}
          aria-label={t('greeter.mode.switchAria')}
          disabled={!supported || busy !== null}
          onClick={() => { if (form.enabled) set('enabled', false); else setConfirming(true) }}
          style={{
            position: 'relative', width: 40, height: 22, borderRadius: radius.full, border: 'none', flexShrink: 0,
            background: form.enabled ? color.green : color.cardHover,
            cursor: supported ? 'pointer' : 'not-allowed', opacity: supported ? 1 : 0.5,
          }}
        >
          <span aria-hidden style={{
            position: 'absolute', top: 3, left: form.enabled ? 21 : 3, width: 16, height: 16,
            borderRadius: radius.full, background: color.surface, transition: 'left 120ms',
          }} />
        </button>
        <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1 }}>{t('greeter.mode.label')}</span>
        <span style={{ flex: 1 }} />
        {robot.greeter && <GreeterStatusChip status={robot.greeter} />}
      </div>

      {confirming && (
        <InlineAlertDialog
          label={t('greeter.mode.confirmTitle')}
          describedBy="greeter-confirm-body"
          onClose={() => setConfirming(false)}
          returnFocus={switchRef}
          style={{ padding: space[3], borderRadius: radius.md, background: color.amberBg, display: 'flex', flexDirection: 'column', gap: space[2] }}
        >
          <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1 }}>{t('greeter.mode.confirmTitle')}</div>
          <div id="greeter-confirm-body" style={{ fontSize: font.size.sm, color: color.t1 }}>{t('greeter.mode.confirmBody')}</div>
          <div style={{ display: 'flex', gap: space[2], justifyContent: 'flex-end' }}>
            <Button data-autofocus onClick={() => setConfirming(false)}>{t('greeter.mode.cancel')}</Button>
            <Button variant="primary" onClick={() => { set('enabled', true); setConfirming(false) }}>{t('greeter.mode.confirmOn')}</Button>
          </div>
        </InlineAlertDialog>
      )}

      <fieldset disabled={!supported} style={{ border: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: space[3], opacity: supported ? 1 : 0.6 }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...sectionLabel }}>
          {t('greeter.mode.greeting')}
          <select
            aria-label={t('greeter.mode.greeting')}
            value={greeting}
            onChange={(e) => setGreeting(e.target.value as GreetingChoice)}
            style={fieldStyle}
          >
            {current.clip_id && <option value="keep">{t('greeter.mode.keepCurrent')}</option>}
            {greetings.map((g) => <option key={g.id} value={`saved:${g.id}`}>{g.text}</option>)}
            <option value="custom">{t('greeter.mode.customOption')}</option>
            <option value="none">{t('greeter.mode.noSpeech')}</option>
          </select>
        </label>
        {greeting === 'custom' && (
          <input
            value={custom}
            maxLength={200}
            placeholder={t('greeter.greet.customPlaceholder')}
            aria-label={t('greeter.greet.customAria')}
            onChange={(e) => setCustom(e.target.value)}
            style={fieldStyle}
          />
        )}

        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, ...sectionLabel }}>
          {t('greeter.mode.dance')}
          <DanceSelect value={form.dance} onChange={(d) => set('dance', d)} label={t('greeter.mode.dance')} />
        </label>

        <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
          <NumberRow
            label={t('greeter.mode.triggerDistance')} unit={t('greeter.mode.metres')} step={0.5}
            value={form.trigger_distance_m} onChange={(v) => set('trigger_distance_m', v)}
            {...GREETER_BOUNDS.trigger_distance_m}
          />
          <NumberRow
            label={t('greeter.mode.facingDistance')} unit={t('greeter.mode.metres')} step={0.5}
            value={form.facing_distance_m} onChange={(v) => set('facing_distance_m', v)}
            {...GREETER_BOUNDS.facing_distance_m}
          />
          <NumberRow
            label={t('greeter.mode.danceMinDistance')} unit={t('greeter.mode.metres')} step={0.5}
            value={form.dance_min_distance_m} onChange={(v) => set('dance_min_distance_m', v)}
            {...GREETER_BOUNDS.dance_min_distance_m}
          />
          <NumberRow
            label={t('greeter.mode.cooldown')} unit={t('greeter.mode.minutes')} step={0.5} scale={60}
            value={form.cooldown_s} onChange={(v) => set('cooldown_s', v)}
            {...GREETER_BOUNDS.cooldown_s}
          />
          <NumberRow
            label={t('greeter.mode.minBattery')} unit={t('greeter.mode.percent')} step={5}
            value={form.min_battery_pct} onChange={(v) => set('min_battery_pct', v)}
            {...GREETER_BOUNDS.min_battery_pct}
          />
        </div>
      </fieldset>

      {error && <div role="alert" style={{ fontSize: font.size.sm, color: color.red }}>{error}</div>}
      {!availability.enabled && availability.reason && (
        <div style={{ fontSize: font.size.sm, color: color.t3 }}>{availability.reason}</div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: space[2] }}>
        <Button variant="primary" disabled={!canSave} onClick={() => void save()}>
          {busy === 'making' ? t('greeter.greet.making') : busy === 'saving' ? t('greeter.mode.saving') : t('greeter.mode.save')}
        </Button>
      </div>
    </div>
  )
}

/** Greeter mode in a dialog: what LiveOps' More menu and Fleet open. */
export function GreeterDialog({ robot, open, onOpenChange }: {
  robot: RobotState
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent style={{ background: color.elevated, border: 'none', color: color.t1, maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
        <DialogHeader>
          <DialogTitle>{t('greeter.mode.title', { name: robot.name })}</DialogTitle>
          <DialogDescription style={{ color: color.t2 }}>{t('greeter.mode.lead')}</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so each opening starts from the robot's setting. */}
        {open && <GreeterPanel robot={robot} onSaved={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

/** The More-menu entry for Greeter mode and the dialog it opens, the way
 * useSurveyMenu offers survey. Always offered: on an older bridge the dialog
 * says to update the robot, with the switch disabled. */
export function useGreeterMenu(robot: RobotState): { entry: OverflowEntry; dialog: React.ReactNode } {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return {
    entry: { key: 'greeter', label: t('greeter.mode.menu'), icon: Hand, availability: { enabled: true }, onClick: () => setOpen(true) },
    dialog: <GreeterDialog robot={robot} open={open} onOpenChange={setOpen} />,
  }
}
