import { useState } from 'react'
import { Check, Hand, Pencil, Plus, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button, IconButton } from '@/components/kit'
import { DisabledReasonButton } from '@/components/common/DisabledReason'
import { color, font, radius, space } from '@/design-system/tokens'
import { refusalText } from '@/lib/refusals'
import {
  addGreeting, editGreeting, greetingLabel, MAX_GREETING_CHARS, removeGreeting,
} from '@/liveops/greeter'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { GREET_DANCES, type CommandAvailability, type GreetDance, type GreetParams } from '@/types'
import { useSavedGreetings } from './useSavedGreetings'

/** Input and select look, shared by the greeter panels. */
export const fieldStyle: React.CSSProperties = {
  width: '100%', padding: '6px 8px', background: color.card, border: `1px solid ${color.border}`,
  borderRadius: radius.sm, color: color.t1, fontSize: font.size.sm, fontFamily: font.family,
}

/** The dance picker's value: a dance, or '' for none. */
export function DanceSelect({ value, onChange, label }: {
  value: GreetDance | null
  onChange: (dance: GreetDance | null) => void
  label: string
}) {
  const { t } = useTranslation()
  return (
    <select
      aria-label={label}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value as GreetDance)}
      style={fieldStyle}
    >
      {GREET_DANCES.map((d) => <option key={d} value={d}>{t(`command.gestures.${d}`)}</option>)}
      <option value="">{t('greeter.greet.noDance')}</option>
    </select>
  )
}

type Choice = { kind: 'saved'; id: string } | { kind: 'custom' }

/**
 * Speak's Greet tab (schema 0.0.36): pick a saved greeting or type one, pick a
 * dance (Groove, or none), press Greet. The greeting becomes a speech clip
 * exactly as Say makes one (`createSpokenClip`, the backend choosing the
 * Korean or English voice), then GREET {clip_id, dance, volume} goes through
 * the tracked command path: its progress is on the command toast, and a
 * refusal is shown here too, in words.
 *
 * Saved greetings are this viewer's, in the browser (useSavedGreetings):
 * editable, add and remove.
 */
export function GreetPanel({ robotId, availability, volume }: {
  robotId: string
  /** GREET's availability (commandPolicy): disabled with its reason otherwise. */
  availability: CommandAvailability
  volume: number
}) {
  const { t } = useTranslation()
  const createSpokenClip = useLiveOpsStore((s) => s.createSpokenClip)
  const dispatchCommandAsync = useLiveOpsStore((s) => s.dispatchCommandAsync)
  const [greetings, setGreetings] = useSavedGreetings()
  const [choice, setChoice] = useState<Choice>(() => (greetings[0] ? { kind: 'saved', id: greetings[0].id } : { kind: 'custom' }))
  const [custom, setCustom] = useState('')
  const [dance, setDance] = useState<GreetDance | null>('groove')
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [busy, setBusy] = useState<'making' | 'sending' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const chosen = choice.kind === 'saved' ? greetings.find((g) => g.id === choice.id)?.text ?? '' : custom.trim()
  const ready = availability.enabled && chosen.length > 0 && busy === null

  async function greet() {
    if (!ready) return
    setError(null)
    setBusy('making')
    let clipId: string
    try {
      clipId = (await createSpokenClip(robotId, chosen)).clip_id
    } catch (e) {
      // Same as Say: the backend's own words (e.g. no Korean voice installed).
      setError(e instanceof Error ? e.message : t('command.speak.synthFailed'))
      setBusy(null)
      return
    }
    setBusy('sending')
    const params: GreetParams = { clip_id: clipId, dance, volume }
    try {
      const { result, command } = await dispatchCommandAsync(
        robotId, 'GREET', t('greeter.greet.command', { label: greetingLabel(chosen) }), { ...params },
      )
      if (result === 'failed') {
        setError(command.failure_reason
          ? t('greeter.greet.refused', { reason: refusalText(t, command.failure_reason) })
          : t('greeter.greet.failed'))
      }
    } finally {
      setBusy(null)
    }
  }

  const rowStyle = (selected: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: space[1], borderRadius: radius.sm,
    background: selected ? color.accentDim : 'transparent',
  })

  return (
    <div data-greet-panel="" style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
      <div style={{ fontSize: font.size.xs, color: color.t3 }}>{t('greeter.greet.lead')}</div>

      <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.t2 }}>{t('greeter.greet.saved')}</div>
      <div role="radiogroup" aria-label={t('greeter.greet.saved')} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {greetings.length === 0 && (
          <div style={{ padding: '4px 2px', fontSize: font.size.xs, color: color.t3 }}>{t('greeter.greet.empty')}</div>
        )}
        {greetings.map((g) => {
          const selected = choice.kind === 'saved' && choice.id === g.id
          if (editing === g.id) {
            return (
              <div key={g.id} style={rowStyle(false)}>
                <input
                  value={editText}
                  maxLength={MAX_GREETING_CHARS}
                  aria-label={t('greeter.greet.editAria')}
                  onChange={(e) => setEditText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { setGreetings(editGreeting(greetings, g.id, editText)); setEditing(null) }
                    if (e.key === 'Escape') setEditing(null)
                  }}
                  style={fieldStyle}
                  autoFocus
                />
                <IconButton
                  icon={Check} size="sm" label={t('greeter.greet.done')}
                  onClick={() => { setGreetings(editGreeting(greetings, g.id, editText)); setEditing(null) }}
                />
              </div>
            )
          }
          return (
            <div key={g.id} style={rowStyle(selected)}>
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setChoice({ kind: 'saved', id: g.id })}
                style={{
                  flex: 1, minWidth: 0, textAlign: 'left', padding: '6px 8px', border: 'none', background: 'transparent',
                  color: selected ? color.t1 : color.t2, fontSize: font.size.sm, fontFamily: font.family, cursor: 'pointer',
                  fontWeight: selected ? font.weight.semibold : font.weight.regular,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {g.text}
              </button>
              <IconButton icon={Pencil} size="sm" label={t('greeter.greet.edit')} onClick={() => { setEditing(g.id); setEditText(g.text) }} />
              <IconButton
                icon={X} size="sm" label={t('greeter.greet.remove', { text: g.text })}
                onClick={() => {
                  setGreetings(removeGreeting(greetings, g.id))
                  if (selected) setChoice({ kind: 'custom' })
                }}
              />
            </div>
          )
        })}
      </div>

      <div style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.t2 }}>{t('greeter.greet.custom')}</div>
      <input
        value={custom}
        maxLength={MAX_GREETING_CHARS}
        placeholder={t('greeter.greet.customPlaceholder')}
        aria-label={t('greeter.greet.customAria')}
        onFocus={() => setChoice({ kind: 'custom' })}
        onChange={(e) => { setCustom(e.target.value); setChoice({ kind: 'custom' }) }}
        style={{ ...fieldStyle, background: choice.kind === 'custom' ? color.accentDim : color.card }}
      />
      {choice.kind === 'custom' && custom.trim() && !greetings.some((g) => g.text === custom.trim()) && (
        <Button
          size="sm" variant="ghost" icon={Plus}
          onClick={() => {
            const next = addGreeting(greetings, custom)
            setGreetings(next)
            const added = next[next.length - 1]
            if (added) setChoice({ kind: 'saved', id: added.id })
            setCustom('')
          }}
        >
          {t('greeter.greet.add')}
        </Button>
      )}

      <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.t2 }}>
        {t('greeter.greet.dance')}
        <DanceSelect value={dance} onChange={setDance} label={t('greeter.greet.dance')} />
      </label>

      <DisabledReasonButton
        enabled={ready}
        reason={!availability.enabled ? (availability.reason ?? '') : busy ? t(`greeter.greet.${busy}`) : t('greeter.greet.pickOne')}
        onClick={() => void greet()}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
          width: '100%', height: 32, padding: '0 8px', borderRadius: radius.sm,
          background: ready ? color.accentDim : color.card, border: 'none',
          color: color.t1, fontSize: font.size.sm, fontWeight: font.weight.semibold, fontFamily: font.family,
        }}
      >
        <Hand size={14} strokeWidth={1.75} color={color.accent} aria-hidden />
        {busy ? t(`greeter.greet.${busy}`) : t('greeter.greet.button')}
      </DisabledReasonButton>
      {!availability.enabled && availability.reason && (
        <div data-greet-blocked="" style={{ fontSize: font.size.xs, color: color.t3 }}>{availability.reason}</div>
      )}
      {error && <div role="alert" style={{ fontSize: font.size.xs, color: color.red }}>{error}</div>}
    </div>
  )
}
