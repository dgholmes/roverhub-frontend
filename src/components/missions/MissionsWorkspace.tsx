import { useOperatorName } from '@/lib/auth/useAccount'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { color, font, space } from '@/design-system/tokens'
import { Button, Segmented, Tabs } from '@/components/kit'
import { useSiteRobots } from '@/org/useSiteRobots'
import { useTouchShell } from '@/lib/useTouchShell'
import { useMissionStore } from '@/missions/useMissionStore'
import { useTaskStore } from '@/missions/useTaskStore'
import { missionRobotType, newTask, tasksOf } from '@/missions/taskPanel'
import { computeEstimates } from '@/missions/estimates'
import { checkAgainstOwnMap } from '@/missions/zoneContext'
import { useSiteMaps } from '@/missions/useMissionMap'
import { newMissionStart } from '@/missions/missionMaps'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import { blankMission, startTab } from '@/missions/authoring'
import type { MissionKind, MissionLibraryEntry, MissionTask } from '@/types'
import { MissionLibraryView } from './MissionLibraryView'
import { NewMissionMapChooser } from './NewMissionMapChooser'
import { MissionEditor, type EditorTab } from './MissionEditor'
import { ScheduleCalendar } from './ScheduleCalendar'
import { TaskForm } from './TaskForm'
import { TaskListView } from './TaskListView'
import { ScheduleRunsView } from './ScheduleRunsView'
import {
  hashForMap, hashForMissionEditor, hashForMissionsSchedule, hashForSiteWorkspace, SCHEDULE_VIEWS, type ScheduleView,
} from '@/app/routes'
import { missionsLocation, resolveMissionLink, type MissionsLocation, type MissionsView } from './missionsView'

type View = MissionsView
/** A full-width page over the views: a task being made or edited. */
type Page = { kind: 'taskForm'; task: MissionTask; isNew: boolean }

/**
 * Missions workspace (docs/05-ui-ux.md §11): Missions is the library of what
 * the robots can do, each with Run on it; Schedule is the tasks made from them,
 * opening on the Tasks list (with Run now on each), with the runs and a week
 * calendar beside it. A mission is authored once and given to
 * robots by tasks, as FlightHub 2 keeps routes apart from task plans. Opening
 * a mission or a task gives a full-width page. Run now starts a program on the
 * robot through the backend and opens LiveOps.
 *
 * The address holds where the operator is: the view (Missions, Schedule and
 * its Runs / Tasks / Calendar) and the open mission with its tab, so a
 * reload or a shared link comes back to the same place and Back / Forward
 * move between them (routes.tsx). Two things are not in it: a new mission not
 * yet saved (it has no id the backend knows) and the task form.
 */
export function MissionsWorkspace({ siteId }: { siteId: string }) {
  const { t } = useTranslation()
  const { narrow } = useTouchShell()
  const robots = useSiteRobots()
  const init = useLiveOpsStore((s) => s.init)
  const teardown = useLiveOpsStore((s) => s.teardown)
  const timezone = useSessionStore((s) => s.sites.find((x) => x.id === siteId)?.timezone) ?? 'UTC'
  const operator = useOperatorName()
  const { missions, loading, error, load, siteId: loadedSiteId } = useMissionStore()
  // Loaded for this site: a link to a mission is only judged missing after this.
  const loaded = loadedSiteId === siteId && !loading
  // The library view loads these; read here so the checks below see the same robots the editor does.
  const tasks = useTaskStore((s) => s.tasks)
  // Each mission is checked against its own map, from the site's list of maps
  // (one fetch for all of them), never against the one shown: another map's
  // zones would clear or flag it by polygons from somewhere else. A mission
  // whose map the site does not have reads "not checked" (see checkAgainstOwnMap).
  const { maps, shown: siteMap } = useSiteMaps(siteId)
  // Checks are recomputed rather than trusted from storage, so they follow the
  // current robots and zones. So is a route's estimate. A program's is not:
  // computeEstimates hands back the stored one, because only the editor can
  // compile a program (spec 5.4), and recomputing it here would blank the
  // library and calendar for every program mission.
  const checked = useMemo(() => missions.map((m) => ({
    ...m,
    estimates: computeEstimates(m),
    // A mission has no robot of its own; its tasks do (taskPanel.missionRobotType).
    validation: checkAgainstOwnMap(m, maps, missionRobotType(tasksOf(tasks, m.mission_id), robots)),
  })), [missions, robots, tasks, maps])
  const [loc, setLoc] = useState<MissionsLocation>(() => missionsLocation(window.location.hash))
  const view: View = loc.view
  // Leaving Schedule and coming back returns to the view it was on.
  const [lastScheduleView, setLastScheduleView] = useState<ScheduleView>(loc.scheduleView ?? 'tasks')
  const scheduleView: ScheduleView = loc.scheduleView ?? lastScheduleView
  // A new mission, until it is saved and has an address of its own.
  const [draft, setDraft] = useState<{ mission: MissionLibraryEntry; tab: EditorTab } | null>(null)
  const [page, setPage] = useState<Page | null>(null)
  // New mission on a site with several maps: which map, asked under the toolbar.
  const [askMap, setAskMap] = useState<{ defaultMapId: string | null } | null>(null)
  const newMissionButton = useRef<HTMLButtonElement>(null)
  // The hash this workspace last moved to, so its own navigation is told apart
  // from Back / Forward / a typed address, which close the task form and drop
  // an unsaved new mission like any other way of leaving them.
  const ownHash = useRef<string | null>(null)
  // Where the editor's Back returns: the view a mission was opened from. A
  // mission opened by a link (or a reload) returns to the library.
  const returnTo = useRef<string | null>(null)

  useEffect(() => { init(); return () => teardown() }, [init, teardown])
  useEffect(() => { void load(siteId) }, [siteId, load])
  useEffect(() => {
    const follow = () => {
      const hash = window.location.hash
      const own = hash === ownHash.current
      ownHash.current = null
      setLoc(missionsLocation(hash))
      if (!own) { setPage(null); setDraft(null); setAskMap(null) }
    }
    window.addEventListener('hashchange', follow)
    return () => window.removeEventListener('hashchange', follow)
  }, [])
  useEffect(() => { if (loc.scheduleView) setLastScheduleView(loc.scheduleView) }, [loc.scheduleView])

  /** Move to `hash`: a new history entry, or in place of this one (which
   * fires no hashchange, so nothing else is told). */
  const navigate = (hash: string, replace = false) => {
    if (hash !== window.location.hash) {
      if (replace) window.history.replaceState(window.history.state, '', hash)
      else { ownHash.current = hash; window.location.hash = hash }
    }
    setLoc(missionsLocation(hash))
  }
  const libraryHash = hashForSiteWorkspace(siteId, 'Missions')

  const showView = (next: View) => {
    setPage(null)
    setDraft(null)
    setAskMap(null)
    navigate(next === 'schedule' ? hashForMissionsSchedule(siteId, lastScheduleView)
      : libraryHash)
  }
  const showScheduleView = (next: ScheduleView) => navigate(hashForMissionsSchedule(siteId, next))

  const open = (id: string, tab?: EditorTab) => {
    setPage(null)
    setDraft(null)
    setAskMap(null)
    returnTo.current = window.location.hash
    navigate(hashForMissionEditor(siteId, id, tab))
  }
  // A mission is a route or a program from creation, and stays one. A program
  // keeps the shown map as before; a route is drawn on the map asked for.
  const create = (kind: MissionKind, mapId: string | undefined = siteMap?.map_id) => {
    setAskMap(null)
    setDraft({
      mission: blankMission(t('missions.workspace.untitled', { n: missions.length + 1 }), siteId, operator, kind, mapId),
      tab: startTab(kind, 'route'),
    })
  }
  // New mission: drawn on the site's only map, or the plain grid with none;
  // with several, the operator says which (missionMaps.newMissionStart).
  const createRoute = () => {
    const start = newMissionStart(maps, siteMap)
    if (start.kind === 'use') create('route', start.mapId)
    else setAskMap({ defaultMapId: start.defaultMapId })
  }

  // A new task starts from its mission when there is one to start from.
  const createTask = (missionId: string | null) => {
    const mission = missionId ? missions.find((m) => m.mission_id === missionId) ?? null : null
    setDraft(null)
    setAskMap(null)
    navigate(hashForMissionsSchedule(siteId, scheduleView))
    setPage({ kind: 'taskForm', isNew: true, task: newTask({ mission, siteId, timezone, creator: operator, now: new Date() }) })
  }
  const editTask = (taskId: string) => {
    const task = tasks.find((x) => x.task_id === taskId)
    if (task) setPage({ kind: 'taskForm', isNew: false, task })
  }
  const backToTasks = () => { setPage(null); navigate(hashForMissionsSchedule(siteId, 'tasks')) }

  // A link to a mission that is gone (deleted, or from another site) falls back
  // to the library, in place, so Back does not return to the dead link.
  const link = loc.missionId && !draft ? resolveMissionLink(loc.missionId, missions, loaded) : null
  useEffect(() => {
    if (link !== 'missing') return
    window.history.replaceState(window.history.state, '', libraryHash)
    setLoc(missionsLocation(libraryHash))
  }, [link, libraryHash])

  const linked = link === 'open' ? missions.find((m) => m.mission_id === loc.missionId) : undefined
  const editing = draft
    ? { mission: draft.mission, isNew: true, tab: draft.tab }
    : linked ? { mission: linked, isNew: false, tab: startTab(linked.kind, loc.tab ?? 'route') } : null

  if (editing) {
    return (
      <MissionEditor
        siteId={siteId}
        key={editing.mission.mission_id}
        initial={editing.mission} isNew={editing.isNew} robots={robots} timezone={timezone} initialTab={editing.tab}
        // The tab is kept in place in the address, not as a step for Back.
        onTabChange={(tab) => { if (!editing.isNew) navigate(hashForMissionEditor(siteId, editing.mission.mission_id, tab), true) }}
        onClose={() => {
          const back = returnTo.current && !missionsLocation(returnTo.current).missionId ? returnTo.current : libraryHash
          returnTo.current = null
          setDraft(null)
          navigate(back)
        }}
        // A new mission gets its address once saved, in place of the library's.
        onSaved={(id) => { if (draft) { setDraft(null); navigate(hashForMissionEditor(siteId, id), true) } }}
        onDeleted={() => { setDraft(null); navigate(libraryHash, true) }}
        onSchedule={(missionId) => createTask(missionId)}
      />
    )
  }

  if (link === 'wait') {
    return <div style={{ padding: space[6], color: color.t3, fontSize: font.size.md }}>{t('missions.library.loading')}</div>
  }

  if (page?.kind === 'taskForm') {
    return (
      <TaskForm
        key={page.task.task_id} siteId={siteId} initial={page.task} isNew={page.isNew} missions={checked} robots={robots} timezone={timezone}
        onDone={backToTasks}
      />
    )
  }

  const toolbarActions = view === 'missions' ? <>
    <Button size="sm" icon={Plus} onClick={() => create('program')}>
      {t('missions.library.newProgram')}
    </Button>
    <Button ref={newMissionButton} size="sm" variant="primary" icon={Plus} onClick={createRoute} aria-expanded={askMap !== null}>
      {t('missions.library.newMission')}
    </Button>
  </> : view === 'schedule' ? <>
    <Segmented<ScheduleView>
      label={t('missions.view.schedule')} value={scheduleView} onChange={showScheduleView}
      options={SCHEDULE_VIEWS.map((v) => ({ value: v, label: t(`missions.scheduleView.${v}`) }))}
    />
    <Button size="sm" variant="primary" icon={Plus} onClick={() => createTask(null)}>
      {t('missions.tasks.list.newTask')}
    </Button>
  </> : null

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{
        ...(narrow ? { minHeight: 44, flexWrap: 'wrap' } : { height: 44 }),
        flexShrink: 0, background: color.surface, borderBottom: `1px solid ${color.border}`,
        display: 'flex', alignItems: 'stretch', padding: `0 ${space[4]}px`, gap: space[1],
      }}>
        {/* The kit's underline tabs, not a hand-rolled row: the active one
            was a filled box with its own border, which in a bar that already
            has a surface reads as a slab rather than as a selection
            (operator, 2026-11-25) -- the same thing the bottom tab bar had.
            `.rh-tabs` says it with colour, weight and a 2 px accent rule. */}
        <Tabs
          label={t('nav.workspace.Missions')}
          value={view}
          onChange={showView}
          options={(['missions', 'schedule'] as const)
            .map((key) => ({ value: key, label: t(`missions.view.${key}`) }))}
        />
        <span style={{ flex: 1 }} />
        {/* Narrow, the page's actions wrap to a row of their own under the
            tabs rather than running off the right edge. */}
        {narrow ? (
          <div data-missions-toolbar-actions style={{ flexBasis: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', flexWrap: 'wrap', gap: space[1], paddingBottom: space[2] }}>
            {toolbarActions}
          </div>
        ) : (
          // The bar stretches its children so the tabs' accent rule sits on
          // its bottom edge; a button has a fixed height and does not stretch,
          // so on its own it sat at the top of the bar (operator, 2026-11-26).
          // This row takes the bar's height and centres the actions in it.
          <div data-missions-toolbar-actions style={{ display: 'flex', alignItems: 'center', gap: space[1] }}>
            {toolbarActions}
          </div>
        )}
      </div>
      {askMap && view === 'missions' && maps && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: `${space[2]}px ${space[4]}px`, background: color.surface }}>
          <NewMissionMapChooser
            maps={maps} robots={robots} defaultMapId={askMap.defaultMapId}
            onStart={(mapId) => create('route', mapId)} onCancel={() => setAskMap(null)} returnFocus={newMissionButton}
          />
        </div>
      )}
      {error && (
        <div role="alert" style={{ padding: `${space[2]}px ${space[4]}px`, background: color.redBg, borderBottom: `1px solid ${color.redBorder}`, fontSize: font.size.md, color: color.t1 }}>
          {t('missions.library.loadFailed', { error })}
        </div>
      )}
      {loading && missions.length === 0 ? (
        <div style={{ padding: space[6], color: color.t3, fontSize: font.size.md }}>{t('missions.library.loading')}</div>
      ) : view === 'missions' ? (
        <MissionLibraryView
          siteId={siteId} missions={checked} maps={maps} onOpen={(id) => open(id)}
          onSchedule={createTask} onShowTasks={() => navigate(hashForMissionsSchedule(siteId, 'tasks'))}
          // A mission's map chip opens that map in the Map workspace, already chosen.
          onOpenMap={(mapId) => { window.location.hash = hashForMap(siteId, mapId) }}
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
