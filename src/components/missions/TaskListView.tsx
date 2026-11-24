import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, Play } from 'lucide-react'
import { color, font, space } from '@/design-system/tokens'
import { Badge, Button, type Tone } from '@/components/kit'
import { libraryWindow } from '@/missions/taskPanel'
import { taskRows, type TaskRow } from '@/missions/taskRun'
import { useSiteMaps } from '@/missions/useMissionMap'
import { runTaskNowAndOpen } from '@/missions/runTaskNowAndOpen'
import { useTaskStore } from '@/missions/useTaskStore'
import type { MissionLibraryEntry, RobotState } from '@/types'
import { InfoChip } from '@/components/common/InfoChip'
import { NameLink, RobotLink } from '@/components/common/NameLink'
import { RecordCard } from '@/components/touch/RecordCard'
import { useTouchShell } from '@/lib/useTouchShell'
import { AvailabilityDot, useRobotAvailability } from './RobotPicker'

const COLS = 'minmax(220px, 2fr) minmax(140px, 1fr) minmax(150px, 1.2fr) 130px 170px 90px 220px'

function Dim() {
  return <span style={{ color: color.t3 }}>—</span>
}

/** `t`, for the keys built from data that its own types cannot narrow. */
type Tx = (key: string, options?: Record<string, unknown>) => string

/** A task's status badge: one decision for the table row and the touch card.
 *  Anything that is not `paused` reads as "enabled", and only `enabled`
 *  itself is toned. */
function statusBadge(tx: Tx, task: TaskRow['task']): { text: string; tone: Tone } {
  return {
    text: tx(`missions.tasks.statusOption.${task.status === 'paused' ? 'paused' : 'enabled'}`),
    tone: task.status === 'enabled' ? 'green' : 'neutral',
  }
}

/** Which mission a task runs, and of which kind -- a link to the editor when
 *  the page offers one, in the row and on the card alike. */
function MissionCell({ row, onOpenMission }: { row: TaskRow; onOpenMission?: (missionId: string) => void }) {
  const { t } = useTranslation()
  const mission = row.mission
  if (!mission) return <>{t('missions.tasks.runNowOff.missionMissing')}</>
  return (
    <>
      {onOpenMission
        ? <NameLink onClick={() => onOpenMission(mission.mission_id)}>{mission.name}</NameLink>
        : mission.name}
      {` · ${t(`missions.tasks.form.kind.${mission.kind}`)}`}
    </>
  )
}

/**
 * The site's tasks (Schedule › Tasks), as a table like the mission library
 * beside it: which mission, which robot, when, what is next and how the last
 * run came out, with Run now on every row. Run now is disabled with its reason
 * next to it when the task cannot run. The rows are decided in
 * missions/taskRun.ts (`taskRows`), where they are tested.
 */
export function TaskListView({ siteId, missions, robots, timezone, onEdit, onOpenMission }: {
  siteId: string
  missions: MissionLibraryEntry[]
  robots: RobotState[]
  timezone: string
  onEdit: (taskId: string) => void
  /** Opens the task's mission in the editor. */
  onOpenMission?: (missionId: string) => void
}) {
  const { t } = useTranslation()
  const { touch } = useTouchShell()
  const tx = t as unknown as Tx
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
  const error = useTaskStore((s) => s.error)
  useEffect(() => { void load(siteId, from, to) }, [siteId, from, to, load])
  // A route's Run now needs its own map to be active, and its robot not on another.
  const { maps } = useSiteMaps(siteId)
  const rows = useMemo(
    () => taskRows(tasks, missions, robots, occurrences, now, timezone, maps),
    [tasks, missions, robots, occurrences, now, timezone, maps],
  )
  const availability = useRobotAvailability(robots)
  // A start in flight, and the last refusal, kept beside its row until the next attempt.
  const [starting, setStarting] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<{ taskId: string; reason: string } | null>(null)
  const run = async (taskId: string) => {
    const task = tasks.find((x) => x.task_id === taskId)
    const mission = task ? missions.find((m) => m.mission_id === task.mission_id) : undefined
    if (!task || !mission) return
    setStarting(taskId)
    setRefusal(null)
    const result = await runTaskNowAndOpen(siteId, task, mission)
    setStarting(null)
    if (!result.ok) setRefusal({ taskId, reason: result.reason })
  }

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: `${space[4]}px ${space[5]}px` }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: space[3] }}>
        <InfoChip label={t('missions.tasks.list.scheduledBadge')}>{t('missions.tasks.list.note')}</InfoChip>
      </div>
      {error && (
        <div role="alert" style={{ marginBottom: space[3], padding: `${space[2]}px ${space[4]}px`, background: color.redBg, fontSize: font.size.md, color: color.t1 }}>
          {t('missions.tasks.loadFailed', { error })}
        </div>
      )}
      {touch ? (
        <>
          <TaskCards rows={rows} siteId={siteId} availability={availability} starting={starting} refusal={refusal} onRun={(id) => void run(id)} onEdit={onEdit} onOpenMission={onOpenMission} />
      {tasksLoaded && rows.length === 0 && (
        <div style={{ padding: space[6], color: color.t3, fontSize: font.size.md }}>{t('missions.tasks.list.empty')}</div>
      )}
      {!tasksLoaded && !error && (
        <div style={{ padding: space[6], color: color.t3, fontSize: font.size.md }}>{t('missions.tasks.loading')}</div>
      )}
        </>
      ) : (
      <div role="table" style={{ minWidth: 1200 }}>
        <div role="row" style={{
          display: 'grid', gridTemplateColumns: COLS, gap: space[3], padding: `${space[2]}px ${space[3]}px`,
          fontSize: font.size.sm, color: color.t3, borderBottom: `1px solid ${color.border}`,
        }}>
          {(['task', 'robot', 'when', 'nextRun', 'lastResult', 'status', 'actions'] as const).map((c) => (
            <span role="columnheader" key={c}>{c === 'actions' ? '' : t(`missions.tasks.list.col.${c}`)}</span>
          ))}
        </div>
        {rows.map((r) => {
          const a = r.robot ? availability.get(r.robot.robot_id) : undefined
          const status = statusBadge(tx, r.task)
          return (
            <div
              key={r.task.task_id} role="row" onClick={() => onEdit(r.task.task_id)}
              style={{
                display: 'grid', gridTemplateColumns: COLS, gap: space[3], alignItems: 'center',
                padding: `${space[3]}px`, borderBottom: `1px solid ${color.border}`, cursor: 'pointer', fontSize: font.size.md, color: color.t1,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = color.selected }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                <span style={{ fontWeight: font.weight.semibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.title ?? t('missions.calendar.unknownMission')}
                </span>
                <span style={{ fontSize: font.size.sm, color: color.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <MissionCell row={r} onOpenMission={onOpenMission} />
                </span>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: space[2], minWidth: 0 }}>
                {a && <AvailabilityDot availability={a} />}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: r.task.robot_id ? color.t1 : color.amber }}>
                  {r.robot
                    ? <RobotLink siteId={siteId} robotId={r.robot.robot_id}>{r.robot.name}</RobotLink>
                    : r.task.robot_id ?? t('missions.tasks.noRobot')}
                </span>
              </span>
              <span>{r.schedule}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{r.nextRun ? `${r.nextRun.date.slice(5)} ${r.nextRun.time}` : <Dim />}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: space[2], minWidth: 0 }}>
                {r.lastResult ? <>
                  <Badge tone={r.lastResult.view.tone} title={r.lastResult.view.title ?? undefined}>{tx(r.lastResult.view.statusKey)}</Badge>
                  <span style={{ fontSize: font.size.sm, color: color.t3, fontVariantNumeric: 'tabular-nums' }}>{r.lastResult.date.slice(5)} {r.lastResult.time}</span>
                </> : <Dim />}
              </span>
              <span>
                <Badge tone={status.tone}>{status.text}</Badge>
              </span>
              <span style={{ display: 'grid', gap: space[1], minWidth: 0 }} onClick={(e) => e.stopPropagation()}>
                <span style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
                  <Button size="sm" variant="primary" icon={Play} disabled={r.runNow !== null || starting !== null} onClick={() => void run(r.task.task_id)}>
                    {starting === r.task.task_id ? t('missions.tasks.start.starting') : t('missions.tasks.runNow')}
                  </Button>
                  <Button size="sm" variant="ghost" icon={Pencil} onClick={() => onEdit(r.task.task_id)}>{t('missions.tasks.list.edit')}</Button>
                </span>
                {/* A disabled Run now always says why, next to it (docs/05-ui-ux.md §18.2). */}
                {r.runNow && <span style={{ fontSize: font.size.xs, color: color.t3, lineHeight: 1.3 }}>{t(`missions.tasks.runNowOff.${r.runNow}`)}</span>}
                {refusal?.taskId === r.task.task_id && <span role="alert" style={{ fontSize: font.size.xs, color: color.red, lineHeight: 1.3 }}>{refusal.reason}</span>}
              </span>
            </div>
          )
        })}
        {tasksLoaded && rows.length === 0 && (
          <div style={{ padding: space[6], color: color.t3, fontSize: font.size.md }}>{t('missions.tasks.list.empty')}</div>
        )}
        {!tasksLoaded && !error && (
          <div style={{ padding: space[6], color: color.t3, fontSize: font.size.md }}>{t('missions.tasks.loading')}</div>
        )}
      </div>
      )}
    </div>
  )
}

/**
 * The touch form of the table: one card per row, rendering what `taskRows`
 * decided. Run now is disabled with the same reason the table prints; nothing
 * about whether a task can run is worked out here.
 */
function TaskCards({ rows, siteId, availability, starting, refusal, onRun, onEdit, onOpenMission }: {
  rows: TaskRow[]
  siteId: string
  availability: ReturnType<typeof useRobotAvailability>
  starting: string | null
  refusal: { taskId: string; reason: string } | null
  onRun: (taskId: string) => void
  onEdit: (taskId: string) => void
  /** Opens the task's mission in the editor, as the table row does. */
  onOpenMission?: (missionId: string) => void
}) {
  const { t } = useTranslation()
  const tx = t as unknown as Tx
  const cardButton = { minHeight: 36 }
  return (
    <div style={{ display: 'grid', gap: space[2] }}>
      {rows.map((r) => {
        const taskId = r.task.task_id
        const a = r.robot ? availability.get(r.robot.robot_id) : undefined
        const failed = refusal?.taskId === taskId ? refusal.reason : null
        return (
          <RecordCard
            key={taskId}
            title={r.title ?? t('missions.calendar.unknownMission')}
            badge={statusBadge(tx, r.task)}
            fields={[
              {
                label: t('missions.tasks.list.col.robot'),
                value: (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: space[1] }}>
                    {a && <AvailabilityDot availability={a} />}
                    <span style={{ color: r.task.robot_id ? color.t1 : color.amber }}>
                      {r.robot
                        ? <RobotLink siteId={siteId} robotId={r.robot.robot_id}>{r.robot.name}</RobotLink>
                        : r.task.robot_id ?? t('missions.tasks.noRobot')}
                    </span>
                  </span>
                ),
              },
              { label: t('missions.runs.col.mission'), value: <MissionCell row={r} onOpenMission={onOpenMission} /> },
              { label: t('missions.tasks.list.col.when'), value: r.schedule },
              { label: t('missions.tasks.list.col.nextRun'), value: r.nextRun ? `${r.nextRun.date.slice(5)} ${r.nextRun.time}` : <Dim /> },
              {
                label: t('missions.tasks.list.col.lastResult'),
                value: r.lastResult
                  ? <>{tx(r.lastResult.view.statusKey)} {r.lastResult.date.slice(5)} {r.lastResult.time}</>
                  : <Dim />,
              },
            ]}
            note={r.runNow || failed ? (
              <>
                {r.runNow && <div>{t(`missions.tasks.runNowOff.${r.runNow}`)}</div>}
                {failed && <div role="alert" style={{ color: color.red }}>{failed}</div>}
              </>
            ) : undefined}
            actions={<>
              <Button size="sm" variant="primary" icon={Play} style={cardButton} disabled={r.runNow !== null || starting !== null} onClick={() => onRun(taskId)}>
                {starting === taskId ? t('missions.tasks.start.starting') : t('missions.tasks.runNow')}
              </Button>
              <Button size="sm" variant="ghost" icon={Pencil} style={cardButton} onClick={() => onEdit(taskId)}>{t('missions.tasks.list.edit')}</Button>
            </>}
          />
        )
      })}
    </div>
  )
}
