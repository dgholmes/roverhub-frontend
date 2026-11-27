import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, Plus, Sparkles, X } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Button, IconButton, Segmented } from '@/components/kit'
import { followOpen, moveWaypointAction, newWaypointAction, removeWaypointAction, WAYPOINT_ACTION_TYPES, updateWaypointAction } from '@/missions/waypointActions'
import {
  HELD_DEFAULT_SECONDS, HELD_MAX_SECONDS, HELD_MIN_SECONDS, isAirborneQuickAction, isHeldQuickAction, moveLengthText,
  newQuickAction, quickActionSeconds, quickActionState, waypointMoveSpec, withQuickActionMove,
} from '@/missions/quickActions'
import { gestureLabel } from '@/liveops/postureModel'
import type { Camera, WaypointAction, WaypointActionType } from '@/types'
import { ClipMaker } from './ClipMaker'
import { NumberInput, ReadOnlyForm } from './parts'
import { ClearSpaceWarning, QuickActionPicker } from './QuickActionPicker'

/** What happens at a stop, in order. A list rather than toggles, so a stop
 * can have two photos, or a photo after an announcement. */
export function WaypointActionList({ siteId, ownerId, actions, onChange, readOnly = false }: {
  siteId: string
  ownerId: string
  actions: WaypointAction[]
  onChange: (actions: WaypointAction[]) => void
  /** Read the actions without changing them (the touch console, M4 §7.6.3).
   * Reordering, removing and adding go. A row still opens, and what is inside
   * is still drawn: the summary line does not say which camera a photo takes
   * or what an announcement says, so sealing the rows would remove reading. */
  readOnly?: boolean
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<number | null>(null)
  // Bumped on every reorder so a row's ClipMaker never carries state across actions.
  const [rev, setRev] = useState(0)
  // The Quick action picker, open under the add buttons until a move is picked.
  const [picking, setPicking] = useState(false)
  const tx = t as unknown as (key: string, options?: Record<string, unknown>) => string
  const move = (from: number, to: number) => {
    onChange(moveWaypointAction(actions, from, to)); setOpen(followOpen(open, from, to)); setRev((r) => r + 1)
  }
  const label = (type: WaypointActionType) => t(`missions.actions.${type}`)
  const camera = (a: WaypointAction, i: number) => (
    <Segmented<Camera> label={t('missions.actions.camera')} value={(a.params.camera as Camera) ?? 'front'}
      onChange={(camera) => onChange(updateWaypointAction(actions, i, { camera }))}
      options={[{ value: 'front', label: t('missions.actions.front') }, { value: 'rear', label: t('missions.actions.rear') }]} />
  )
  const cam = (a: WaypointAction): Camera => (a.params.camera as Camera) ?? 'front'
  const summary = (a: WaypointAction) => {
    switch (a.type) {
      case 'snapshot': return t(`missions.actions.${cam(a)}`)
      case 'video_clip': return `${a.params.seconds ?? 15} s · ${t(`missions.actions.${cam(a)}`)}`
      case 'voice_prompt': return a.params.clip_id ? String(a.params.text ?? t('missions.clip.ready')) : t('missions.actions.noClip')
      case 'wait': return `${a.params.seconds ?? 10} s`
      case 'quick_action': {
        const state = quickActionState(a)
        if (!state || !waypointMoveSpec(state)) return state ?? t('missions.actions.quick.noMove')
        return `${gestureLabel(state)} · ${moveLengthText(tx, quickActionSeconds(a))}`
      }
      default: return ''
    }
  }

  return (
    <div style={{ display: 'grid', gap: space[1] }}>
      {actions.map((a, i) => (
        <div key={i} style={{ borderRadius: radius.md, background: color.card, padding: space[2] }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
            {/* Deliberately outside the read-only form below: opening a row is
                how it is read. */}
            <button type="button" data-action-row={i} aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}
              style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: font.family, padding: 0 }}>
              <span style={{ display: 'block', fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1 }}>{label(a.type)}</span>
              <span style={{ display: 'block', fontSize: font.size.sm, color: (a.type === 'voice_prompt' && !a.params.clip_id) || (a.type === 'quick_action' && !waypointMoveSpec(quickActionState(a) ?? '')) ? color.red : color.t2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary(a)}</span>
              {isAirborneQuickAction(a) && <ClearSpaceWarning />}
            </button>
            {!readOnly && <>
              <IconButton icon={ArrowUp} size="sm" label={t('missions.editor.moveUp')} disabled={i === 0} onClick={() => move(i, i - 1)} />
              <IconButton icon={ArrowDown} size="sm" label={t('missions.editor.moveDown')} disabled={i === actions.length - 1} onClick={() => move(i, i + 1)} />
              <IconButton icon={X} size="sm" label={t('missions.actions.remove')} onClick={() => { onChange(removeWaypointAction(actions, i)); setOpen(null); setRev((r) => r + 1) }} />
            </>}
          </div>
          {open === i && (
            <ReadOnlyForm on={readOnly}>
              <div style={{ display: 'grid', gap: space[2], marginTop: space[2] }}>
                {(a.type === 'snapshot' || a.type === 'video_clip') && camera(a, i)}
                {a.type === 'video_clip' && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.sm, color: color.t2 }}>
                    {t('missions.actions.seconds')}
                    <NumberInput value={(a.params.seconds as number) ?? 15} min={5} max={120} step={5} onChange={(v) => onChange(updateWaypointAction(actions, i, { seconds: v ?? 15 }))} />
                  </label>
                )}
                {a.type === 'wait' && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.sm, color: color.t2 }}>
                    {t('missions.actions.seconds')}
                    <NumberInput value={(a.params.seconds as number) ?? 10} min={1} max={600} step={5} onChange={(v) => onChange(updateWaypointAction(actions, i, { seconds: v ?? 10 }))} />
                  </label>
                )}
                {a.type === 'quick_action' && (
                  <>
                    <QuickActionPicker label={t('missions.actions.quick.pick')} value={quickActionState(a)}
                      onPick={(state) => onChange(actions.map((x, k) => (k === i ? withQuickActionMove(x, state) : x)))} />
                    {isHeldQuickAction(a) && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.sm, color: color.t2 }}>
                        {t('missions.actions.quick.duration')}
                        <NumberInput value={(a.params.seconds as number) ?? HELD_DEFAULT_SECONDS} min={HELD_MIN_SECONDS} max={HELD_MAX_SECONDS} step={1}
                          onChange={(v) => onChange(updateWaypointAction(actions, i, {
                            seconds: v === null ? HELD_DEFAULT_SECONDS : Math.min(HELD_MAX_SECONDS, Math.max(HELD_MIN_SECONDS, v)),
                          }))} />
                      </label>
                    )}
                  </>
                )}
                {a.type === 'voice_prompt' && (
                  <>
                    <ClipMaker key={`${i}-${rev}`} siteId={siteId} ownerId={ownerId}
                      value={{ clip_id: (a.params.clip_id as string) ?? null, text: (a.params.text as string) ?? null }}
                      onChange={(v) => onChange(updateWaypointAction(actions, i, { clip_id: v.clip_id, text: v.text ?? v.label }))} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.sm, color: color.t2 }}>
                      {t('missions.actions.volume')}
                      <NumberInput value={(a.params.volume as number) ?? 100} min={0} max={100} step={10} onChange={(v) => onChange(updateWaypointAction(actions, i, { volume: v ?? 100 }))} />
                    </label>
                  </>
                )}
              </div>
            </ReadOnlyForm>
          )}
        </div>
      ))}
      {!readOnly && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[1], marginTop: space[1] }}>
          {WAYPOINT_ACTION_TYPES.map((type) => (
            <Button key={type} size="sm" variant="ghost" icon={Plus}
              onClick={() => { onChange([...actions, newWaypointAction(type, label(type))]); setOpen(actions.length) }}>{label(type)}</Button>
          ))}
          <Button size="sm" variant="ghost" icon={Sparkles} aria-expanded={picking} data-add-quick-action=""
            onClick={() => setPicking((p) => !p)}>{label('quick_action')}</Button>
          <Button size="sm" variant="ghost" disabled title={t('missions.inspector.thermalUnavailable')}>{t('missions.actions.thermal_scan')}</Button>
        </div>
      )}
      {!readOnly && picking && (
        <div style={{ borderRadius: radius.md, background: color.card, padding: space[2], display: 'grid', gap: space[1] }}>
          <span style={{ fontSize: font.size.sm, color: color.t2 }}>{t('missions.actions.quick.pick')}</span>
          <QuickActionPicker label={t('missions.actions.quick.pick')} onPick={(state) => {
            onChange([...actions, newQuickAction(state)]); setOpen(actions.length); setPicking(false)
          }} />
        </div>
      )}
    </div>
  )
}
