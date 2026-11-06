import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge, Segmented } from '@/components/kit'
import { InfoChip } from '@/components/common/InfoChip'
import { NameLink, RobotLink } from '@/components/common/NameLink'
import { hashForSiteRun } from '@/app/routes'
import { batteryLevelColor, formatBatteryPercent } from '@/liveops/batteryDisplay'
import { robotActivity } from '@/liveops/robotActivity'
import { describeOccurrence, siteDate, siteMinutes } from '@/missions/calendarDays'
import { findClashes, isPending, nextRunFor, runsWindow, splitRuns, type DayGroup } from '@/missions/runsByDay'
import { addDays, todayIn } from '@/missions/schedule'
import { hhmm } from '@/missions/scheduleText'
import { useTaskStore } from '@/missions/useTaskStore'
import type { MissionLibraryEntry, RobotState, TaskOccurrence } from '@/types'

type Tab = 'upcoming' | 'history'

const COLS = '76px 120px minmax(160px, 1.2fr) minmax(160px, 1.2fr) minmax(110px, 0.8fr) minmax(180px, 1.4fr) 96px'

/**
 * Schedule › Runs: what runs today and this week, on which robot, and what
 * clashes, with what happened over the past week under History. The default
 * Schedule view, because operators ask "what runs today" far more often than
 * "what tasks exist" (the Tasks table) -- FlightHub 2's task plan library.
 *
 * Like the calendar it reads the server's queue and works nothing out beyond
 * grouping and the clash warning (missions/runsByDay.ts, tested).
 */
export function ScheduleRunsView({ siteId, missions, robots, timezone, onEditTask, onOpenMission }: {
  siteId: string
  missions: MissionLibraryEntry[]
  robots: RobotState[]
  timezone: string
  onEditTask: (taskId: string) => void
  onOpenMission: (missionId: string) => void
}) {
  const { t, i18n } = useTranslation()
  const tx = t as unknown as (key: string, options?: Record<string, unknown>) => string
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  const today = todayIn(timezone, new Date(now))
  const { from, to } = useMemo(() => runsWindow(today, timezone), [today, timezone])
  const { tasks, occurrences, loading, error, load } = useTaskStore()
  useEffect(() => { void load(siteId, from, to) }, [siteId, from, to, load])

  const [tab, setTab] = useState<Tab>('upcoming')
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const toggle = (id: string) => setHidden((h) => {
    const next = new Set(h)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const missionById = useMemo(() => new Map(missions.map((m) => [m.mission_id, m])), [missions])
  const clashes = useMemo(
    () => findClashes(occurrences, (id) => missionById.get(id)?.estimates?.duration_s),
    [occurrences, missionById],
  )
  const visible = useMemo(
    () => occurrences.filter((o) => o.robot_id === null || !hidden.has(o.robot_id)),
    [occurrences, hidden],
  )
  const { upcoming, history } = useMemo(() => splitRuns(visible, today, timezone), [visible, today, timezone])
  const groups = tab === 'upcoming' ? upcoming : history
  // The first pending run from now on is "Next"; every other pending one is plain "Planned".
  const nextId = useMemo(() => {
    let best: TaskOccurrence | null = null
    for (const o of visible) if (isPending(o) && Date.parse(o.due_at) >= now && (!best || o.due_at < best.due_at)) best = o
    return best?.occurrence_id ?? null
  }, [visible, now])

  const taskName = (o: TaskOccurrence) => tasks.find((x) => x.task_id === o.task_id)?.name
    ?? missionById.get(o.mission_id)?.name ?? t('missions.calendar.unknownMission')
  const robotName = (id: string | null) => (id === null ? t('missions.tasks.noRobot') : robots.find((r) => r.robot_id === id)?.name ?? id)
  const hasTask = (taskId: string) => tasks.some((x) => x.task_id === taskId)

  const dayLabel = (date: string) => {
    const d = new Date(`${date}T12:00:00Z`)
    return new Intl.DateTimeFormat(i18n.language, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }).format(d)
  }
  const whenLabel = (o: TaskOccurrence) => {
    const date = siteDate(o.due_at, timezone)
    const min = siteMinutes(o.due_at, timezone)
    const time = min === null ? '—' : hhmm(min)
    if (date === today) return t('missions.runs.todayAt', { time })
    if (date === addDays(today, 1)) return t('missions.runs.tomorrowAt', { time })
    return date ? `${dayLabel(date)} ${time}` : time
  }

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
      {/* Robots: what each is doing and its next run; the boxes filter the list. */}
      <aside aria-label={t('missions.runs.robotsAria')} style={{ width: 280, flexShrink: 0, background: color.surface, overflowY: 'auto', padding: space[3], display: 'grid', alignContent: 'start', gap: space[2] }}>
        <div style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.t1, padding: `0 ${space[1]}px` }}>{t('missions.runs.robots')}</div>
        {robots.map((r) => {
          const shown = !hidden.has(r.robot_id)
          const activity = robotActivity(r)
          const next = nextRunFor(r.robot_id, occurrences, now)
          const toneColor = activity.tone === 'critical' ? color.red : activity.tone === 'warn' ? color.amber : color.t2
          return (
            <div key={r.robot_id} style={{ display: 'grid', gap: 4, padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.md, background: shown ? color.card : 'transparent', opacity: shown ? 1 : 0.6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: space[2], minWidth: 0 }}>
                <input
                  type="checkbox" checked={shown} onChange={() => toggle(r.robot_id)}
                  aria-label={t('missions.runs.showRobot', { name: r.name })} style={{ accentColor: 'var(--rh-accent)', margin: 0 }}
                />
                <span style={{ flex: 1, minWidth: 0, fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1 }}>
                  <RobotLink siteId={siteId} robotId={r.robot_id}>{r.name}</RobotLink>
                </span>
                <span style={{ fontSize: font.size.sm, color: batteryLevelColor(r.battery.percent), fontVariantNumeric: 'tabular-nums' }}>{formatBatteryPercent(r.battery.percent)}</span>
              </div>
              <span style={{ fontSize: font.size.sm, color: toneColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activity.text}</span>
              <span style={{ fontSize: font.size.sm, color: color.t3, background: color.surface, borderRadius: radius.sm, padding: `${space[1]}px ${space[2]}px`, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {next
                  ? <>{t('missions.runs.next')} · <b style={{ color: color.t1, fontWeight: font.weight.semibold }}>{whenLabel(next)}</b> {taskName(next)}</>
                  : t('missions.runs.noNext')}
              </span>
            </div>
          )
        })}
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0, padding: `${space[3]}px ${space[5]}px 0` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', marginBottom: space[2] }}>
          <Segmented<Tab>
            label={t('missions.runs.tabsAria')} value={tab} onChange={setTab}
            options={[
              { value: 'upcoming', label: t('missions.runs.upcoming') },
              { value: 'history', label: t('missions.runs.history') },
            ]}
          />
          <InfoChip label={t('missions.tasks.list.scheduledBadge')}>{t('missions.calendar.note')}</InfoChip>
          <span style={{ flex: 1 }} />
          <span style={{ fontSize: font.size.sm, color: color.t3 }}>{t('missions.tasks.timezone', { tz: timezone })}</span>
        </div>
        {error && (
          <div role="alert" style={{ padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.md, background: color.redBg, fontSize: font.size.md, color: color.t1, marginBottom: space[2] }}>
            {t('missions.calendar.loadFailed', { error })}
          </div>
        )}
        <div role="table" aria-label={t(`missions.runs.${tab}`)} style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
          <div role="row" style={{
            display: 'grid', gridTemplateColumns: COLS, gap: space[3], padding: `${space[2]}px ${space[3]}px`, minWidth: 1000,
            fontSize: font.size.sm, color: color.t3, position: 'sticky', top: 0, background: color.bg, zIndex: 1,
          }}>
            {(['time', 'status', 'task', 'mission', 'robot', 'note', 'actions'] as const).map((c) => (
              <span role="columnheader" key={c}>{c === 'actions' ? '' : t(`missions.runs.col.${c === 'note' && tab === 'history' ? 'outcome' : c}`)}</span>
            ))}
          </div>
          {groups.map((g) => (
            <Day key={g.date} group={g} isToday={g.date === today} label={dayLabel(g.date)}>
              {g.runs.map((o) => {
                const view = describeOccurrence(o)
                const clash = clashes.get(o.occurrence_id)
                const start = siteMinutes(o.due_at, timezone)
                const isNext = o.occurrence_id === nextId
                const mission = missionById.get(o.mission_id)
                const note = clash
                  ? t('missions.runs.clash', { other: taskName(clash) })
                  : view.detail ?? (view.reasonKey ? tx(view.reasonKey) : '')
                return (
                  <div key={o.occurrence_id} role="row" style={{
                    display: 'grid', gridTemplateColumns: COLS, gap: space[3], alignItems: 'center', minWidth: 1000,
                    padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.md, marginBottom: 2,
                    background: clash ? color.amberBg : color.card, fontSize: font.size.md, color: color.t1,
                  }}>
                    <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: font.weight.semibold }}>{start === null ? '—' : hhmm(start)}</span>
                    <span>
                      {clash ? <Badge tone="amber">{t('missions.runs.clashBadge')}</Badge>
                        : isNext ? <Badge tone="blue">{t('missions.runs.nextBadge')}</Badge>
                          : <Badge tone={view.tone} title={view.title ?? undefined}>{t(view.statusKey)}</Badge>}
                    </span>
                    <span style={{ minWidth: 0, fontWeight: font.weight.semibold }}>
                      {hasTask(o.task_id) ? <NameLink onClick={() => onEditTask(o.task_id)}>{taskName(o)}</NameLink> : taskName(o)}
                    </span>
                    <span style={{ minWidth: 0, color: color.t2 }}>
                      {mission ? <NameLink onClick={() => onOpenMission(mission.mission_id)}>{mission.name}</NameLink> : t('missions.calendar.unknownMission')}
                    </span>
                    <span style={{ minWidth: 0, color: color.t2 }}>
                      {o.robot_id && robots.some((r) => r.robot_id === o.robot_id)
                        ? <RobotLink siteId={siteId} robotId={o.robot_id}>{robotName(o.robot_id)}</RobotLink>
                        : <span style={{ color: o.robot_id ? color.t2 : color.amber }}>{robotName(o.robot_id)}</span>}
                    </span>
                    <span title={note || undefined} style={{ minWidth: 0, fontSize: font.size.sm, color: clash ? color.amber : color.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {note}
                    </span>
                    <span style={{ fontSize: font.size.sm }}>
                      {o.run_id && <a href={hashForSiteRun(siteId, o.run_id)} style={{ color: color.accent }}>{t('missions.runs.openRun')}</a>}
                    </span>
                  </div>
                )
              })}
            </Day>
          ))}
          {!loading && !error && groups.length === 0 && (
            <div style={{ padding: space[6], color: color.t3, fontSize: font.size.md }}>
              {tab === 'upcoming' ? t('missions.runs.emptyUpcoming') : t('missions.runs.emptyHistory')}
            </div>
          )}
          {loading && groups.length === 0 && (
            <div style={{ padding: space[6], color: color.t3, fontSize: font.size.md }}>{t('missions.calendar.loading')}</div>
          )}
        </div>
      </div>
    </div>
  )
}

function Day({ group, isToday, label, children }: { group: DayGroup; isToday: boolean; label: string; children: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <div role="rowgroup" aria-label={label} style={{ marginBottom: space[3] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], padding: `${space[3]}px ${space[3]}px ${space[2]}px` }}>
        <span style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: isToday ? color.accent : color.t1 }}>{label}</span>
        {isToday && <Badge tone="accent">{t('missions.runs.today')}</Badge>}
        <span style={{ fontSize: font.size.sm, color: color.t3 }}>{t('missions.runs.count', { count: group.runs.length })}</span>
      </div>
      {children}
    </div>
  )
}
