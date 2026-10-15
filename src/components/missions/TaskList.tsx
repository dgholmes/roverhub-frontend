import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Button, IconButton, Segmented } from '@/components/kit'
import { followOpen, moveTask, newTask, removeTask, TASK_TYPES, updateTask } from '@/missions/tasks'
import type { Camera, WaypointAction, WaypointActionType } from '@/types'
import { ClipMaker } from './ClipMaker'
import { NumberInput } from './parts'

/** What happens at a stop, in order. A list rather than toggles, so a stop
 * can have two photos, or a photo after an announcement. */
export function TaskList({ siteId, ownerId, actions, onChange }: {
  siteId: string
  ownerId: string
  actions: WaypointAction[]
  onChange: (actions: WaypointAction[]) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<number | null>(null)
  // Bumped on every reorder so a row's ClipMaker never carries state across tasks.
  const [rev, setRev] = useState(0)
  const move = (from: number, to: number) => {
    onChange(moveTask(actions, from, to)); setOpen(followOpen(open, from, to)); setRev((r) => r + 1)
  }
  const label = (type: WaypointActionType) => t(`missions.actions.${type}`)
  const camera = (a: WaypointAction, i: number) => (
    <Segmented<Camera> label={t('missions.task.camera')} value={(a.params.camera as Camera) ?? 'front'}
      onChange={(camera) => onChange(updateTask(actions, i, { camera }))}
      options={[{ value: 'front', label: t('missions.task.front') }, { value: 'rear', label: t('missions.task.rear') }]} />
  )
  const cam = (a: WaypointAction): Camera => (a.params.camera as Camera) ?? 'front'
  const summary = (a: WaypointAction) => {
    switch (a.type) {
      case 'snapshot': return t(`missions.task.${cam(a)}`)
      case 'video_clip': return `${a.params.seconds ?? 15} s · ${t(`missions.task.${cam(a)}`)}`
      case 'voice_prompt': return a.params.clip_id ? String(a.params.text ?? t('missions.clip.ready')) : t('missions.task.noClip')
      case 'wait': return `${a.params.seconds ?? 10} s`
      default: return ''
    }
  }

  return (
    <div style={{ display: 'grid', gap: space[1] }}>
      {actions.map((a, i) => (
        <div key={i} style={{ borderRadius: radius.md, background: color.card, padding: space[2] }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
            <button type="button" onClick={() => setOpen(open === i ? null : i)}
              style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', fontFamily: font.family, padding: 0 }}>
              <span style={{ display: 'block', fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1 }}>{label(a.type)}</span>
              <span style={{ display: 'block', fontSize: font.size.sm, color: a.type === 'voice_prompt' && !a.params.clip_id ? color.red : color.t2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary(a)}</span>
            </button>
            <IconButton icon={ArrowUp} size="sm" label={t('missions.editor.moveUp')} disabled={i === 0} onClick={() => move(i, i - 1)} />
            <IconButton icon={ArrowDown} size="sm" label={t('missions.editor.moveDown')} disabled={i === actions.length - 1} onClick={() => move(i, i + 1)} />
            <IconButton icon={X} size="sm" label={t('missions.task.remove')} onClick={() => { onChange(removeTask(actions, i)); setOpen(null); setRev((r) => r + 1) }} />
          </div>
          {open === i && (
            <div style={{ display: 'grid', gap: space[2], marginTop: space[2] }}>
              {(a.type === 'snapshot' || a.type === 'video_clip') && camera(a, i)}
              {a.type === 'video_clip' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.sm, color: color.t2 }}>
                  {t('missions.task.seconds')}
                  <NumberInput value={(a.params.seconds as number) ?? 15} min={5} max={120} step={5} onChange={(v) => onChange(updateTask(actions, i, { seconds: v ?? 15 }))} />
                </label>
              )}
              {a.type === 'wait' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.sm, color: color.t2 }}>
                  {t('missions.task.seconds')}
                  <NumberInput value={(a.params.seconds as number) ?? 10} min={1} max={600} step={5} onChange={(v) => onChange(updateTask(actions, i, { seconds: v ?? 10 }))} />
                </label>
              )}
              {a.type === 'voice_prompt' && (
                <>
                  <ClipMaker key={`${i}-${rev}`} siteId={siteId} ownerId={ownerId}
                    value={{ clip_id: (a.params.clip_id as string) ?? null, text: (a.params.text as string) ?? null }}
                    onChange={(v) => onChange(updateTask(actions, i, { clip_id: v.clip_id, text: v.text ?? v.label }))} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.sm, color: color.t2 }}>
                    {t('missions.task.volume')}
                    <NumberInput value={(a.params.volume as number) ?? 100} min={0} max={100} step={10} onChange={(v) => onChange(updateTask(actions, i, { volume: v ?? 100 }))} />
                  </label>
                </>
              )}
            </div>
          )}
        </div>
      ))}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[1], marginTop: space[1] }}>
        {TASK_TYPES.map((type) => (
          <Button key={type} size="sm" variant="ghost" icon={Plus}
            onClick={() => { onChange([...actions, newTask(type, label(type))]); setOpen(actions.length) }}>{label(type)}</Button>
        ))}
        <Button size="sm" variant="ghost" disabled title={t('missions.inspector.thermalUnavailable')}>{t('missions.actions.thermal_scan')}</Button>
      </div>
    </div>
  )
}
