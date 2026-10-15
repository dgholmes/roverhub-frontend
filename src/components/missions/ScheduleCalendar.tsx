import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge, Button, IconButton } from '@/components/kit'
import { addDays, occurrencesInWeek, todayIn, weekStart } from '@/missions/schedule'
import type { MissionLibraryEntry, RobotState } from '@/types'
import { hhmm, weekdayNames } from './scheduleText'
import { inputStyle } from './parts'

/** A few distinguishable tints, one per robot, so a robot's runs read as a
 * set across the week. */
const ROBOT_TINTS = ['#0a84ff', '#30d158', '#bf5af2', '#ff9f0a', '#32ade6', '#ff375f']

/**
 * The site's week of scheduled runs (docs/05-ui-ux.md §11.5). Planning only:
 * nothing is dispatched until the mission executor exists. Days are the
 * site's own days, in its timezone. Runs of the same robot that overlap are
 * marked, since one robot can't do both.
 */
export function ScheduleCalendar({ missions, robots, timezone, onOpen }: {
  missions: MissionLibraryEntry[]
  robots: RobotState[]
  timezone: string
  /** Open a mission's editor on its Rules tab. */
  onOpen: (missionId: string) => void
}) {
  const { t } = useTranslation()
  const today = todayIn(timezone)
  const [monday, setMonday] = useState(() => weekStart(today))
  const [pick, setPick] = useState('')
  const occ = useMemo(() => occurrencesInWeek(missions, monday), [missions, monday])
  const names = weekdayNames()
  const tint = (robotId: string | null) => {
    const i = robots.findIndex((r) => r.robot_id === robotId)
    return i < 0 ? color.t3 : ROBOT_TINTS[i % ROBOT_TINTS.length]
  }
  const robotName = (id: string | null) => robots.find((r) => r.robot_id === id)?.name ?? t('missions.library.anyRobot')
  const clashes = occ.filter((o) => o.clash).length
  const unscheduled = missions.filter((m) => !m.schedule)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: `${space[4]}px ${space[5]}px`, gap: space[3] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
        <IconButton icon={ChevronLeft} label={t('missions.calendar.prev')} onClick={() => setMonday(addDays(monday, -7))} bordered />
        <IconButton icon={ChevronRight} label={t('missions.calendar.next')} onClick={() => setMonday(addDays(monday, 7))} bordered />
        <Button size="sm" onClick={() => setMonday(weekStart(today))} disabled={monday === weekStart(today)}>{t('missions.calendar.thisWeek')}</Button>
        <span style={{ fontSize: font.size.lg, fontWeight: font.weight.semibold, color: color.t1, marginLeft: space[2] }}>
          {t('missions.calendar.range', { from: monday, to: addDays(monday, 6) })}
        </span>
        {clashes > 0 && <Badge tone="red">{t('missions.calendar.clashes', { count: clashes })}</Badge>}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: font.size.sm, color: color.t3 }}>{t('missions.rules.timezone', { tz: timezone })}</span>
        {unscheduled.length > 0 && (
          <select
            value={pick} aria-label={t('missions.calendar.schedule')}
            onChange={(e) => { setPick(''); if (e.target.value) onOpen(e.target.value) }}
            style={{ ...inputStyle, width: 220 }}
          >
            <option value="">{t('missions.calendar.schedule')}</option>
            {unscheduled.map((m) => <option key={m.mission_id} value={m.mission_id}>{m.name}</option>)}
          </select>
        )}
      </div>

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(130px, 1fr))', gap: space[2], minWidth: 920 }}>
          {Array.from({ length: 7 }, (_, d) => {
            const date = addDays(monday, d)
            const runs = occ.filter((o) => o.date === date)
            const isToday = date === today
            return (
              <div key={date} style={{
                display: 'flex', flexDirection: 'column', gap: space[1], minHeight: 280, padding: space[2],
                borderRadius: radius.md, background: color.card, border: `1px solid ${isToday ? color.accentBorder : color.border}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], padding: `0 ${space[1]}px ${space[1]}px` }}>
                  <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: isToday ? color.accent : color.t1 }}>{names[d]}</span>
                  <span style={{ fontSize: font.size.sm, color: color.t3, fontVariantNumeric: 'tabular-nums' }}>{date.slice(5)}</span>
                </div>
                {runs.map((o, i) => (
                  <button
                    key={`${o.mission.mission_id}-${i}`} type="button" onClick={() => onOpen(o.mission.mission_id)}
                    title={o.clash ? t('missions.calendar.clashTitle') : undefined}
                    style={{
                      display: 'grid', gap: 2, textAlign: 'left', padding: `${space[1]}px ${space[2]}px`, cursor: 'pointer',
                      borderRadius: radius.sm, fontFamily: font.family, background: color.surface,
                      border: `1px solid ${o.clash ? color.red : color.border}`, borderLeft: `3px solid ${tint(o.robot_id)}`,
                    }}
                  >
                    <span style={{ fontSize: font.size.sm, color: o.clash ? color.red : color.t2, fontVariantNumeric: 'tabular-nums' }}>
                      {hhmm(o.startMin)}–{hhmm(Math.min(24 * 60 - 1, o.startMin + o.durationMin))}
                    </span>
                    <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.mission.name}</span>
                    <span style={{ fontSize: font.size.xs, color: color.t3 }}>{robotName(o.robot_id)}</span>
                  </button>
                ))}
              </div>
            )
          })}
        </div>
      </div>
      <div style={{ fontSize: font.size.sm, color: color.t3 }}>
        <Badge tone="amber">{t('missions.cantRun')}</Badge>{' '}{t('missions.calendar.note')}
      </div>
    </div>
  )
}
