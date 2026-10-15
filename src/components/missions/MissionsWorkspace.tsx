import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Button } from '@/components/kit'
import { useSiteRobots } from '@/org/useSiteRobots'
import { useMissionStore } from '@/missions/useMissionStore'
import { computeEstimates } from '@/missions/estimates'
import { validateMission } from '@/missions/validate'
import { geofence, noGoZones } from '@/mocks/mockGeoZones'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import { DEFAULT_CONSTRAINTS, DEFAULT_DISPATCH_RULE, type MissionLibraryEntry } from '@/types'
import { MissionLibraryView } from './MissionLibraryView'
import { MissionEditor, type EditorTab } from './MissionEditor'
import { ScheduleCalendar } from './ScheduleCalendar'

type View = 'missions' | 'schedule'

function blankMission(name: string, siteId: string, creator: string): MissionLibraryEntry {
  return {
    mission_id: `mission-${Date.now().toString(36)}`,
    name, type: 'patrol', library_status: 'draft', creator,
    updated_at: new Date().toISOString(), map_id: `map-${siteId}`, site_id: siteId,
    waypoints: [], segments: [],
    constraints: DEFAULT_CONSTRAINTS, dispatch_rule: DEFAULT_DISPATCH_RULE, schedule: null,
  }
}

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
  // Checks and estimates are recomputed rather than trusted from storage, so
  // they follow the current robots and zones (and missions saved by an older
  // console still get them).
  const checked = useMemo(() => missions.map((m) => ({
    ...m,
    estimates: computeEstimates(m),
    validation: validateMission(m, { noGoZones, geofence, robotType: robots.find((r) => r.robot_id === m.robot_id)?.robot_type ?? null }),
  })), [missions, robots])
  const [view, setView] = useState<View>('missions')
  const [editing, setEditing] = useState<{ mission: MissionLibraryEntry; isNew: boolean; tab: EditorTab } | null>(null)

  useEffect(() => { init(); return () => teardown() }, [init, teardown])
  useEffect(() => { void load(siteId) }, [siteId, load])

  const open = (id: string, tab: EditorTab = 'route') => {
    const m = missions.find((x) => x.mission_id === id)
    if (m) setEditing({ mission: m, isNew: false, tab })
  }

  if (editing) {
    return (
      <MissionEditor
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
        <Button size="sm" variant="primary" icon={Plus} onClick={() => setEditing({
          mission: blankMission(t('missions.workspace.untitled', { n: missions.length + 1 }), siteId, operator), isNew: true, tab: 'route',
        })}>
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
        <MissionLibraryView missions={checked} robots={robots} onOpen={(id) => open(id)} />
      ) : (
        <ScheduleCalendar missions={checked} robots={robots} timezone={timezone} onOpen={(id) => open(id, 'rules')} />
      )}
    </div>
  )
}
