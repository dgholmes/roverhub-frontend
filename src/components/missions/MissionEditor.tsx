import { useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Save, Trash2 } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge, Button, IconButton, Tabs } from '@/components/kit'
import { computeEstimates } from '@/missions/estimates'
import { validateMission } from '@/missions/validate'
import { occurrencesInWeek, todayIn, weekStart } from '@/missions/schedule'
import { useRobotAvailability } from './RobotPicker'
import { useMissionStore } from '@/missions/useMissionStore'
import { geofence, noGoZones } from '@/mocks/mockGeoZones'
import type { MissionLibraryEntry, MissionWaypoint, RobotState, Segment } from '@/types'
import { ChecksBadge, formatDuration, formatLength } from './parts'
import { StepList } from './StepList'
import { StepInspector } from './StepInspector'
import { MissionAnnouncements } from './MissionAnnouncements'
import { MissionRules } from './MissionRules'
import { MissionMapEditor } from './route-editor/MissionMapEditor'
import { BlocklyEditor } from './visual-program/BlocklyEditor'
import { applyCompiledProgram } from './visual-program/compileProgram'
import { useProgramRun, type ProgramEditorHandle } from '@/missions/program/useProgramRun'
import type { ProgramBlock } from '@/missions/program/types'
import { programRunValidation } from '@/missions/program/runBlockers'
import { ProgramRunBar } from './program/ProgramRunBar'
import { RunLog } from './program/RunLog'

export type EditorTab = 'route' | 'program' | 'rules' | 'announcements'

/** What decides "unsaved": the mission itself, not what's derived from it. */
function fingerprint(m: MissionLibraryEntry): string {
  const { validation: _v, estimates: _e, updated_at: _u, ...rest } = m
  return JSON.stringify(rest)
}

/**
 * Full-width mission editor (Missions layout A): steps on the left, the map
 * in the middle, the selected step on the right; Program and Rules as tabs.
 * Edits a copy; nothing reaches the library until Save. Checks and estimates
 * are recomputed on every edit and saved with the mission.
 */
export function MissionEditor({ siteId, initial, isNew, robots, timezone, initialTab = 'route', onClose, onSaved, onDeleted }: {
  siteId: string
  initial: MissionLibraryEntry
  isNew: boolean
  robots: RobotState[]
  timezone: string
  initialTab?: EditorTab
  onClose: () => void
  onSaved: (id: string) => void
  onDeleted: () => void
}) {
  const { t } = useTranslation()
  const save = useMissionStore((s) => s.save)
  const remove = useMissionStore((s) => s.remove)
  const [draft, setDraft] = useState<MissionLibraryEntry>(initial)
  const [baseline, setBaseline] = useState(() => (isNew ? '' : fingerprint(initial)))
  const [tab, setTab] = useState<EditorTab>(initialTab)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'leave' | 'delete' | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const robotType = robots.find((r) => r.robot_id === draft.robot_id)?.robot_type ?? null
  const availability = useRobotAvailability(robots)
  const robotStatus = draft.robot_id ? availability.get(draft.robot_id)?.status ?? null : null
  const otherMissions = useMissionStore((s) => s.missions)
  // Booked: this mission's runs this week overlap another mission's on the
  // same robot -- the calendar's clash, raised here where the robot is chosen.
  const robotBooked = useMemo(() => {
    if (!draft.robot_id || !draft.schedule) return false
    const all = [draft, ...otherMissions.filter((m) => m.mission_id !== draft.mission_id)]
      .map((m) => ({ ...m, estimates: computeEstimates(m) }))
    return occurrencesInWeek(all, weekStart(todayIn(timezone))).some((o) => o.mission.mission_id === draft.mission_id && o.clash)
  }, [draft, otherMissions, timezone])
  const mission = useMemo<MissionLibraryEntry>(() => ({
    ...draft,
    estimates: computeEstimates(draft),
    validation: validateMission(draft, { noGoZones, geofence, robotType, robotStatus, robotBooked }),
  }), [draft, robotType])
  const dirty = fingerprint(draft) !== baseline
  const issues = mission.validation!.issues
  const flagged = useMemo(() => {
    const out: Record<string, 'error' | 'warning'> = {}
    for (const i of issues) if (i.waypoint_id && i.severity !== 'info' && out[i.waypoint_id] !== 'error') out[i.waypoint_id] = i.severity as 'error' | 'warning'
    return out
  }, [issues])

  // Program runs: the robot defaults to the mission's until one is picked here.
  const editorRef = useRef<ProgramEditorHandle>(null)
  const [pickedRobot, setPickedRobot] = useState<string | undefined | null>(null)
  const runRobotId = pickedRobot === null ? draft.robot_id ?? undefined : pickedRobot
  const [program, setProgram] = useState<{ blocks: ProgramBlock[]; detached: number }>({ blocks: [], detached: 0 })
  // The mission's checks against the robot the program will run on, so they
  // agree with the program's own checks (which use that robot's type).
  const runRobotType = robots.find((r) => r.robot_id === runRobotId)?.robot_type ?? null
  const runIssues = useMemo(
    () => (runRobotId === draft.robot_id ? issues : validateMission(draft, { noGoZones, geofence, robotType: runRobotType }).issues),
    [runRobotId, draft, issues, runRobotType],
  )
  const run = useProgramRun({ mission, robots, robotId: runRobotId, blocks: program.blocks, missionIssues: runIssues, editorRef })
  // Leaving the Program tab or the editor while a run is going asks first.
  const [leaveRun, setLeaveRun] = useState<(() => void) | null>(null)
  const guardLeave = (go: () => void) => (run.state === 'idle' ? go() : setLeaveRun(() => go))

  const patch = (p: Partial<MissionLibraryEntry>) => setDraft((d) => ({ ...d, ...p }))
  const selected = draft.waypoints.find((w) => w.waypoint_id === selectedId) ?? null

  function addWaypoint(x_m: number, y_m: number) {
    const waypoint_id = `wp-${Date.now()}`
    const wp: MissionWaypoint = {
      waypoint_id, label: t('missions.workspace.defaultWaypoint', { n: draft.waypoints.length + 1 }),
      x_m, y_m, z_m: null, heading_deg: null, tolerance_m: 0.5, actions: [], status: 'pending',
    }
    patch({ waypoints: [...draft.waypoints, wp] })
    setSelectedId(waypoint_id)
  }
  function updateWaypoint(id: string, p: Partial<MissionWaypoint>) {
    patch({ waypoints: draft.waypoints.map((w) => (w.waypoint_id === id ? { ...w, ...p } : w)) })
  }
  function removeWaypoint(id: string) {
    patch({
      waypoints: draft.waypoints.filter((w) => w.waypoint_id !== id),
      segments: draft.segments.filter((s) => s.from_waypoint_id !== id && s.to_waypoint_id !== id),
    })
    setSelectedId(null)
  }
  function moveWaypoint(id: string, by: -1 | 1) {
    const i = draft.waypoints.findIndex((w) => w.waypoint_id === id)
    const j = i + by
    if (i < 0 || j < 0 || j >= draft.waypoints.length) return
    const next = [...draft.waypoints]
    ;[next[i], next[j]] = [next[j], next[i]]
    patch({ waypoints: next })
  }
  function updateSegment(seg: Segment) {
    const rest = draft.segments.filter((s) => !(s.from_waypoint_id === seg.from_waypoint_id && s.to_waypoint_id === seg.to_waypoint_id))
    const empty = seg.speed_mps === null && seg.gait === null && seg.posture === null && seg.wheel_leg_mode === null
    patch({ segments: empty ? rest : [...rest, seg] })
  }

  async function doSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const stored = await save(mission)
      setDraft(stored)
      setBaseline(fingerprint(stored))
      onSaved(stored.mission_id)
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }
  async function doDelete() {
    if (!isNew) await remove(draft.mission_id)
    onDeleted()
  }

  const e = mission.estimates!
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
      <div style={{
        flexShrink: 0, background: color.surface, borderBottom: `1px solid ${color.border}`,
        display: 'flex', alignItems: 'center', gap: space[3], padding: `${space[2]}px ${space[4]}px`, flexWrap: 'wrap',
      }}>
        <Button size="sm" variant="ghost" icon={ChevronLeft} onClick={() => guardLeave(() => (dirty ? setConfirm('leave') : onClose()))}>{t('missions.editor.back')}</Button>
        <input
          value={draft.name} onChange={(ev) => patch({ name: ev.target.value })} aria-label={t('missions.editor.name')}
          style={{
            background: 'transparent', border: '1px solid transparent', borderRadius: radius.sm, padding: '4px 6px',
            color: color.t1, fontSize: font.size.lg, fontWeight: font.weight.bold, fontFamily: font.family, minWidth: 160, width: 280,
          }}
          onFocus={(ev) => { ev.target.style.borderColor = color.border }}
          onBlur={(ev) => { ev.target.style.borderColor = 'transparent' }}
        />
        {/* The Program tab runs the program, so its header shows the program's checks, not the route's. */}
        {tab === 'program' ? <ChecksBadge validation={programRunValidation(run.programIssues, run.missionErrors)} /> : <>
          <Badge tone="amber" title={t('missions.cantRunWhy')}>{t('missions.cantRun')}</Badge>
          <ChecksBadge validation={mission.validation} />
          <span style={{ fontSize: font.size.sm, color: color.t2, fontVariantNumeric: 'tabular-nums' }} title={t('missions.editor.estimateNote')}>
            {formatLength(e.length_m)} · {formatDuration(e.duration_s)}
          </span>
        </>}
        <span style={{ flex: 1 }} />
        <Tabs<EditorTab>
          label={t('missions.editor.tabs')} value={tab} onChange={(v) => v !== tab && guardLeave(() => setTab(v))}
          options={(['route', 'program', 'announcements', 'rules'] as const).map((k) => ({ value: k, label: t(`missions.editor.tab.${k}`) }))}
        />
        <IconButton icon={Trash2} label={t('missions.editor.delete')} onClick={() => setConfirm('delete')} />
        <Button size="sm" variant="primary" icon={Save} disabled={!dirty || saving} onClick={doSave}>
          {saving ? t('missions.editor.saving') : dirty ? t('missions.editor.save') : t('missions.editor.saved')}
        </Button>
      </div>

      {leaveRun && (
        <div role="alert" style={{
          display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', padding: `${space[2]}px ${space[4]}px`,
          background: color.amberBg, fontSize: font.size.md, color: color.t1,
        }}>
          <span>{t('missions.program.run.leave.body')}</span>
          <Button size="sm" variant="danger" onClick={() => { run.stop(); setLeaveRun(null); leaveRun() }}>{t('missions.program.run.leave.confirm')}</Button>
          <Button size="sm" onClick={() => setLeaveRun(null)}>{t('missions.program.run.leave.cancel')}</Button>
        </div>
      )}
      {(confirm || saveError) && (
        <div role="alert" style={{
          display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', padding: `${space[2]}px ${space[4]}px`,
          background: confirm === 'delete' || saveError ? color.redBg : color.amberBg,
          borderBottom: `1px solid ${confirm === 'delete' || saveError ? color.redBorder : color.amberBorder}`,
          fontSize: font.size.md, color: color.t1,
        }}>
          {saveError && !confirm && <><span>{t('missions.editor.saveFailed', { error: saveError })}</span><Button size="sm" onClick={() => setSaveError(null)}>{t('missions.editor.dismiss')}</Button></>}
          {confirm === 'leave' && <>
            <span>{t('missions.editor.unsaved')}</span>
            <Button size="sm" variant="danger" onClick={onClose}>{t('missions.editor.discard')}</Button>
            <Button size="sm" onClick={() => setConfirm(null)}>{t('missions.editor.keepEditing')}</Button>
          </>}
          {confirm === 'delete' && <>
            <span>{t('missions.editor.confirmDelete', { name: draft.name })}</span>
            <Button size="sm" variant="danger" onClick={doDelete}>{t('missions.editor.delete')}</Button>
            <Button size="sm" onClick={() => setConfirm(null)}>{t('missions.editor.cancel')}</Button>
          </>}
        </div>
      )}

      {tab === 'route' && (
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <StepList waypoints={draft.waypoints} issues={issues} selectedId={selectedId} onSelect={setSelectedId} onMove={moveWaypoint} />
          <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
            <MissionMapEditor waypoints={draft.waypoints} selectedId={selectedId} onSelect={setSelectedId} onAddWaypoint={addWaypoint} flagged={flagged} />
            <div style={{ position: 'absolute', left: space[3], bottom: space[3], zIndex: 500, pointerEvents: 'none' }}>
              <Badge tone="amber">{t('missions.editor.noSiteMap')}</Badge>
            </div>
          </div>
          <StepInspector
            siteId={siteId} mission={mission} selected={selected} robotType={robotType}
            onUpdateWaypoint={updateWaypoint} onUpdateSegment={updateSegment} onRemove={removeWaypoint} onSelect={setSelectedId}
          />
        </div>
      )}
      {tab === 'program' && !draft.program_state && draft.waypoints.length > 0 && (
        <div role="note" style={{ padding: `${space[2]}px ${space[4]}px`, background: color.amberBg, fontSize: font.size.md, color: color.t1 }}>
          {t('missions.editor.programReplacesRoute')}
        </div>
      )}
      {tab === 'program' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            <BlocklyEditor
              ref={editorRef}
              initialState={draft.program_state}
              onCompile={(waypoints, state) => setDraft((d) => applyCompiledProgram(d, waypoints, state))}
              onProgram={(blocks, detached) => setProgram({ blocks, detached })}
            />
            <RunLog run={run} siteId={siteId} detached={program.detached} />
          </div>
          <ProgramRunBar run={run} robots={robots} robotId={runRobotId} onRobot={setPickedRobot} />
        </div>
      )}
      {tab === 'announcements' && <MissionAnnouncements mission={mission} siteId={siteId} timezone={timezone} onChange={patch} />}
      {tab === 'rules' && <MissionRules mission={mission} robots={robots} timezone={timezone} onChange={patch} />}
    </div>
  )
}
