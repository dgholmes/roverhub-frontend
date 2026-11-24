import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CalendarPlus, ChevronLeft, Save, Trash2 } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge, Button, IconButton, Tabs } from '@/components/kit'
import { useTouchShell } from '@/lib/useTouchShell'
import { ReadOnlyOnTouchNotice } from '@/components/touch/ReadOnlyOnTouchNotice'
import { computeEstimates } from '@/missions/estimates'
import { validateMission } from '@/missions/validate'
import { useMissionStore } from '@/missions/useMissionStore'
import { useTaskStore } from '@/missions/useTaskStore'
import { defaultRunRobot, missionRobotType, tasksOf } from '@/missions/taskPanel'
import { zonesFor } from '@/missions/zoneContext'
import { mapPropsFor, useMissionMap, useSiteMaps } from '@/missions/useMissionMap'
import type { MissionLibraryEntry, MissionWaypoint, RobotState, Segment, SiteMap } from '@/types'
import { ChecksBadge, formatDuration, formatLength } from './parts'
import { StepList } from './StepList'
import { StepInspector } from './StepInspector'
import { MissionAnnouncements } from './MissionAnnouncements'
import { MissionRules } from './MissionRules'
import { MissionMapEditor } from './route-editor/MissionMapEditor'
import { MissionMapMenu } from './route-editor/MissionMapMenu'
import { RoutePreviewMap } from './RoutePreviewMap'
import { BlocklyEditor } from './visual-program/BlocklyEditor'
import { ProgramPreview } from './visual-program/ProgramPreview'
import { savedProgramBlocks } from './visual-program/savedProgram'
import { applyProgramState, editorTabs, estimatesDiffer, startTab, type EditorTab } from '@/missions/authoring'
import { compileProgram } from '@/missions/program/compile'
import { programStepsForSave } from '@/missions/program/prepareRun'
import { useEdgeTestRun, type ProgramEditorHandle } from '@/missions/program/useEdgeTestRun'
import type { ProgramBlock } from '@/missions/program/types'
import { programRunValidation } from '@/missions/program/runBlockers'
import { ProgramRunBar } from './program/ProgramRunBar'
import { RunLog } from './program/RunLog'

export type { EditorTab }

const NO_BLOCKS: ProgramBlock[] = []

/** Space the read-only preview keeps clear of the badge floating over it, as
 *  the mission library's own preview does. */
const PREVIEW_PADDING = { topLeft: [24, 24] as [number, number], bottomRight: [24, 56] as [number, number] }

/** What decides "unsaved": the mission itself, not what's derived from it. */
function fingerprint(m: MissionLibraryEntry): string {
  const { validation: _v, estimates: _e, updated_at: _u, ...rest } = m
  return JSON.stringify(rest)
}

/**
 * Full-width mission editor (Missions layout A): steps on the left, the map
 * in the middle, the selected step on the right; Announcements and Settings as
 * tabs. Who runs the mission and when is a task's, made on the Schedule page
 * (the header's Schedule button starts one). Edits a copy; nothing reaches the
 * library until Save. Checks and estimates are recomputed on every edit and
 * saved with the mission.
 */
export function MissionEditor({ siteId, initial, isNew, robots, timezone, initialTab = 'route', onTabChange, onClose, onSaved, onDeleted, onSchedule }: {
  siteId: string
  initial: MissionLibraryEntry
  isNew: boolean
  robots: RobotState[]
  timezone: string
  initialTab?: EditorTab
  /** The tab the operator switched to, so the address can carry it. */
  onTabChange?: (tab: EditorTab) => void
  onClose: () => void
  onSaved: (id: string) => void
  onDeleted: () => void
  /** Make a task for this (saved) mission. */
  onSchedule: (missionId: string) => void
}) {
  const { t } = useTranslation()
  // A thumb cannot drag a waypoint or rearrange a block, so on touch the
  // editor opens readable and navigable instead of editable (M4 §7.6.3).
  // Running the mission is not editing it: Run now and Schedule stay live.
  const { touch: readOnly } = useTouchShell()
  const save = useMissionStore((s) => s.save)
  const remove = useMissionStore((s) => s.remove)
  const [draft, setDraft] = useState<MissionLibraryEntry>(initial)
  const [baseline, setBaseline] = useState(() => (isNew ? '' : fingerprint(initial)))
  // What storage holds for a program's estimate; see estimatesDiffer.
  const [baselineEstimates, setBaselineEstimates] = useState(initial.estimates)
  const [tab, setTab] = useState<EditorTab>(() => startTab(initial.kind, initialTab))
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // The map the mission is planned on, which the checks and the canvas share:
  // the zones the canvas draws are the zones the checks use. A mission is only
  // checked against its own map, and says so when it has none to check against.
  const { resolved: resolvedMap, retry: retryMap } = useMissionMap(siteId, draft.map_id)
  const { maps, shown: siteMap } = useSiteMaps(siteId)
  const zones = useMemo(
    () => zonesFor(draft.map_id, resolvedMap.status === 'map' ? [resolvedMap.map] : null),
    [draft.map_id, resolvedMap],
  )
  const [confirm, setConfirm] = useState<'leave' | 'delete' | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // The mission has no robot of its own: its tasks do. The checks that care
  // about a robot's type read it from them, and read "unknown" when they differ.
  const allTasks = useTaskStore((s) => s.tasks)
  const loadTasks = useTaskStore((s) => s.loadTasks)
  useEffect(() => { void loadTasks(siteId) }, [siteId, loadTasks])
  const missionTasks = useMemo(() => tasksOf(allTasks, draft.mission_id), [allTasks, draft.mission_id])
  const robotType = useMemo(() => missionRobotType(missionTasks, robots), [missionTasks, robots])
  const taskRobotId = defaultRunRobot(missionTasks)
  // The program as the block canvas last reported it. `null` until the canvas
  // has opened: a program mission's blocks cannot be read without it.
  const [program, setProgram] = useState<{ blocks: ProgramBlock[]; detached: number } | null>(null)
  const mission = useMemo<MissionLibraryEntry>(() => ({
    ...draft,
    // A program's estimate is computed here, from the canvas, and saved with
    // the mission -- nothing outside the editor can compile one. Until the
    // canvas has opened there is no program to read, and the stored estimate
    // stands (computeEstimates returns it): an empty program would overwrite
    // it with zeros.
    estimates: computeEstimates(draft, draft.kind === 'program' && program ? compileProgram(program.blocks, robotType) : undefined),
    validation: validateMission(draft, { ...zones, robotType }),
  }), [draft, robotType, program, zones])
  // A program's estimate is stored, not derived, so a recomputed one that
  // differs from storage is a change worth saving even though nothing was edited.
  const estimateStale = draft.kind === 'program' && program !== null && estimatesDiffer(baselineEstimates, mission.estimates!)
  const dirty = fingerprint(draft) !== baseline || estimateStale
  const issues = mission.validation!.issues
  const flagged = useMemo(() => {
    const out: Record<string, 'error' | 'warning'> = {}
    for (const i of issues) if (i.waypoint_id && i.severity !== 'info' && out[i.waypoint_id] !== 'error') out[i.waypoint_id] = i.severity as 'error' | 'warning'
    return out
  }, [issues])

  // Program runs: the robot defaults to the one the mission's tasks share until one is picked here.
  const editorRef = useRef<ProgramEditorHandle>(null)
  const [pickedRobot, setPickedRobot] = useState<string | undefined | null>(null)
  const runRobotId = pickedRobot === null ? taskRobotId : pickedRobot
  // The mission's checks against the robot the program will run on, so they
  // agree with the program's own checks (which use that robot's type).
  const runRobotType = robots.find((r) => r.robot_id === runRobotId)?.robot_type ?? null
  const runIssues = useMemo(
    () => (runRobotType === robotType ? issues : validateMission(draft, { ...zones, robotType: runRobotType }).issues),
    [runRobotType, robotType, draft, issues, zones],
  )
  // A test run goes on the robot's edge device, so leaving the editor does not
  // stop it: it carries on, with its Stop and take-over in LiveOps.
  // A route runs only on its own map, and only while that is active (the
  // backend refuses a missing, draft or archived one): whichever map Missions shows.
  const routeMapActive = resolvedMap.status === 'map' && resolvedMap.map.status === 'active'
  // The block canvas never opens read-only, so there is no live program to
  // compile: the run uses the saved one, exactly as the Schedule page's Run
  // now does (programBlocksForRun). Kept out of `program`, whose job is to
  // say a program was edited -- adopting it there would recompute the stored
  // estimate, read as unsaved, and take the Schedule button away.
  const savedBlocks = useMemo(
    () => (readOnly && draft.kind === 'program' ? savedProgramBlocks(draft.program_state) : null),
    [readOnly, draft.kind, draft.program_state],
  )
  const run = useEdgeTestRun({ mission, robots, robotId: runRobotId, blocks: program?.blocks ?? savedBlocks ?? NO_BLOCKS, missionIssues: runIssues, editorRef, routeMapActive })

  const patch = (p: Partial<MissionLibraryEntry>) => setDraft((d) => ({ ...d, ...p }))
  // Moving the mission to another map: only while the route is empty, since
  // points are placed in their map's own frame (MissionMapMenu).
  const replaceMap = (m: SiteMap) => patch({ map_id: m.map_id })
  const chooseMap = (mapId: string) => {
    if (draft.waypoints.length > 0) return
    if (!mapId) { patch({ map_id: '' }); return }
    const m = maps?.find((x) => x.map_id === mapId)
    if (m) replaceMap(m)
  }
  const selected = draft.waypoints.find((w) => w.waypoint_id === selectedId) ?? null

  function addWaypoint(x_m: number, y_m: number, z_m: number | null) {
    const waypoint_id = `wp-${Date.now()}`
    const wp: MissionWaypoint = {
      waypoint_id, label: t('missions.workspace.defaultWaypoint', { n: draft.waypoints.length + 1 }),
      x_m, y_m, z_m, heading_deg: null, tolerance_m: 0.5, actions: [], status: 'pending',
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
      const steps = programStepsForSave(mission.kind, editorRef.current?.programBlocks(), mission.program_state)
      const toSave = steps === undefined ? mission : { ...mission, program_steps: steps }
      const stored = await save(toSave)
      setDraft(stored)
      setBaseline(fingerprint(stored))
      setBaselineEstimates(stored.estimates)
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
        <Button size="sm" variant="ghost" icon={ChevronLeft} onClick={() => (dirty ? setConfirm('leave') : onClose())}>{t('missions.editor.back')}</Button>
        <input
          value={draft.name} onChange={(ev) => patch({ name: ev.target.value })} aria-label={t('missions.editor.name')}
          disabled={readOnly}
          style={{
            background: 'transparent', border: '1px solid transparent', borderRadius: radius.sm, padding: '4px 6px',
            color: color.t1, fontSize: font.size.lg, fontWeight: font.weight.bold, fontFamily: font.family, minWidth: 160, width: 280,
          }}
          onFocus={(ev) => { ev.target.style.borderColor = color.border }}
          onBlur={(ev) => { ev.target.style.borderColor = 'transparent' }}
        />
        {/* The Program tab runs the program, so its header shows the program's checks, not the route's. */}
        {tab === 'program' ? <ChecksBadge validation={programRunValidation(run.programIssues, run.missionErrors)} ready={run.blockers.length === 0} /> : <>
          <ChecksBadge validation={mission.validation} />
          <span
            style={{ fontSize: font.size.sm, color: color.t2, fontVariantNumeric: 'tabular-nums' }}
            title={draft.kind === 'program'
              ? t(e.duration_bounded ? 'missions.editor.estimateNoteProgram' : 'missions.editor.estimateNoteProgramUnbounded')
              : t('missions.editor.estimateNote')}
          >
            {formatLength(e.length_m)} · {formatDuration(e.duration_s)}
            {draft.kind === 'program' && !e.duration_bounded && ` · ${t('missions.editor.mayRunLonger')}`}
          </span>
        </>}
        <span style={{ flex: 1 }} />
        <Tabs<EditorTab>
          label={t('missions.editor.tabs')} value={tab} onChange={(v) => { if (v !== tab) { setTab(v); onTabChange?.(v) } }}
          options={editorTabs(draft.kind).map((k) => ({ value: k, label: t(`missions.editor.tab.${k}`) }))}
        />
        {/* A task points at the saved mission, so unsaved edits would not be what it runs. */}
        <Button
          size="sm" icon={CalendarPlus} disabled={isNew || dirty}
          title={isNew || dirty ? t('missions.editor.scheduleSaveFirst') : undefined}
          onClick={() => onSchedule(draft.mission_id)}
        >
          {t('missions.editor.schedule')}
        </Button>
        <IconButton icon={Trash2} label={t('missions.editor.delete')} disabled={readOnly} onClick={() => setConfirm('delete')} />
        <Button size="sm" variant="primary" icon={Save} disabled={readOnly || !dirty || saving} onClick={doSave}>
          {saving ? t('missions.editor.saving') : dirty ? t('missions.editor.save') : t('missions.editor.saved')}
        </Button>
      </div>

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

      {readOnly && <ReadOnlyOnTouchNotice what="mission" />}

      {tab === 'route' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <StepList waypoints={draft.waypoints} lengthM={e.length_m} durationS={e.duration_s} issues={issues} selectedId={selectedId} onSelect={setSelectedId} onMove={moveWaypoint} readOnly={readOnly} />
          <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
            {/* The library's own preview of the same route: pannable and
                zoomable, with nothing to drag. */}
            {readOnly ? (
              <RoutePreviewMap
                missionId={draft.mission_id} waypoints={draft.waypoints}
                map={resolvedMap.status === 'map' ? resolvedMap.map : undefined}
                flagged={flagged} padding={PREVIEW_PADDING}
              />
            ) : (
              <MissionMapEditor
                fitKey={draft.mission_id} mapId={draft.map_id} {...mapPropsFor(resolvedMap, siteMap)}
                onReplace={replaceMap} onClear={() => patch({ map_id: '' })} onRetry={retryMap}
                mapControl={(resolvedMap.status === 'map' || resolvedMap.status === 'none') && (
                  <MissionMapMenu
                    current={resolvedMap.status === 'map' ? resolvedMap.map : undefined} maps={maps}
                    waypointCount={draft.waypoints.length} onChange={chooseMap}
                  />
                )}
                // While a test run walks the route, the waypoint the robot is on
                // takes the selected style (it is not selected for editing).
                waypoints={draft.waypoints} selectedId={run.activeWaypointId ?? selectedId} onSelect={setSelectedId} onAddWaypoint={addWaypoint} flagged={flagged}
              />
            )}
            {resolvedMap.status === 'none' && (
              <div style={{ position: 'absolute', left: space[3], bottom: space[3], zIndex: 500, pointerEvents: 'none' }}>
                <Badge tone="amber">{t('missions.editor.noSiteMap')}</Badge>
              </div>
            )}
          </div>
          <StepInspector
            siteId={siteId} ownerId={taskRobotId ?? `site-${siteId}`} mission={mission} selected={selected} robotType={robotType}
            onUpdateWaypoint={updateWaypoint} onUpdateSegment={updateSegment} onRemove={removeWaypoint} onSelect={setSelectedId}
            readOnly={readOnly}
          />
        </div>
        {/* The same run bar as the Program tab: a route runs on the robot too (schema 0.0.16). */}
        {mission.kind === 'route' && <ProgramRunBar run={run} robots={robots} robotId={runRobotId} onRobot={setPickedRobot} />}
        </div>
      )}
      {tab === 'program' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
            {/* The library's own read-only canvas: zoom and pan the blocks,
                with no toolbox and nothing to drag. */}
            {readOnly ? (
              <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
                <ProgramPreview state={draft.program_state} />
              </div>
            ) : (
              <BlocklyEditor
                ref={editorRef}
                initialState={draft.program_state}
                onState={(state) => setDraft((d) => applyProgramState(d, state))}
                onProgram={(blocks, detached) => setProgram({ blocks, detached })}
              />
            )}
            <RunLog run={run} siteId={siteId} detached={program?.detached ?? 0} />
          </div>
          <ProgramRunBar run={run} robots={robots} robotId={runRobotId} onRobot={setPickedRobot} />
        </div>
      )}
      {/* These two write to the mission as surely as the route does, and their
          tab stays reachable on touch -- so they are read-only there too. An
          edit here would make the mission dirty, which disables both Schedule
          and Save, leaving no way to undo it but Back and discard. */}
      {tab === 'announcements' && <MissionAnnouncements mission={mission} siteId={siteId} ownerId={taskRobotId ?? `site-${siteId}`} timezone={timezone} onChange={patch} readOnly={readOnly} />}
      {tab === 'settings' && <MissionRules mission={mission} onChange={patch} readOnly={readOnly} />}
    </div>
  )
}
