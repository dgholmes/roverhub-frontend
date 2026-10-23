import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import i18n from '@/i18n'
import { color, font, space } from '@/design-system/tokens'
import { Badge } from '@/components/kit'
import { robotTypeLabel } from '@/lib/robotCapabilities'
import { libraryRow, libraryWindow, robotCellText, scheduleCellText } from '@/missions/taskPanel'
import { useTaskStore } from '@/missions/useTaskStore'
import type { MissionLibraryEntry, RobotState } from '@/types'
import { ChecksBadge, formatDuration, formatLength, inputStyle } from './parts'
import { AvailabilityDot, useRobotAvailability } from './RobotPicker'

/** An empty cell: the tasks have not loaded, or there is nothing to show. */
function Dim() {
  return <span style={{ color: color.t3 }}>—</span>
}

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (sec < 3600) return i18n.t('missions.library.ageMinutes', { n: Math.max(1, Math.round(sec / 60)) })
  if (sec < 86400) return i18n.t('missions.library.ageHours', { n: Math.round(sec / 3600) })
  return i18n.t('missions.library.ageDays', { n: Math.round(sec / 86400) })
}

const COLS = 'minmax(200px, 2fr) 100px minmax(130px, 1fr) 110px minmax(130px, 1.1fr) 130px 150px 120px 80px'

/**
 * The site's missions as a table (docs/05-ui-ux.md §11.1): what each is,
 * whether it passes its checks, and what its tasks make of it. A mission has
 * no robot, schedule or status of its own, so the robot and schedule columns
 * summarise its tasks, and "Next run" and "Last result" are read off the
 * server's queue (`libraryRow`). Opening a row opens the editor.
 */
export function MissionLibraryView({ siteId, missions, robots, timezone, onOpen }: {
  siteId: string
  missions: MissionLibraryEntry[]
  robots: RobotState[]
  timezone: string
  onOpen: (missionId: string) => void
}) {
  const { t } = useTranslation()
  const tx = t as unknown as (key: string, options?: Record<string, unknown>) => string
  // "Now" moves on, so a view left open overnight does not call yesterday's run
  // the next one. The window the server is asked for is floored to the hour
  // (libraryWindow), so the minute tick refreshes `now` without reloading, and
  // the hour boundary reloads once.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])
  const { from, to } = libraryWindow(now)
  const load = useTaskStore((s) => s.load)
  const tasks = useTaskStore((s) => s.tasks)
  const occurrences = useTaskStore((s) => s.occurrences)
  const tasksLoaded = useTaskStore((s) => s.tasksLoaded)
  const taskError = useTaskStore((s) => s.error)
  const taskLoading = useTaskStore((s) => s.loading)
  useEffect(() => { void load(siteId, from, to) }, [siteId, from, to, load])
  // Until the tasks have arrived there is nothing to say about them; "no tasks"
  // would be a claim, so the cells stay empty and the banner says why.
  const ready = tasksLoaded && !taskError && !taskLoading
  const [q, setQ] = useState('')
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return [...missions]
      .filter((m) => !needle || m.name.toLowerCase().includes(needle))
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  }, [missions, q])
  const robotById = (id: string) => robots.find((r) => r.robot_id === id)
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
      {taskError && (
        <div role="alert" style={{ marginBottom: space[3], padding: `${space[2]}px ${space[4]}px`, background: color.redBg, fontSize: font.size.md, color: color.t1 }}>
          {t('missions.library.tasksFailed', { error: taskError })}
        </div>
      )}
      <div role="table" style={{ minWidth: 1240 }}>
        <div role="row" style={{
          display: 'grid', gridTemplateColumns: COLS, gap: space[3], padding: `${space[2]}px ${space[3]}px`,
          fontSize: font.size.sm, color: color.t3, borderBottom: `1px solid ${color.border}`,
        }}>
          {(['name', 'type', 'robot', 'checks', 'schedule', 'nextRun', 'lastResult', 'length', 'edited'] as const).map((c) => (
            <span role="columnheader" key={c}>{t(`missions.library.col.${c}`)}</span>
          ))}
        </div>
        {shown.map((m) => {
          const row = ready ? libraryRow(m.mission_id, tasks, occurrences, now, timezone) : null
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
              <span style={{ color: color.t1, display: 'inline-flex', alignItems: 'center', gap: space[2], minWidth: 0 }}>
                {row?.robot.kind === 'one' && availability.get(row.robot.robotId) && <AvailabilityDot availability={availability.get(row.robot.robotId)!} />}
                {row ? (
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {robotCellText(row.robot, (id) => { const r = robotById(id); return r ? `${r.name} · ${robotTypeLabel(r.robot_type)}` : id })}
                  </span>
                ) : <Dim />}
              </span>
              <span><ChecksBadge validation={m.validation} /></span>
              <span style={{ color: color.t1 }}>{row ? scheduleCellText(row.schedule) : <Dim />}</span>
              <span style={{ color: color.t1, fontVariantNumeric: 'tabular-nums' }}>
                {row?.nextRun ? `${row.nextRun.date} ${row.nextRun.time}` : <Dim />}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: space[2], minWidth: 0 }}>
                {row?.lastResult ? (
                  <>
                    <Badge tone={row.lastResult.view.tone} title={row.lastResult.view.title ?? undefined}>{tx(row.lastResult.view.statusKey)}</Badge>
                    <span style={{ fontSize: font.size.sm, color: color.t3, fontVariantNumeric: 'tabular-nums' }}>{row.lastResult.date.slice(5)} {row.lastResult.time}</span>
                  </>
                ) : <Dim />}
              </span>
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
