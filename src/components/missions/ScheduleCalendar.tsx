import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge, Button, IconButton } from '@/components/kit'
import { addDays, todayIn, weekStart } from '@/missions/schedule'
import { bucketByDay, describeOccurrence, siteMinutes, weekWindow } from '@/missions/calendarDays'
import { useTaskStore } from '@/missions/useTaskStore'
import type { MissionLibraryEntry, RobotState } from '@/types'
import { hhmm, weekdayNames } from './scheduleText'
import { inputStyle } from './parts'

/** A few distinguishable tints, one per robot, so a robot's runs read as a
 * set across the week. */
const ROBOT_TINTS = ['#0a84ff', '#30d158', '#bf5af2', '#ff9f0a', '#32ade6', '#ff375f']

/**
 * The site's week of scheduled runs (docs/05-ui-ux.md §11.5). It reads the
 * server's task queue and works nothing out: the backend decides when each run
 * is due and what became of it, including a robot that was busy. Days are the
 * site's own days, in its timezone. While no executor exists every run is
 * shown as waiting on the navigation backpack, never as a failure.
 * The reasoning lives in missions/calendarDays.ts, which is tested.
 */
export function ScheduleCalendar({ siteId, missions, robots, timezone, onOpen }: {
  siteId: string
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
  const { tasks, occurrences, loading, error, load } = useTaskStore()
  const days = useMemo(() => Array.from({ length: 7 }, (_, d) => addDays(monday, d)), [monday])
  const { from, to } = useMemo(() => weekWindow(monday, timezone), [monday, timezone])
  useEffect(() => { void load(siteId, from, to) }, [siteId, from, to, load])
  const byDay = useMemo(() => bucketByDay(occurrences, days, timezone), [occurrences, days, timezone])
  const missionName = (id: string) => missions.find((m) => m.mission_id === id)?.name ?? t('missions.calendar.unknownMission')
  const names = weekdayNames()
  const tint = (robotId: string | null) => {
    const i = robots.findIndex((r) => r.robot_id === robotId)
    return i < 0 ? color.t3 : ROBOT_TINTS[i % ROBOT_TINTS.length]
  }
  const robotName = (id: string | null) => robots.find((r) => r.robot_id === id)?.name ?? t('missions.library.anyRobot')
  const unscheduled = missions.filter((m) => !tasks.some((k) => k.mission_id === m.mission_id && k.schedule))

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, padding: `${space[4]}px ${space[5]}px`, gap: space[3] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
        <IconButton icon={ChevronLeft} label={t('missions.calendar.prev')} onClick={() => setMonday(addDays(monday, -7))} bordered />
        <IconButton icon={ChevronRight} label={t('missions.calendar.next')} onClick={() => setMonday(addDays(monday, 7))} bordered />
        <Button size="sm" onClick={() => setMonday(weekStart(today))} disabled={monday === weekStart(today)}>{t('missions.calendar.thisWeek')}</Button>
        <span style={{ fontSize: font.size.lg, fontWeight: font.weight.semibold, color: color.t1, marginLeft: space[2] }}>
          {t('missions.calendar.range', { from: monday, to: addDays(monday, 6) })}
        </span>
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

      {error && (
        <div role="alert" style={{ padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.md, background: color.redBg, fontSize: font.size.md, color: color.t1 }}>
          {t('missions.calendar.loadFailed', { error })}
        </div>
      )}
      {!error && !loading && occurrences.length === 0 && (
        <div style={{ fontSize: font.size.md, color: color.t3 }}>{t('missions.calendar.emptyWeek')}</div>
      )}

      <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(130px, 1fr))', gap: space[2], minWidth: 920 }}>
          {days.map((date, d) => {
            const runs = byDay[date]
            const isToday = date === today
            return (
              <div key={date} style={{
                display: 'flex', flexDirection: 'column', gap: space[1], minHeight: 280, padding: space[2],
                // No outlines: surfaces and tints separate things. Today gets a
                // faint accent wash instead of a border.
                borderRadius: radius.md, background: isToday ? color.accentDim : color.card,
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], padding: `0 ${space[1]}px ${space[1]}px` }}>
                  <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: isToday ? color.accent : color.t1 }}>{names[d]}</span>
                  <span style={{ fontSize: font.size.sm, color: color.t3, fontVariantNumeric: 'tabular-nums' }}>{date.slice(5)}</span>
                </div>
                {runs.map((o) => {
                  const view = describeOccurrence(o)
                  const start = siteMinutes(o.due_at, timezone)
                  return (
                    <button
                      key={o.occurrence_id} type="button" onClick={() => onOpen(o.mission_id)}
                      title={o.message ?? undefined}
                      style={{
                        display: 'grid', gap: 2, textAlign: 'left', padding: `${space[1]}px ${space[2]}px`, cursor: 'pointer',
                        borderRadius: radius.sm, fontFamily: font.family, border: 'none', background: color.surface,
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: space[1], flexWrap: 'wrap' }}>
                        <span style={{ fontSize: font.size.sm, color: color.t2, fontVariantNumeric: 'tabular-nums' }}>{start === null ? '—' : hhmm(start)}</span>
                        <Badge tone={view.tone}>{t(view.statusKey)}</Badge>
                      </span>
                      <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{missionName(o.mission_id)}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: font.size.xs, color: color.t3 }}>
                        <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: tint(o.robot_id), flexShrink: 0 }} />
                        {robotName(o.robot_id)}
                      </span>
                      {view.reasonKey && <span style={{ fontSize: font.size.xs, color: color.t3 }}>{t(view.reasonKey)}</span>}
                    </button>
                  )
                })}
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
