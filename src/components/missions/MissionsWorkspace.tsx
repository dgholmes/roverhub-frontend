import { useOperatorName } from '@/lib/auth/useAccount'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Button, Segmented } from '@/components/kit'
import { useSiteRobots } from '@/org/useSiteRobots'
import { useMissionStore } from '@/missions/useMissionStore'
import { useTaskStore } from '@/missions/useTaskStore'
import { missionRobotType, newTask, tasksOf } from '@/missions/taskPanel'
import { computeEstimates } from '@/missions/estimates'
import { checkAgainstLoadedMap } from '@/missions/zoneContext'
import { useSiteMapFor } from '@/missions/useMissionMap'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import { blankMission, startTab } from '@/missions/authoring'
import type { MissionKind, MissionLibraryEntry, MissionTask } from '@/types'
import { MissionLibraryView } from './MissionLibraryView'
import { MissionEditor, type EditorTab } from './MissionEditor'
import { ScheduleCalendar } from './ScheduleCalendar'
import { TaskForm } from './TaskForm'
import { TaskListView } from './TaskListView'
import { ScheduleRunsView } from './ScheduleRunsView'
import { MapCurationPanel } from '@/components/maps/MapCurationPanel'
import { hashForMissionsMaps, hashForSiteWorkspace, isMissionsMapsHash } from '@/app/routes'

type View = 'missions' | 'schedule' | 'maps'
type ScheduleView = 'runs' | 'tasks' | 'calendar'
/** A full-width page over the views: a task being made or edited. */
type Page = { kind: 'taskForm'; task: MissionTask; isNew: boolean }

/**
 * Missions workspace (docs/05-ui-ux.md §11): Missions is the library of what
 * the robots can do; Schedule is the tasks made from them, as a list (with Run
 * now on each) and as a week calendar. A mission is authored once and given to
 * robots by tasks, as FlightHub 2 keeps routes apart from task plans. Opening
 * a mission or a task gives a full-width page. Run now starts a program on the
 * robot through the backend and opens LiveOps.
 */
export function MissionsWorkspace({ siteId }: { siteId: string }) {
  const { t } = useTranslation()
  const robots = useSiteRobots()
  const init = useLiveOpsStore((s) => s.init)
  const teardown = useLiveOpsStore((s) => s.teardown)
  const timezone = useSessionStore((s) => s.sites.find((x) => x.id === siteId)?.timezone) ?? 'UTC'
  const operator = useOperatorName()
  const { missions, loading, error, load } = useMissionStore()
  // The library view loads these; read here so the checks below see the same robots the editor does.
  const tasks = useTaskStore((s) => s.tasks)
  // Each mission is checked against the map it names, and only when that is the
  // loaded one: loading every mission's own map would be a fetch per row, and
  // checking it against another map's zones would clear or flag it by polygons
  // from somewhere else. Any other mission reads "not checked" (see checkAgainstLoadedMap).
  const { map: siteMap } = useSiteMapFor(siteId)
  // Checks are recomputed rather than trusted from storage, so they follow the
  // current robots and zones. So is a route's estimate. A program's is not:
  // computeEstimates hands back the stored one, because only the editor can
  // compile a program (spec 5.4), and recomputing it here would blank the
  // library and calendar for every program mission.
  const checked = useMemo(() => missions.map((m) => ({
    ...m,
    estimates: computeEstimates(m),
    // A mission has no robot of its own; its tasks do (taskPanel.missionRobotType).
    validation: checkAgainstLoadedMap(m, siteMap, missionRobotType(tasksOf(tasks, m.mission_id), robots)),
  })), [missions, robots, tasks, siteMap])
  const [view, setView] = useState<View>(() => (isMissionsMapsHash(window.location.hash) ? 'maps' : 'missions'))
  const [scheduleView, setScheduleView] = useState<ScheduleView>('runs')
  const [editing, setEditing] = useState<{ mission: MissionLibraryEntry; isNew: boolean; tab: EditorTab } | null>(null)
  const [page, setPage] = useState<Page | null>(null)

  useEffect(() => { init(); return () => teardown() }, [init, teardown])
  useEffect(() => { void load(siteId) }, [siteId, load])

  // The Maps view has a hash of its own, so it can be linked and survives a
  // reload; the other two stay on the plain Missions hash.
  const showView = (next: View) => {
    setView(next)
    window.location.hash = next === 'maps' ? hashForMissionsMaps(siteId) : hashForSiteWorkspace(siteId, 'Missions')
  }

  const open = (id: string, tab: EditorTab = 'route') => {
    const m = missions.find((x) => x.mission_id === id)
    if (m) setEditing({ mission: m, isNew: false, tab: startTab(m.kind, tab) })
  }
  // A mission is a route or a program from creation, and stays one.
  const create = (kind: MissionKind) => setEditing({
    mission: blankMission(t('missions.workspace.untitled', { n: missions.length + 1 }), siteId, operator, kind, siteMap?.map_id),
    isNew: true, tab: startTab(kind, 'route'),
  })

  // A new task starts from its mission when there is one to start from.
  const createTask = (missionId: string | null) => {
    const mission = missionId ? missions.find((m) => m.mission_id === missionId) ?? null : null
    setView('schedule')
    setPage({ kind: 'taskForm', isNew: true, task: newTask({ mission, siteId, timezone, creator: operator, now: new Date() }) })
  }
  const editTask = (taskId: string) => {
    const task = tasks.find((x) => x.task_id === taskId)
    if (task) setPage({ kind: 'taskForm', isNew: false, task })
  }
  const backToTasks = () => { setPage(null); setView('schedule'); setScheduleView('tasks') }

  if (editing) {
    return (
      <MissionEditor
        siteId={siteId}
        key={editing.mission.mission_id}
        initial={editing.mission} isNew={editing.isNew} robots={robots} timezone={timezone} initialTab={editing.tab}
        onClose={() => setEditing(null)}
        onSaved={() => setEditing((e) => (e ? { ...e, isNew: false } : e))}
        onDeleted={() => setEditing(null)}
        onSchedule={(missionId) => { setEditing(null); createTask(missionId) }}
      />
    )
  }

  if (page?.kind === 'taskForm') {
    return (
      <TaskForm
        key={page.task.task_id} siteId={siteId} initial={page.task} isNew={page.isNew} missions={checked} robots={robots} timezone={timezone}
        onDone={backToTasks}
      />
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{
        height: 44, flexShrink: 0, background: color.surface, borderBottom: `1px solid ${color.border}`,
        display: 'flex', alignItems: 'center', padding: `0 ${space[4]}px`, gap: space[1],
      }}>
        {(['missions', 'schedule', 'maps'] as const).map((key) => {
          const active = key === view
          return (
            <button
              key={key} type="button" onClick={() => showView(key)} aria-pressed={active}
              style={{
                padding: '6px 14px', borderRadius: radius.md,
                border: active ? `1px solid ${color.borderLt}` : '1px solid transparent',
                background: active ? color.selected : 'transparent', color: active ? color.t1 : color.t2,
                fontSize: font.size.sm, fontWeight: active ? font.weight.semibold : font.weight.regular,
                fontFamily: font.family, cursor: 'pointer',
              }}
            >
              {t(`missions.view.${key}`)}
            </button>
          )
        })}
        <span style={{ flex: 1 }} />
        {view === 'missions' ? <>
          <Button size="sm" icon={Plus} onClick={() => create('program')}>
            {t('missions.library.newProgram')}
          </Button>
          <Button size="sm" variant="primary" icon={Plus} onClick={() => create('route')}>
            {t('missions.library.newMission')}
          </Button>
        </> : view === 'schedule' ? <>
          <Segmented<ScheduleView>
            label={t('missions.view.schedule')} value={scheduleView} onChange={setScheduleView}
            options={(['runs', 'tasks', 'calendar'] as const).map((v) => ({ value: v, label: t(`missions.scheduleView.${v}`) }))}
          />
          <Button size="sm" variant="primary" icon={Plus} onClick={() => createTask(null)}>
            {t('missions.tasks.list.newTask')}
          </Button>
        </> : null}
      </div>
      {error && view !== 'maps' && (
        <div role="alert" style={{ padding: `${space[2]}px ${space[4]}px`, background: color.redBg, borderBottom: `1px solid ${color.redBorder}`, fontSize: font.size.md, color: color.t1 }}>
          {t('missions.library.loadFailed', { error })}
        </div>
      )}
      {view === 'maps' ? (
        <MapCurationPanel siteId={siteId} />
      ) : loading && missions.length === 0 ? (
        <div style={{ padding: space[6], color: color.t3, fontSize: font.size.md }}>{t('missions.library.loading')}</div>
      ) : view === 'missions' ? (
        <MissionLibraryView
          siteId={siteId} missions={checked} onOpen={(id) => open(id)}
          onSchedule={createTask} onShowTasks={() => { setView('schedule'); setScheduleView('tasks') }}
        />
      ) : scheduleView === 'runs' ? (
        <ScheduleRunsView
          siteId={siteId} missions={checked} robots={robots} timezone={timezone}
          onEditTask={editTask} onOpenMission={(id) => open(id)}
        />
      ) : scheduleView === 'tasks' ? (
        <TaskListView
          siteId={siteId} missions={checked} robots={robots} timezone={timezone}
          onEdit={editTask} onOpenMission={(id) => open(id)}
        />
      ) : (
        <ScheduleCalendar siteId={siteId} missions={checked} robots={robots} timezone={timezone} onOpen={editTask} />
      )}
    </div>
  )
}
