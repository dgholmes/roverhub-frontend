import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Button } from '@/components/kit'
import { useSiteRobots } from '@/org/useSiteRobots'
import { useMissionStore } from '@/missions/useMissionStore'
import { useTaskStore } from '@/missions/useTaskStore'
import { missionRobotType, tasksOf } from '@/missions/taskPanel'
import { computeEstimates } from '@/missions/estimates'
import { validateMission } from '@/missions/validate'
import { geofence, noGoZones } from '@/mocks/mockGeoZones'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import { blankMission, startTab } from '@/missions/authoring'
import type { MissionKind, MissionLibraryEntry } from '@/types'
import { MissionLibraryView } from './MissionLibraryView'
import { MissionEditor, type EditorTab } from './MissionEditor'
import { ScheduleCalendar } from './ScheduleCalendar'

type View = 'missions' | 'schedule'

/**
 * Missions workspace (docs/05-ui-ux.md §11), layout A: a library of the
 * site's missions and a week calendar of their schedules; opening a mission
 * gives a full-width editor. Missions are saved through the data provider
 * (the backend in real mode). None of them can run yet: there is no mission
 * executor on the edge.
 */
export function MissionsWorkspace({ siteId }: { siteId: string }) {
  const { t } = useTranslation()
  const robots = useSiteRobots()
  const init = useLiveOpsStore((s) => s.init)
  const teardown = useLiveOpsStore((s) => s.teardown)
  const timezone = useSessionStore((s) => s.sites.find((x) => x.id === siteId)?.timezone) ?? 'UTC'
  const operator = useSessionStore((s) => s.operatorName)
  const { missions, loading, error, load } = useMissionStore()
  // The library view loads these; read here so the checks below see the same robots the editor does.
  const tasks = useTaskStore((s) => s.tasks)
  // Checks are recomputed rather than trusted from storage, so they follow the
  // current robots and zones. So is a route's estimate. A program's is not:
  // computeEstimates hands back the stored one, because only the editor can
  // compile a program (spec 5.4), and recomputing it here would blank the
  // library and calendar for every program mission.
  const checked = useMemo(() => missions.map((m) => ({
    ...m,
    estimates: computeEstimates(m),
    // A mission has no robot of its own; its tasks do (taskPanel.missionRobotType).
    validation: validateMission(m, { noGoZones, geofence, robotType: missionRobotType(tasksOf(tasks, m.mission_id), robots) }),
  })), [missions, robots, tasks])
  const [view, setView] = useState<View>('missions')
  const [editing, setEditing] = useState<{ mission: MissionLibraryEntry; isNew: boolean; tab: EditorTab } | null>(null)

  useEffect(() => { init(); return () => teardown() }, [init, teardown])
  useEffect(() => { void load(siteId) }, [siteId, load])

  const open = (id: string, tab: EditorTab = 'route') => {
    const m = missions.find((x) => x.mission_id === id)
    if (m) setEditing({ mission: m, isNew: false, tab: startTab(m.kind, tab) })
  }
  // A mission is a route or a program from creation, and stays one.
  const create = (kind: MissionKind) => setEditing({
    mission: blankMission(t('missions.workspace.untitled', { n: missions.length + 1 }), siteId, operator, kind),
    isNew: true, tab: startTab(kind, 'route'),
  })

  if (editing) {
    return (
      <MissionEditor
        siteId={siteId}
        key={editing.mission.mission_id}
        initial={editing.mission} isNew={editing.isNew} robots={robots} timezone={timezone} initialTab={editing.tab}
        onClose={() => setEditing(null)}
        onSaved={() => setEditing((e) => (e ? { ...e, isNew: false } : e))}
        onDeleted={() => setEditing(null)}
      />
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div style={{
        height: 44, flexShrink: 0, background: color.surface, borderBottom: `1px solid ${color.border}`,
        display: 'flex', alignItems: 'center', padding: `0 ${space[4]}px`, gap: space[1],
      }}>
        {(['missions', 'schedule'] as const).map((key) => {
          const active = key === view
          return (
            <button
              key={key} type="button" onClick={() => setView(key)} aria-pressed={active}
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
        <Button size="sm" icon={Plus} onClick={() => create('program')}>
          {t('missions.library.newProgram')}
        </Button>
        <Button size="sm" variant="primary" icon={Plus} onClick={() => create('route')}>
          {t('missions.library.newMission')}
        </Button>
      </div>
      {error && (
        <div role="alert" style={{ padding: `${space[2]}px ${space[4]}px`, background: color.redBg, borderBottom: `1px solid ${color.redBorder}`, fontSize: font.size.md, color: color.t1 }}>
          {t('missions.library.loadFailed', { error })}
        </div>
      )}
      {loading && missions.length === 0 ? (
        <div style={{ padding: space[6], color: color.t3, fontSize: font.size.md }}>{t('missions.library.loading')}</div>
      ) : view === 'missions' ? (
        <MissionLibraryView siteId={siteId} missions={checked} robots={robots} timezone={timezone} onOpen={(id) => open(id)} />
      ) : (
        <ScheduleCalendar siteId={siteId} missions={checked} robots={robots} timezone={timezone} onOpen={(id) => open(id, 'tasks')} />
      )}
    </div>
  )
}
