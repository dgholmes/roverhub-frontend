import { useTranslation } from 'react-i18next'
import { Plus, Trash2 } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Button, IconButton } from '@/components/kit'
import type { MissionLibraryEntry, TimedAnnouncement } from '@/types'
import { ClipMaker } from './ClipMaker'
import { Check, Field, IssueList, NumberInput, inputStyle } from './parts'

/** Announcements at a clock time while a run is in progress (spec §5.2). */
export function MissionAnnouncements({ mission, siteId, timezone, onChange }: {
  mission: MissionLibraryEntry
  siteId: string
  timezone: string
  onChange: (patch: Partial<MissionLibraryEntry>) => void
}) {
  const { t } = useTranslation()
  const list = mission.announcements ?? []
  const set = (i: number, p: Partial<TimedAnnouncement>) => onChange({ announcements: list.map((a, j) => (j === i ? { ...a, ...p } : a)) })
  const add = () => onChange({ announcements: [...list, {
    announcement_id: `ann-${Date.now().toString(36)}`, clip_id: '', text: null, volume: 100, at: '09:00', repeat_every_min: null, until: null,
  }] })
  const issues = (mission.validation?.issues ?? []).filter((i) => i.code === 'timedOutsideWindow' || i.code === 'timedNoClip')

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: `${space[5]}px ${space[6]}px`, display: 'grid', gap: space[4], alignContent: 'start', maxWidth: 760 }}>
      <p style={{ margin: 0, fontSize: font.size.md, color: color.t2, lineHeight: 1.5 }}>{t('missions.ann.intro', { tz: timezone })}</p>
      {list.map((a, i) => (
        <div key={a.announcement_id} style={{ display: 'grid', gap: space[3], padding: space[4], borderRadius: radius.md, background: color.card }}>
          <div style={{ display: 'flex', gap: space[3], flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <Field label={t('missions.ann.at')}>
              <input type="time" value={a.at} onChange={(e) => e.target.value && set(i, { at: e.target.value })} style={inputStyle} />
            </Field>
            <Check label={t('missions.ann.repeat')} checked={a.repeat_every_min !== null}
              onChange={(on) => set(i, { repeat_every_min: on ? 15 : null, until: on ? a.until ?? null : null })} />
            {a.repeat_every_min !== null && (
              <>
                <Field label={t('missions.ann.every')}>
                  <NumberInput value={a.repeat_every_min} min={1} max={1440} step={5} onChange={(v) => set(i, { repeat_every_min: v ?? 15 })} />
                </Field>
                <Field label={t('missions.ann.until')}>
                  <input type="time" value={a.until ?? ''} onChange={(e) => set(i, { until: e.target.value || null })} style={inputStyle} />
                </Field>
              </>
            )}
            <span style={{ flex: 1 }} />
            <IconButton icon={Trash2} label={t('missions.ann.remove')} onClick={() => onChange({ announcements: list.filter((_, j) => j !== i) })} />
          </div>
          <ClipMaker siteId={siteId} ownerId={mission.robot_id ?? `site-${siteId}`}
            value={{ clip_id: a.clip_id || null, text: a.text }}
            onChange={(v) => set(i, { clip_id: v.clip_id, text: v.text ?? v.label })} />
        </div>
      ))}
      <div><Button icon={Plus} onClick={add}>{t('missions.ann.add')}</Button></div>
      {issues.length > 0 && <IssueList issues={issues} />}
    </div>
  )
}
