import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import i18n from '@/i18n'
import { color, font, space } from '@/design-system/tokens'
import { Badge } from '@/components/kit'
import { robotTypeLabel } from '@/lib/robotCapabilities'
import type { MissionLibraryEntry, RobotState } from '@/types'
import { ChecksBadge, formatDuration, formatLength, inputStyle } from './parts'
import { scheduleSummary } from './scheduleText'
import { AvailabilityDot, useRobotAvailability } from './RobotPicker'

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (sec < 3600) return i18n.t('missions.library.ageMinutes', { n: Math.max(1, Math.round(sec / 60)) })
  if (sec < 86400) return i18n.t('missions.library.ageHours', { n: Math.round(sec / 3600) })
  return i18n.t('missions.library.ageDays', { n: Math.round(sec / 86400) })
}

const COLS = 'minmax(220px, 2fr) 110px minmax(140px, 1fr) 120px minmax(150px, 1.2fr) 130px 90px'

/**
 * The site's missions as a table (docs/05-ui-ux.md §11.1): what each is, who
 * runs it, whether it passes its checks, when it's scheduled. Opening a row
 * opens the editor.
 */
export function MissionLibraryView({ missions, robots, onOpen }: {
  missions: MissionLibraryEntry[]
  robots: RobotState[]
  onOpen: (missionId: string) => void
}) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return [...missions]
      .filter((m) => !needle || m.name.toLowerCase().includes(needle))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  }, [missions, q])
  const robotName = (id: string | undefined) => robots.find((r) => r.robot_id === id)
  const availability = useRobotAvailability(robots)

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: `${space[4]}px ${space[5]}px` }}>
      <div style={{ position: 'relative', maxWidth: 320, marginBottom: space[3] }}>
        <Search size={14} color={color.t3} aria-hidden style={{ position: 'absolute', left: 10, top: 9 }} />
        <input
          value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('missions.library.search')}
          aria-label={t('missions.library.search')} style={{ ...inputStyle, width: '100%', paddingLeft: 30 }}
        />
      </div>
      <div role="table" style={{ minWidth: 960 }}>
        <div role="row" style={{
          display: 'grid', gridTemplateColumns: COLS, gap: space[3], padding: `${space[2]}px ${space[3]}px`,
          fontSize: font.size.sm, color: color.t3, borderBottom: `1px solid ${color.border}`,
        }}>
          {(['name', 'type', 'robot', 'checks', 'schedule', 'length', 'edited'] as const).map((c) => (
            <span role="columnheader" key={c}>{t(`missions.library.col.${c}`)}</span>
          ))}
        </div>
        {shown.map((m) => {
          const r = robotName(m.robot_id)
          return (
            <button
              key={m.mission_id} role="row" type="button" onClick={() => onOpen(m.mission_id)}
              style={{
                display: 'grid', gridTemplateColumns: COLS, gap: space[3], alignItems: 'center', width: '100%',
                padding: `${space[3]}px`, background: 'transparent', border: 'none', borderBottom: `1px solid ${color.border}`,
                textAlign: 'left', cursor: 'pointer', fontFamily: font.family, fontSize: font.size.md, color: color.t1,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = color.selected }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ fontWeight: font.weight.semibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</span>
              <span style={{ color: color.t2 }}>{t(`command.taskBar.missionType.${m.type}`)}</span>
              <span style={{ color: r ? color.t1 : color.t3, display: 'inline-flex', alignItems: 'center', gap: space[2], minWidth: 0 }}>
                {r && availability.get(r.robot_id) && <AvailabilityDot availability={availability.get(r.robot_id)!} />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r ? `${r.name} · ${robotTypeLabel(r.robot_type)}` : t('missions.library.anyRobot')}
                </span>
              </span>
              <span><ChecksBadge validation={m.validation} /></span>
              <span style={{ color: m.schedule ? color.t1 : color.t3 }}>{m.schedule ? scheduleSummary(m.schedule) : t('missions.library.notScheduled')}</span>
              <span style={{ color: color.t2, fontVariantNumeric: 'tabular-nums' }}>
                {formatLength(m.estimates?.length_m)} · {formatDuration(m.estimates?.duration_s)}
              </span>
              <span style={{ color: color.t3 }}>{timeAgo(m.updated_at)}</span>
            </button>
          )
        })}
        {shown.length === 0 && (
          <div style={{ padding: space[6], color: color.t3, fontSize: font.size.md }}>
            {missions.length === 0 ? t('missions.library.empty') : t('missions.library.noMatch')}
          </div>
        )}
      </div>
      <div style={{ marginTop: space[4] }}><Badge tone="amber">{t('missions.cantRun')}</Badge>{' '}
        <span style={{ fontSize: font.size.sm, color: color.t3 }}>{t('missions.cantRunWhy')}</span>
      </div>
    </div>
  )
}
