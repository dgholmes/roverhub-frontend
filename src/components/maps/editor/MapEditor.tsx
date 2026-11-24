import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Save, X } from 'lucide-react'
import { Button, IconButton, Segmented } from '@/components/kit'
import { color, font, radius, space } from '@/design-system/tokens'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { useTouchShell } from '@/lib/useTouchShell'
import { ReadOnlyOnTouchNotice } from '@/components/touch/ReadOnlyOnTouchNotice'
import { useCan } from '@/org/useCan'
import { boxFromRect, countInBoxes, DEFAULT_BAND, clampBand, fromMapBox, rectUsable, toMapBox, type FloorRect, type SceneEditBox } from '@/scene3d/boxSelect'
import { buildSceneGrid, classifyCloud } from '@/scene3d/sceneData'
import type { SceneData } from '@/scene3d/types'
import type { SiteMap } from '@/types/maps'
import { editorSceneGrid, floorFrame, pixelsOf } from './editorGrid'
import {
  EMPTY_STAGED, addBox, decide, dropBox, idsWith, pendingChanges, planIsEmpty, planSave, removeAll, runSave,
  type BlobDecision, type SaveStep, type Staged,
} from './editSession'
import { EditorScene } from './EditorScene'
import { FloorEditCanvas, type EditorTool, type StrokeEvent } from './FloorEditCanvas'
import { DEFAULT_BRUSH_SIZE, PlanningEdit } from './gridEdit'
import { MovedList } from './MovedList'
import { FindMovingPanel } from './FindMovingPanel'
import { FlatToolRail, SceneToolRail } from './ToolRail'
import { useEditorCloud, useEditorFloor } from './useEditorFloor'

type Tab = 'flat' | 'scene'

/** The cloud-edits job's stages (maps/ on the backend, 2026-11-16); one this
 *  list does not know is shown as the job wrote it. */
const STAGE_KEYS: Record<string, 'queued' | 'reading' | 'removing' | 'grid' | 'saving'> = {
  queued: 'queued', 'reading the floor': 'reading', 'removing points': 'removing',
  're-rasterising the planning grid': 'grid', 'saving a new version': 'saving',
}

/** Where each viewer's "Show things that moved" choice is kept. */
export const SHOW_MOVED_KEY = 'rh.mapEditor.showMoved'

/** On unless this viewer turned it off. Storage that throws (a private window,
 *  blocked site data) reads as on. */
function readShowMoved(): boolean {
  try {
    return window.localStorage.getItem(SHOW_MOVED_KEY) !== 'off'
  } catch {
    return true
  }
}

function writeShowMoved(shown: boolean): void {
  try {
    window.localStorage.setItem(SHOW_MOVED_KEY, shown ? 'on' : 'off')
  } catch { /* not remembered: it still applies on this page */ }
}

/**
 * Missions › Maps › Edit map: clean one floor of a map, for engineers.
 *
 * Flat (option A): a brush on the planning grid -- Erase paints walkable,
 * Restore blocked, as a round brush or a box, with Undo -- and the list of
 * spots the moving-object check marked "probably moved", each staged to Remove
 * or Keep. 3D (option C): box-select points in the floor's cloud and stage
 * them for deletion.
 *
 * Nothing leaves the page until "Save version", which sends the three kinds of
 * change in order (editSession.ts) and follows the cloud job; every save is a
 * new version, drops an active map to draft and queues the quality check.
 * Closing with unsaved changes asks first, in the page.
 */
export function MapEditor({ map, floorIndex, onClose, onSaved, pollMs }: {
  map: SiteMap
  floorIndex: number
  onClose: () => void
  /** A save changed the map (also after a partial failure). */
  onSaved: (map: SiteMap) => void
  pollMs?: number
}) {
  const { t } = useTranslation()
  // The backend lets editZones or configure make every edit here (Engineer, Supervisor).
  const canEditZones = useCan('editZones')
  const canConfigure = useCan('configure')
  const mayEdit = canEditZones || canConfigure
  // Every edit here is drawn with a pointer, which a thumb cannot be, so on
  // touch the map opens to read and the drawing tools are not offered at all
  // (M4 §7.6.3). One gate: everything below hangs off `canEdit`.
  const { touch } = useTouchShell()
  const canEdit = mayEdit && !touch
  const floor = map.floors.find((f) => f.index === floorIndex) ?? null
  const frame = useMemo(() => (floor ? floorFrame(floor) : null), [floor])
  // Bumped when "Find moving things again" stored a new moved list, which a
  // backend may store without a new map version.
  const [movedReloads, setMovedReloads] = useState(0)
  // "Show things that moved" (spec 4.7): drawing only, remembered per viewer.
  const [showMoved, setShowMovedState] = useState(readShowMoved)
  const setShowMoved = (shown: boolean) => { setShowMovedState(shown); writeShowMoved(shown) }
  const loaded = useEditorFloor(map, floorIndex, `${map.updated_at}#${movedReloads}`)

  // The planning grid being edited; a new load (after a save) starts over.
  // None when the floor has no planning grid: the brush is then off. It is never
  // started from the survey grid, which is a slice above the furniture and
  // would make desks walkable.
  const edit = useMemo(
    () => (loaded.status === 'ready' && loaded.planning && frame ? new PlanningEdit(frame, loaded.planning.pixels) : null),
    [loaded, frame])
  const [revision, setRevision] = useState(0)
  const bump = () => setRevision((r) => r + 1)

  const [tool, setTool] = useState<EditorTool>({ mode: 'move', shape: 'brush', size: DEFAULT_BRUSH_SIZE })
  const [tab, setTab] = useState<Tab>('flat')
  const [staged, setStaged] = useState<Staged>(EMPTY_STAGED)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null)
  const [saving, setSaving] = useState(false)
  const [steps, setSteps] = useState<SaveStep[] | null>(null)
  const [saveResult, setSaveResult] = useState<'ok' | 'failed' | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [confirmLeave, setConfirmLeave] = useState(false)
  // 3D
  const [selecting, setSelecting] = useState(true)
  const [band, setBand] = useState<[number, number]>([DEFAULT_BAND[0], DEFAULT_BAND[1]])
  const [draft, setDraft] = useState<FloorRect | null>(null)
  const [picked, setPicked] = useState<FloorRect | null>(null)

  // A new load is a fresh start: what was staged referred to the old files.
  useEffect(() => {
    setStaged(EMPTY_STAGED)
    setSelectedId(null)
    setPicked(null)
    setDraft(null)
  }, [loaded])

  const blobs = useMemo(() => (loaded.status === 'ready' ? loaded.moved?.blobs ?? [] : []), [loaded])
  const brushedCells = useMemo(() => edit?.changedCells() ?? 0,
    // `revision` is when the edit's cells change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [edit, revision])
  const plan = useMemo(() => {
    const diff = edit && brushedCells > 0 ? edit.diff() : null
    return planSave({
      brush: diff && edit && frame ? { ...diff, w: frame.w, h: frame.h, base: edit.base() } : null,
      staged,
    })
  }, [edit, frame, brushedCells, staged])
  const pending = pendingChanges(plan)
  const dirty = !planIsEmpty(plan)

  // Closing the tab with unsaved changes: the browser's own question.
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const grid = useMemo(() => {
    if (loaded.status !== 'ready' || !frame) return null
    if (edit) return editorSceneGrid(loaded.structure, pixelsOf(frame, edit.pixels), frame)
    return buildSceneGrid(loaded.structure, null, frame.res, frame.origin)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, frame, edit, revision])

  const onStroke = useCallback((e: StrokeEvent) => {
    if (!edit || tool.mode === 'move') return
    if (e.kind === 'begin') edit.begin()
    else if (e.kind === 'cells') { if (edit.apply(e.indices, tool.mode)) bump() }
    else { edit.end(); bump() }
    setSaveResult(null)
  }, [edit, tool.mode])

  const undo = useCallback(() => { if (edit?.undo()) bump() }, [edit])

  const select = (id: string | null) => {
    setSelectedId(id)
    if (id) setFocus((f) => ({ id, n: (f?.n ?? 0) + 1 }))
  }
  const decideBlob = (id: string, d: BlobDecision | null) => { setStaged((s) => decide(s, id, d)); setSaveResult(null) }

  // --- 3D ---------------------------------------------------------------------
  const cloud = useEditorCloud(map, floorIndex, floor?.floor_z_m ?? 0, map.updated_at, tab === 'scene')
  const sceneGrid = tab === 'scene' ? grid : null
  const sceneData: SceneData | null = useMemo(() => {
    if (cloud.status !== 'ready' || !sceneGrid || !floor) return null
    return {
      mapId: map.map_id, floorIndex, floorZ: floor.floor_z_m, grid: sceneGrid,
      cloud: classifyCloud(cloud.xyz, sceneGrid, floor.floor_z_m), hasPlanning: !!edit,
    }
    // Built when the 3D tab opens; the brush is not reachable from there.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud, sceneGrid])
  const floorZ = floor?.floor_z_m ?? 0
  const pickedBox = picked ? boxFromRect(picked, band) : null
  const inPicked = useMemo(
    () => (pickedBox && cloud.status === 'ready' ? countInBoxes(cloud.xyz, [toMapBox(pickedBox, floorZ)]) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cloud, picked, band[0], band[1], floorZ])
  const sceneBoxes: SceneEditBox[] = useMemo(() => {
    const out: SceneEditBox[] = []
    for (const b of blobs) {
      if (!showMoved || staged.decisions[b.id] !== 'remove') continue
      out.push({ id: `blob-${b.id}`, tone: 'moved', min: [b.bbox[0], b.bbox[1], b.z_range[0] - floorZ], max: [b.bbox[2], b.bbox[3], b.z_range[1] - floorZ] })
    }
    for (const s of staged.boxes) out.push({ id: s.id, tone: 'staged', ...fromMapBox(s.box, floorZ) })
    const live = draft ?? picked
    if (live) out.push({ id: 'draft', tone: 'draft', ...boxFromRect(live, band) })
    return out
  }, [blobs, staged, draft, picked, band, floorZ, showMoved])

  const onBoxSelect = useCallback((rect: FloorRect) => {
    setDraft(null)
    setPicked(rectUsable(rect) ? rect : null)
  }, [])
  const deletePicked = () => {
    if (!pickedBox) return
    setStaged((s) => addBox(s, toMapBox(pickedBox, floorZ)))
    setPicked(null)
    setSaveResult(null)
  }

  // --- save -------------------------------------------------------------------
  const save = async () => {
    if (planIsEmpty(plan) || saving) return
    setSaving(true)
    setSaveResult(null)
    setSaveError(null)
    const outcome = await runSave(dataProvider, {
      mapId: map.map_id, floorIndex, plan, clearanceM: floor?.planning?.clearance_m, pollMs, onSteps: setSteps,
    })
    setSaving(false)
    setSaveResult(outcome.ok ? 'ok' : 'failed')
    if (!outcome.ok) setSaveError(outcome.steps.find((s) => s.status === 'failed')?.error ?? '')
    if (outcome.map) onSaved(outcome.map)
  }

  const close = () => {
    if (dirty && !saving) setConfirmLeave(true)
    else onClose()
  }

  // A new moved list was stored by the robot: take the map as it is now (a new
  // version, usually) and reload the floor's files.
  const onFound = useCallback(() => {
    void dataProvider.getMap(map.map_id).catch(() => null).then((fresh) => {
      if (fresh && fresh.updated_at !== map.updated_at) onSaved(fresh)
      setMovedReloads((n) => n + 1)
    })
  }, [map.map_id, map.updated_at, onSaved])

  // Whoever may not edit here at all sees nothing, as before. Whoever may, but
  // on a touch screen, is told why the tools are gone -- with the way back out,
  // since this editor's own Close is the only one the Maps page offers while it
  // is open, and nothing here can be unsaved.
  if (!canEdit) {
    if (!mayEdit) return null
    return (
      <section aria-label={t('missions.maps.editor.title')} style={{ display: 'grid', gap: space[3], justifyItems: 'start', minWidth: 0 }}>
        <ReadOnlyOnTouchNotice what="zones" />
        <Button icon={X} style={{ minHeight: 44 }} onClick={onClose}>{t('missions.maps.editor.close')}</Button>
      </section>
    )
  }

  const note: React.CSSProperties = { margin: 0, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }
  const floorName = floor?.label ?? t('liveops.map.floorN', { index: floorIndex })
  const chips: string[] = []
  if (brushedCells) chips.push(t('missions.maps.editor.pending.cells', { count: brushedCells }))
  const removing = idsWith(staged, 'remove').length
  if (removing) chips.push(t('missions.maps.editor.pending.remove', { count: removing }))
  if (staged.boxes.length) chips.push(t('missions.maps.editor.pending.boxes', { count: staged.boxes.length }))
  const keeping = idsWith(staged, 'keep').length
  if (keeping) chips.push(t('missions.maps.editor.pending.keep', { count: keeping }))

  let canvas: React.ReactNode
  if (loaded.status === 'loading') canvas = <Centered>{t('missions.maps.editor.loading')}</Centered>
  else if (loaded.status === 'error') canvas = <Centered alert>{t('missions.maps.editor.loadFailed', { error: loaded.error })}</Centered>
  else if (loaded.status === 'unavailable' || !grid || !frame) canvas = <Centered>{t('missions.maps.editor.unavailable')}</Centered>
  else if (tab === 'flat') {
    canvas = (
      <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: radius.md, overflow: 'hidden' }}>
        <FloorEditCanvas
          grid={grid} frame={frame} blobs={blobs} decisions={staged.decisions} selectedId={selectedId} focus={focus}
          tool={tool} canPaint={!!edit && !saving} onSelect={(id) => setSelectedId(id)} onStroke={onStroke} onUndo={undo}
          label={t('missions.maps.editor.canvasAria')} showMoved={showMoved}
        />
        {!edit && (
          <div style={{
            position: 'absolute', left: space[3], right: space[3], top: space[3], maxWidth: 520, padding: space[3],
            borderRadius: radius.md, background: color.amberBg, backdropFilter: 'blur(24px)', display: 'grid', gap: space[2],
            justifyItems: 'start',
          }}>
            <p role="status" style={{ ...note, color: color.t1 }}>{t('missions.maps.editor.noPlanning')}</p>
          </div>
        )}
      </div>
    )
  } else if (cloud.status === 'ready' && sceneData) {
    canvas = (
      <EditorScene
        data={sceneData} selecting={selecting && !saving} boxes={sceneBoxes} highlight={showMoved ? cloud.movedXyh : null}
        onBoxDraft={setDraft} onBoxSelect={onBoxSelect}
      />
    )
  } else if (cloud.status === 'none') canvas = <Centered>{t('missions.maps.editor.scene.none')}</Centered>
  else if (cloud.status === 'error') canvas = <Centered alert>{t('missions.maps.editor.scene.failed', { error: cloud.error })}</Centered>
  else canvas = <Centered>{t('missions.maps.editor.scene.loading')}</Centered>

  const ready = loaded.status === 'ready'
  const movedState = !ready ? { kind: 'ready' as const }
    : loaded.movedError ? { kind: 'error' as const, error: loaded.movedError }
      : loaded.moved ? { kind: 'ready' as const } : { kind: 'notRun' as const }

  return (
    <section aria-label={t('missions.maps.editor.title')} style={{ display: 'grid', gap: space[4], minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0, fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.t1 }}>
          {t('missions.maps.editor.title')}
          <span style={{ color: color.t3, fontWeight: font.weight.medium }}> · {floorName}</span>
        </h3>
        <Segmented<Tab>
          label={t('missions.maps.editor.viewAria')} value={tab} onChange={setTab}
          options={[{ value: 'flat', label: t('missions.maps.editor.flat') }, { value: 'scene', label: t('missions.maps.editor.threeD') }]}
        />
        <span style={{ flex: 1 }} />
        <span data-testid="pending" style={{ fontSize: font.size.sm, color: chips.length ? color.t2 : color.t3 }}>
          {chips.length ? chips.join(' · ') : t('missions.maps.editor.nothingToSave')}
        </span>
        <Button variant="primary" icon={Save} disabled={!dirty || saving || !ready} onClick={() => void save()}>
          {saving ? t('missions.maps.editor.saving') : t('missions.maps.editor.save')}
        </Button>
        <Button icon={X} disabled={saving} onClick={close}>{t('missions.maps.editor.close')}</Button>
      </div>

      <p style={note}>{map.status === 'active' ? t('missions.maps.editor.activeNote') : t('missions.maps.editor.draftNote')}
</p>

      {confirmLeave && (
        <div role="alertdialog" aria-label={t('missions.maps.editor.leave.question', { count: pending })} style={{
          display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', padding: space[3],
          borderRadius: radius.md, background: color.amberBg,
        }}>
          <span style={{ flex: 1, fontSize: font.size.md, color: color.t1 }}>{t('missions.maps.editor.leave.question', { count: pending })}</span>
          <Button variant="danger" onClick={() => { setConfirmLeave(false); onClose() }}>{t('missions.maps.editor.leave.discard')}</Button>
          <Button onClick={() => setConfirmLeave(false)}>{t('missions.maps.editor.leave.stay')}</Button>
        </div>
      )}

      {steps && (saving || saveResult) && <SaveProgress steps={steps} result={saveResult} error={saveError} />}

      <div style={{ display: 'flex', gap: space[3], alignItems: 'stretch', flexWrap: 'wrap', minWidth: 0 }}>
        {tab === 'flat'
          ? (
            <FlatToolRail tool={tool} onTool={setTool} canPaint={!!edit && !saving} canUndo={!!edit && edit.strokes > 0 && !saving}
              onUndo={undo} res={frame?.res ?? 0.05} showMoved={showMoved} onShowMoved={setShowMoved} />
          )
          : (
            <SceneToolRail
              selecting={selecting} onSelecting={setSelecting} band={band}
              onBand={(b) => setBand(clampBand(b[0], b[1]))} canDelete={!!picked && !saving}
              onDelete={deletePicked} onClear={() => setPicked(null)} showMoved={showMoved} onShowMoved={setShowMoved}
            />
          )}
        <div style={{ flex: '1 1 420px', minWidth: 0, height: 600, borderRadius: radius.md, overflow: 'hidden' }}>{canvas}</div>
        <div style={{ flex: '0 1 300px', minWidth: 240, height: 600, display: 'flex', flexDirection: 'column', gap: space[3] }}>
          <MovedList
            blobs={blobs} state={movedState} decisions={staged.decisions} selectedId={selectedId} busy={saving}
            onSelect={select} onDecide={decideBlob} onRemoveAll={() => { setStaged((s) => removeAll(s, blobs)); setSaveResult(null) }}
          />
          {tab === 'flat' && <FindMovingPanel map={map} floorIndex={floorIndex} dirty={dirty} saving={saving} onFound={onFound} />}
          {tab === 'scene' && (
            <BoxList boxes={staged.boxes.map((s) => ({ id: s.id, ...fromMapBox(s.box, floorZ) }))} inPicked={inPicked}
              busy={saving} onDrop={(id) => setStaged((s) => dropBox(s, id))} />
          )}
          {tab === 'flat' && edit && <p style={{ ...note, fontSize: font.size.xs }}>{t('missions.maps.editor.tools.unknownNote')}</p>}
        </div>
      </div>
    </section>
  )
}

function Centered({ children, alert = false }: { children: React.ReactNode; alert?: boolean }) {
  return (
    <div role={alert ? 'alert' : 'status'} style={{
      width: '100%', height: '100%', display: 'grid', placeItems: 'center', padding: space[6], textAlign: 'center',
      background: color.sceneBg, color: alert ? color.red : color.t2, fontFamily: font.family, fontSize: font.size.md,
    }}>
      {children}
    </div>
  )
}

/** The boxes staged for deletion in 3D, and how many points the one picked holds. */
function BoxList({ boxes, inPicked, busy, onDrop }: {
  boxes: { id: string; min: [number, number, number]; max: [number, number, number] }[]
  inPicked: number | null
  busy: boolean
  onDrop: (id: string) => void
}) {
  const { t } = useTranslation()
  const note: React.CSSProperties = { margin: 0, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }
  return (
    <section aria-label={t('missions.maps.editor.scene.boxes')} style={{ display: 'grid', gap: space[2], padding: space[3], borderRadius: radius.lg, background: color.hover }}>
      <h3 style={{ margin: 0, fontSize: font.size.md, fontWeight: font.weight.bold, color: color.t1 }}>{t('missions.maps.editor.scene.boxes')}</h3>
      {inPicked !== null && (
        <p role="status" style={{ ...note, color: color.t1, fontVariantNumeric: 'tabular-nums' }}>
          {t('missions.maps.editor.scene.inBox', { count: inPicked })}
        </p>
      )}
      {boxes.length === 0 ? <p style={note}>{t('missions.maps.editor.scene.noBoxes')}</p> : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2 }}>
          {boxes.map((b, k) => (
            <li key={b.id} style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: radius.full, background: color.red, flexShrink: 0 }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: font.size.md, color: color.t1 }}>{t('missions.maps.editor.scene.boxN', { n: k + 1 })}</span>
                <span style={{ display: 'block', fontSize: font.size.sm, color: color.t2, fontVariantNumeric: 'tabular-nums' }}>
                  {t('missions.maps.editor.scene.boxDetail', {
                    w: (b.max[0] - b.min[0]).toFixed(1), d: (b.max[1] - b.min[1]).toFixed(1), lo: b.min[2].toFixed(1), hi: b.max[2].toFixed(1),
                  })}
                </span>
              </span>
              <IconButton icon={X} size="sm" disabled={busy} onClick={() => onDrop(b.id)} label={t('missions.maps.editor.scene.dropBox', { n: k + 1 })} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** The save's steps as they run, then what it did. */
function SaveProgress({ steps, result, error }: { steps: SaveStep[]; result: 'ok' | 'failed' | null; error: string | null }) {
  const { t } = useTranslation()
  const dot = (s: SaveStep['status']) => (s === 'done' ? color.green : s === 'failed' ? color.red : s === 'running' ? color.accent : color.t3)
  const cloud = steps.find((s) => s.id === 'cloud')?.result
  const failedAfterSaving = result === 'failed' && steps.some((s) => s.status === 'done')
  return (
    <div role="status" style={{ display: 'grid', gap: space[1], padding: space[3], borderRadius: radius.md, background: result === 'failed' ? color.redBg : color.hover }}>
      {steps.map((s) => {
        const stageKey = s.stage ? STAGE_KEYS[s.stage] : undefined
        const stage = s.status === 'running' && s.stage
          ? (stageKey ? t(`missions.maps.editor.steps.stage.${stageKey}`) : s.stage)
          : null
        return (
          <p key={s.id} data-step={s.id} data-status={s.status} style={{ margin: 0, display: 'flex', gap: space[2], alignItems: 'center', fontSize: font.size.sm, color: color.t1 }}>
            <span aria-hidden style={{ width: 8, height: 8, borderRadius: radius.full, background: dot(s.status), flexShrink: 0 }} />
            <span style={{ fontWeight: font.weight.semibold }}>{t(`missions.maps.editor.steps.${s.id}`)}</span>
            <span style={{ color: s.status === 'failed' ? color.red : color.t2 }}>
              {s.status === 'failed' ? t('missions.maps.editor.steps.failed', { error: s.error ?? '' })
                : stage ?? t(`missions.maps.editor.steps.${s.status}`)}
            </span>
          </p>
        )
      })}
      {result === 'ok' && (
        <p style={{ margin: `${space[1]}px 0 0`, fontSize: font.size.sm, color: color.t1 }}>
          {[
            t('missions.maps.editor.result.saved'),
            cloud?.pointsDeleted != null ? t('missions.maps.editor.result.points', { count: cloud.pointsDeleted }) : null,
            cloud?.cellsChanged ? t('missions.maps.editor.result.cells', { count: cloud.cellsChanged }) : null,
            cloud?.keptNoEvidence ? t('missions.maps.editor.result.noEvidence', { count: cloud.keptNoEvidence }) : null,
            cloud?.defaultsUsed ? t('missions.maps.editor.result.defaults') : null,
            cloud?.note ?? null,
          ].filter(Boolean).join(' ')}
        </p>
      )}
      {failedAfterSaving && <p style={{ margin: 0, fontSize: font.size.sm, color: color.t1 }}>{t('missions.maps.editor.result.partial')}</p>}
      {result === 'failed' && error && !steps.some((s) => s.status === 'failed') && (
        <p style={{ margin: 0, fontSize: font.size.sm, color: color.red }}>{error}</p>
      )}
    </div>
  )
}

