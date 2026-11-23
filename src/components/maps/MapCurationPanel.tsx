import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, PenLine, Radar, Scissors, Upload } from 'lucide-react'
import { Badge, Button, IconButton, Segmented, type Tone } from '@/components/kit'
import { SectionGrid } from '@/components/fleet/v2/parts'
import { inputStyle } from '@/components/missions/parts'
import { color, font, radius, space } from '@/design-system/tokens'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { useCan } from '@/org/useCan'
import { mapsChanged, pickSiteMap, useSiteMapStore } from '@/store/useSiteMapStore'
import { useSessionStore } from '@/store/useSessionStore'
import type { MapQualityReport } from '@/types/mapPipeline'
import { MAX_FLOOR_LABEL_CHARS, type MapRename, type MapStatus, type MapZone, type SiteMap } from '@/types/maps'
import { ZoneEditor } from './ZoneEditor'
import { activationProblem } from './zoneGeometry'
import { errorText, freezeRefusalOf, type FreezeRefusal, type FreezeRefusalCode } from './mapPipeline'
import { MapQualitySection, useCheckName } from './MapQualitySection'
import { MapVersionsSection } from './MapVersionsSection'
import { MapRobotsSection } from './MapRobotsSection'
import { MapReadyChecklist } from './MapReadyChecklist'
import { TRIM_MARGIN_M, type ReadinessAction } from './mapReadiness'
import { SurveyUpload } from './SurveyUpload'
import { MapEditor } from './editor/MapEditor'
import { useMapQuality, useMapVersions } from './useMapPipeline'
// Maps › Survey (0.0.23): its entry here, and the link a finished survey opens.
import {
  hashForMapsSurvey, hashForMissionsMaps, hashForSiteSurvey, hashForSiteWorkspace, mapInEditorFromHash,
} from '@/app/routes'

const STATUS_TONE: Record<MapStatus, Tone> = { draft: 'neutral', active: 'green', archived: 'neutral' }

/** The backend's longest map name (maps/store.py MAX_MAP_NAME_CHARS). */
const MAX_MAP_NAME_CHARS = 80

/** What the quality report says about freezing a draft before anyone tries:
 *  the same reasons the backend gives, or null when nothing stands in the way. */
export function qualityObstacle(report: MapQualityReport | null | undefined): FreezeRefusalCode | null {
  if (report === undefined) return null  // still loading: say nothing yet
  if (report === null) return 'quality_missing'
  if (!report.current) return 'quality_stale'
  return report.passed ? null : 'quality_failed'
}

/**
 * Freezing a map: saying a person has looked at it. A draft can be re-surveyed
 * and replaced; an active one is what missions plan against. A map with no
 * floors has nothing to plan on and cannot be frozen.
 *
 * The backend also refuses a draft whose quality report is missing, out of
 * date or failed (409). The page says so before the click, from the report it
 * holds, and shows the backend's own reason after one. A failed report can be
 * overridden by a role holding `override` (supervisor), with a reason that goes
 * to the audit log; a missing or stale one cannot -- it has to be checked.
 */
export function FreezeControl({
  map, busy, onFreeze, error, quality, refusal, canOverride = false, onOverride, canRecheck = false, onRecheck,
  askZones = false, onDrawZones, onActivateAnyway,
}: {
  map: SiteMap
  busy: boolean
  onFreeze: () => void
  error?: string | null
  /** The map's quality report as the page holds it (undefined: not loaded). */
  quality?: MapQualityReport | null
  /** The backend's refusal of the last freeze. */
  refusal?: FreezeRefusal | null
  canOverride?: boolean
  onOverride?: (reason: string) => void
  canRecheck?: boolean
  onRecheck?: () => void
  /** The zones question (map ready spec 4.8): activating a map with no zones
   *  asks first whether any are needed. */
  askZones?: boolean
  onDrawZones?: () => void
  onActivateAnyway?: () => void
}) {
  const { t } = useTranslation()
  const name = useCheckName()
  const [overriding, setOverriding] = useState(false)
  const [reason, setReason] = useState('')
  const problem = activationProblem(map)
  const note: React.CSSProperties = { margin: 0, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5, maxWidth: 560 }

  if (problem === 'alreadyActive') {
    return (
      <p role="status" style={{ ...note, display: 'flex', alignItems: 'center', gap: space[2], color: color.t2 }}>
        <span style={{ width: 8, height: 8, borderRadius: radius.full, background: color.green, flexShrink: 0 }} />
        {t('missions.maps.frozen')}
      </p>
    )
  }

  // The backend's refusal wins over what the page inferred: it is the one that
  // decides. Its zones refusal is answered by the zones question, not a line.
  const refusedFor = refusal?.code === 'zones_unreviewed' ? null : refusal?.code
  const obstacle = problem === null ? (refusedFor ?? qualityObstacle(quality)) : null
  const zonesQuestion = problem === null && (askZones || refusal?.code === 'zones_unreviewed')
  const failed = refusal?.failed.length ? refusal.failed : quality?.failed ?? []
  const obstacleText = obstacle
    ? t(`missions.maps.freezeRefused.${obstacle}`, { checks: failed.map(name).join(', ') })
    : null
  const mayOverride = obstacle === 'quality_failed' && canOverride && onOverride !== undefined
  const mayRecheck = (obstacle === 'quality_missing' || obstacle === 'quality_stale') && canRecheck && onRecheck !== undefined

  return (
    <div style={{ display: 'grid', gap: space[2], justifyItems: 'start' }}>
      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
        <Button variant="primary" onClick={onFreeze} disabled={busy || problem !== null}>
          {busy ? t('missions.maps.freezing') : t('missions.maps.freeze')}
        </Button>
        {mayOverride && !overriding && (
          <Button disabled={busy} onClick={() => setOverriding(true)}>{t('missions.maps.override.open')}</Button>
        )}
        {mayRecheck && <Button disabled={busy} onClick={onRecheck}>{t('missions.maps.recheckNow')}</Button>}
      </div>
      <p style={note}>{problem === 'noFloors' ? t('missions.maps.freezeNoFloors') : t('missions.maps.freezeHint')}</p>
      {obstacleText && (
        <p role={refusal ? 'alert' : undefined} data-obstacle={obstacle} style={{ ...note, color: refusal ? color.red : color.amber }}>
          {obstacleText}
        </p>
      )}
      {zonesQuestion && (
        <div role="alertdialog" aria-label={t('missions.maps.zonesQuestion.title')} style={{
          display: 'grid', gap: space[2], padding: space[3], borderRadius: radius.md, background: color.amberBg, width: '100%', maxWidth: 560,
        }}>
          <p style={{ ...note, color: color.t1 }}>{t('missions.maps.zonesQuestion.text')}</p>
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
            {onDrawZones && <Button disabled={busy} onClick={onDrawZones}>{t('missions.maps.zonesQuestion.draw')}</Button>}
            {onActivateAnyway && (
              <Button variant="primary" disabled={busy} onClick={onActivateAnyway}>{t('missions.maps.zonesQuestion.anyway')}</Button>
            )}
          </div>
        </div>
      )}
      {refusal?.message && refusal.code !== 'zones_unreviewed' && (
        <p style={{ ...note, fontSize: font.size.xs }}>{t('missions.maps.freezeServer', { message: refusal.message })}</p>
      )}
      {error && <p role="alert" style={{ ...note, color: color.red }}>{t('missions.maps.freezeFailed', { error })}</p>}
      {mayOverride && overriding && (
        <form
          aria-label={t('missions.maps.override.confirm')}
          onSubmit={(e) => { e.preventDefault(); if (reason.trim()) onOverride!(reason.trim()) }}
          style={{ display: 'grid', gap: space[2], padding: space[3], borderRadius: radius.md, background: color.amberBg, width: '100%', maxWidth: 560 }}
        >
          <label style={{ display: 'grid', gap: space[1] }}>
            <span style={{ fontSize: font.size.sm, color: color.t1 }}>{t('missions.maps.override.reason')}</span>
            <textarea
              name="reason" value={reason} maxLength={500} rows={3} onChange={(e) => setReason(e.target.value)}
              placeholder={t('missions.maps.override.reasonPlaceholder')}
              style={{ ...inputStyle, border: 'none', height: 'auto', padding: '8px 10px', resize: 'vertical', lineHeight: 1.4 }}
            />
          </label>
          <p style={{ ...note, fontSize: font.size.xs }}>{t('missions.maps.override.hint')}</p>
          <div style={{ display: 'flex', gap: space[2] }}>
            <Button type="submit" variant="danger" disabled={busy || !reason.trim()}>{t('missions.maps.override.confirm')}</Button>
            <Button disabled={busy} onClick={() => { setOverriding(false); setReason('') }}>{t('missions.maps.override.cancel')}</Button>
          </div>
        </form>
      )}
    </div>
  )
}

/**
 * The Maps page: a site's surveyed maps -- made from a survey upload, checked,
 * frozen, with their zones and their kept versions. Reads the site's maps
 * itself (the LiveOps canvas shows only the one it picks), and tells the shared
 * site-map store after every write so LiveOps shows what was saved.
 */
export function MapCurationPanel({ siteId }: { siteId: string }) {
  const { t } = useTranslation()
  const canEdit = useCan('editZones')
  const canConfigure = useCan('configure')
  const canOverride = useCan('override')
  const canRecheck = canEdit || canConfigure
  const [maps, setMaps] = useState<SiteMap[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  // A link to a map in the editor (a finished survey's draft) opens on it.
  const [mapId, setMapId] = useState<string | null>(() => mapInEditorFromHash(window.location.hash))
  const [floorIndex, setFloorIndex] = useState(0)
  const [freezing, setFreezing] = useState(false)
  const [freezeError, setFreezeError] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<FreezeRefusal | null>(null)
  const [surveyOpen, setSurveyOpen] = useState(false)
  // The map editor (Edit map), open on the floor shown. Engineers and
  // supervisors: the backend lets editZones or configure make its edits.
  const [editing, setEditing] = useState(() => mapInEditorFromHash(window.location.hash) !== null)
  const canEditMap = canEdit || canConfigure
  // Where "Get it ready"'s buttons scroll to: the zone editor, and Robot maps
  // (Send to robot, and Use this map from Task 11).
  const zonesRef = useRef<HTMLDivElement>(null)
  const robotsRef = useRef<HTMLDivElement>(null)
  // Activate on a map with no zones asks whether any are needed (spec 4.8),
  // every time; the answer counts for that map until the page leaves it.
  const [askZones, setAskZones] = useState(false)
  const [zonesAnsweredFor, setZonesAnsweredFor] = useState<string | null>(null)
  // Trim (spec 4.5): asked first, because it saves a new version.
  const [trimAsk, setTrimAsk] = useState<number | null>(null)
  const [trimming, setTrimming] = useState(false)
  const [trimNote, setTrimNote] = useState<{ ok: boolean; text: string } | null>(null)
  // Rename (spec 4.9): the map's name and its floors' labels, in place.
  const [renaming, setRenaming] = useState(false)

  /** Questions and notes about the map shown: dropped when another is shown. */
  const resetAsks = () => {
    setRefusal(null); setFreezeError(null); setAskZones(false); setTrimAsk(null); setTrimNote(null); setRenaming(false)
  }

  const loadMaps = useCallback(async (select?: string) => {
    try {
      const list = await dataProvider.listMaps(siteId)
      setMaps(list)
      setLoadError(null)
      if (select) { setMapId(select); setFloorIndex(0); resetAsks() }
    } catch (e) {
      setLoadError(errorText(e))
    }
  }, [siteId])

  useEffect(() => {
    setMaps(null)
    setLoadError(null)
    void loadMaps()
    // A map uploaded since LiveOps last asked would otherwise stay invisible
    // there for the rest of the session.
    void useSiteMapStore.getState().reload()
  }, [siteId, loadMaps])

  const selected = maps ? maps.find((m) => m.map_id === mapId) ?? pickSiteMap(maps) : null
  // The map's files may have changed (upload, restore): read the report and versions again.
  const refreshKey = selected ? `${selected.map_id}@${selected.updated_at}` : ''
  const quality = useMapQuality(selected?.map_id ?? null, refreshKey)
  // Read again when a check finishes too: a version's quality badge comes from
  // the check the backend queued after the save, which ends after the map changed.
  const versions = useMapVersions(selected?.map_id ?? null, `${refreshKey}#${quality.report?.computed_at ?? ''}`)

  const replace = useCallback((updated: SiteMap) => {
    setMaps((list) => list && list.map((m) => (m.map_id === updated.map_id ? updated : m)))
  }, [])

  const saveZones = useCallback(async (zones: MapZone[]) => {
    if (!selected) return
    replace(await dataProvider.saveMapZones(selected.map_id, zones))
    await mapsChanged()
  }, [selected, replace])

  const freeze = async (reason?: string, zonesReviewed = false) => {
    if (!selected) return
    setFreezing(true)
    setFreezeError(null)
    try {
      const options = reason || zonesReviewed
        ? { ...(reason ? { reason } : {}), ...(zonesReviewed ? { zonesReviewed: true } : {}) }
        : undefined
      replace(await dataProvider.setMapStatus(selected.map_id, 'active', options))
      setRefusal(null)
      await mapsChanged()
    } catch (e) {
      const why = freezeRefusalOf(e)
      setRefusal(why)
      if (why?.code === 'zones_unreviewed') { setZonesAnsweredFor(null); setAskZones(true) }
      if (!why) setFreezeError(errorText(e))
    } finally {
      setFreezing(false)
    }
  }

  /** Freeze, asking about zones first when the map has none (spec 4.8). An
   *  override keeps the answer already given. */
  const requestFreeze = (reason?: string) => {
    if (!selected) return
    if (selected.zones.length > 0) { void freeze(reason); return }
    if (zonesAnsweredFor === selected.map_id) { void freeze(reason, true); return }
    setRefusal(null)
    setAskZones(true)
  }
  const activateAnyway = () => {
    if (!selected) return
    setZonesAnsweredFor(selected.map_id)
    setAskZones(false)
    void freeze(undefined, true)
  }
  const scrollTo = (el: HTMLElement | null) => el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  const drawZones = () => { setAskZones(false); setRefusal(null); scrollTo(zonesRef.current) }

  const trim = async (floor: number) => {
    if (!selected) return
    setTrimming(true)
    setTrimNote(null)
    try {
      const updated = await dataProvider.trimFloor(selected.map_id, floor)
      // A floor already inside the margin comes back as it was, with no new version.
      const unchanged = updated.updated_at === selected.updated_at
        && updated.floors.find((f) => f.index === floor)?.content_hash === selected.floors.find((f) => f.index === floor)?.content_hash
      setTrimNote({ ok: true, text: t(unchanged ? 'missions.maps.trim.unchanged' : 'missions.maps.trim.done', { margin: TRIM_MARGIN_M }) })
      setTrimAsk(null)
      if (!unchanged) {
        replace(updated)
        setRefusal(null)
        await mapsChanged()
      }
    } catch (e) {
      setTrimNote({ ok: false, text: t('missions.maps.trim.failed', { error: errorText(e) }) })
    } finally {
      setTrimming(false)
    }
  }

  const rename = async (change: MapRename) => {
    if (!selected) return
    replace(await dataProvider.renameMap(selected.map_id, change))
    setRenaming(false)
    await mapsChanged()
  }

  const recheck = () => { setRefusal(null); void quality.recheck() }

  /** A "Get it ready" button. The ones that only navigate are done here; the
   *  rest go to the control that already does it. */
  const onReadyAction = (action: ReadinessAction) => {
    switch (action.kind) {
      case 'seeDrift':
      case 'rebuild':  // Rebuild from recording lives on the survey's page (§4.2).
        window.location.hash = hashForSiteSurvey(siteId, action.surveyId)
        return
      case 'setPosition':
        useSessionStore.getState().setSelectedRobot(action.robotId)
        window.location.hash = hashForSiteWorkspace(siteId, 'LiveOps')
        return
      case 'drawZones': scrollTo(zonesRef.current); return
      case 'sendToRobot':
      case 'useOnRobot': scrollTo(robotsRef.current); return
      case 'checkQuality': recheck(); return
      case 'activate': requestFreeze(); return
      // Find moving things again is in the map editor's flat view.
      case 'findMoving': setEditing(true); return
      // Trim asks first: it saves a new version, which puts an active map back to draft.
      case 'trim': setTrimNote(null); setTrimAsk(action.floorIndex); return
    }
  }

  const restore = async (version: number) => {
    if (!selected) return
    replace(await dataProvider.restoreMapVersion(selected.map_id, version))
    setRefusal(null)
    await mapsChanged()
  }

  const onEdited = useCallback((saved: SiteMap) => {
    replace(saved)
    setRefusal(null)
    void mapsChanged()
  }, [replace])

  const onCreated = useCallback((created: string) => {
    void loadMaps(created)
    void mapsChanged()
  }, [loadMaps])

  // Everyone may open the Survey page: engineers start one there, everyone
  // else can watch one that is running.
  const liveSurveyButton = (
    <Button icon={Radar} title={t('survey.entry.hint')} onClick={() => { window.location.hash = hashForMapsSurvey(siteId) }}>
      {t('survey.entry.button')}
    </Button>
  )
  const newSurveyButton = canConfigure && !surveyOpen ? (
    <Button icon={Upload} onClick={() => setSurveyOpen(true)}>{t('missions.maps.survey.open')}</Button>
  ) : null

  const note: React.CSSProperties = { margin: 0, fontSize: font.size.md, color: color.t3 }
  let body: React.ReactNode
  if (loadError) body = <p role="alert" style={{ ...note, color: color.red }}>{t('missions.maps.loadFailed', { error: loadError })}</p>
  else if (maps === null) body = <p style={note}>{t('missions.maps.loading')}</p>
  else if (!selected) {
    body = (
      <div style={{ display: 'grid', gap: space[2], justifyItems: 'start' }}>
        <p style={{ ...note, color: color.t1 }}>{t('missions.maps.noMaps')}</p>
        <p style={{ ...note, fontSize: font.size.sm }}>{t('missions.maps.noMapsHint')}</p>
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>{liveSurveyButton}{newSurveyButton}</div>
        {!canConfigure && <p style={{ ...note, fontSize: font.size.sm }}>{t('missions.maps.survey.needsEngineer')}</p>}
      </div>
    )
  } else {
    const floor = selected.floors.some((f) => f.index === floorIndex) ? floorIndex : (selected.floors[0]?.index ?? 0)
    body = (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.t1 }}>{selected.name}</h2>
          {canEdit && !editing && !renaming && (
            <IconButton size="sm" icon={Pencil} label={t('missions.maps.rename.open')} title={t('missions.maps.rename.open')}
              onClick={() => setRenaming(true)} />
          )}
          <Badge tone={STATUS_TONE[selected.status]} dot>{t(`missions.maps.status.${selected.status}`)}</Badge>
          <span style={{ flex: 1 }} />
          {maps.length > 1 && !editing && (
            <select
              aria-label={t('missions.maps.pick')} value={selected.map_id}
              onChange={(e) => { setMapId(e.target.value); setFloorIndex(0); resetAsks() }}
              style={{ ...inputStyle, border: 'none', background: color.hover }}
            >
              {maps.map((m) => <option key={m.map_id} value={m.map_id}>{m.name}</option>)}
            </select>
          )}
          {selected.floors.length > 1 && !editing && (
            <Segmented<string>
              label={t('missions.maps.floorsAria')} value={String(floor)} onChange={(v) => { setFloorIndex(Number(v)); setTrimAsk(null); setTrimNote(null) }}
              options={selected.floors.map((f) => ({
                value: String(f.index), label: f.label ?? t('liveops.map.floorN', { index: f.index }),
              }))}
            />
          )}
          {!editing && liveSurveyButton}
          {!editing && newSurveyButton}
          {canEditMap && !editing && selected.floors.length > 0 && (
            <Button icon={PenLine} title={t('missions.maps.editor.openHint')} onClick={() => setEditing(true)}>
              {t('missions.maps.editor.open')}
            </Button>
          )}
        </div>
        {renaming && !editing && (
          <RenameForm key={selected.map_id} map={selected} onSave={rename} onCancel={() => setRenaming(false)} />
        )}
        {(() => {
          // The floor's content hash (schema 0.0.20): what a robot's map files
          // must hash to (roverhub-edge/scripts/map_hash.py) for its walks here
          // to be accepted. Absent from an older backend.
          const hash = selected.floors.find((f) => f.index === floor)?.content_hash
          return hash ? (
            <p style={{ ...note, fontSize: font.size.sm }} title={hash}>
              {t('missions.maps.version', { hash: hash.slice(0, 12) })}
            </p>
          ) : null
        })()}
        {editing && (
          <MapEditor
            key={`${selected.map_id}/${floor}`} map={selected} floorIndex={floor}
            onClose={() => {
              setEditing(false)
              // Closing a linked editor drops the link, so a reload shows Maps.
              if (mapInEditorFromHash(window.location.hash)) window.history.replaceState(window.history.state, '', hashForMissionsMaps(siteId))
            }}
            onSaved={onEdited}
          />
        )}
        {!editing && (
          <MapReadyChecklist
            map={selected} floorIndex={floor} maps={maps}
            quality={quality.report} qualityRunning={quality.job !== null} onAction={onReadyAction}
          />
        )}
        {!editing && trimAsk !== null && canEdit && (
          <div role="alertdialog" aria-label={t('missions.maps.trim.title')} style={{
            display: 'grid', gap: space[2], padding: space[3], borderRadius: radius.md, background: color.amberBg, maxWidth: 560,
          }}>
            <p style={{ ...note, fontSize: font.size.sm, color: color.t1, lineHeight: 1.5 }}>
              {t('missions.maps.trim.confirm', {
                floor: selected.floors.find((f) => f.index === trimAsk)?.label ?? t('liveops.map.floorN', { index: trimAsk }),
                margin: TRIM_MARGIN_M,
              })}
              {selected.status === 'active' ? ` ${t('missions.maps.trim.activeNote')}` : ''}
            </p>
            <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
              <Button variant="primary" icon={Scissors} disabled={trimming} onClick={() => void trim(trimAsk)}>
                {trimming ? t('missions.maps.trim.trimming') : t('missions.maps.trim.go')}
              </Button>
              <Button disabled={trimming} onClick={() => setTrimAsk(null)}>{t('missions.maps.trim.cancel')}</Button>
            </div>
            {trimNote && !trimNote.ok && <p role="alert" style={{ ...note, fontSize: font.size.sm, color: color.red }}>{trimNote.text}</p>}
          </div>
        )}
        {!editing && trimAsk === null && trimNote && (
          <p role="status" style={{ ...note, fontSize: font.size.sm, color: trimNote.ok ? color.t2 : color.red }}>{trimNote.text}</p>
        )}
        {canEdit && !editing && (
          <FreezeControl
            map={selected} busy={freezing} onFreeze={() => requestFreeze()} error={freezeError}
            askZones={askZones} onDrawZones={drawZones} onActivateAnyway={activateAnyway}
            // While a check runs the report is about to change (and after a save is
            // briefly absent): say nothing about it until the check ends.
            quality={quality.job ? undefined : quality.report} refusal={refusal}
            canOverride={canOverride} onOverride={(reason) => requestFreeze(reason)}
            canRecheck={canRecheck && quality.job === null} onRecheck={recheck}
          />
        )}
        <SectionGrid>
          <MapQualitySection
            report={quality.report} error={quality.error} job={quality.job} jobError={quality.jobError}
            floorIndex={floor} canRecheck={canRecheck} onRecheck={recheck}
          />
          {/* Whether each robot runs this floor as shown, and Send to robot (0.0.26). */}
          <div ref={robotsRef} style={{ minWidth: 0, scrollMarginTop: space[4] }}>
            <MapRobotsSection map={selected} floorIndex={floor} maps={maps} />
          </div>
          <MapVersionsSection versions={versions.versions} error={versions.error} canRestore={canConfigure} onRestore={restore} />
        </SectionGrid>
        {!editing && (
          <div ref={zonesRef} style={{ scrollMarginTop: space[4] }}>
            <ZoneEditor key={selected.map_id} map={selected} floorIndex={floor} onSave={saveZones} readOnly={!canEdit} />
          </div>
        )}
      </>
    )
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: space[6], display: 'grid', gap: space[5], alignContent: 'start' }}>
      <SurveyUpload
        siteId={siteId} maps={maps ?? []} open={surveyOpen}
        onClose={() => setSurveyOpen(false)} onCreated={onCreated}
      />
      {body}
    </div>
  )
}

/**
 * Rename (map ready spec 4.9): the map's name and its floors' labels, edited in
 * place and sent as one PATCH of only what changed. Names sit outside the
 * content hash, so a rename makes no new version and keeps an active map
 * active. An empty label clears it (the floor shows as "Floor N").
 */
function RenameForm({ map, onSave, onCancel }: {
  map: SiteMap
  onSave: (change: MapRename) => Promise<void>
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(map.name)
  const [labels, setLabels] = useState<Record<number, string>>(
    () => Object.fromEntries(map.floors.map((f) => [f.index, f.label ?? ''])),
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const trimmedName = name.trim()
  const floors = map.floors
    .map((f) => ({ index: f.index, label: (labels[f.index] ?? '').trim() || null }))
    .filter((f) => f.label !== (map.floors.find((x) => x.index === f.index)?.label ?? null))
  const change: MapRename = {
    ...(trimmedName !== map.name ? { name: trimmedName } : {}),
    ...(floors.length ? { floors } : {}),
  }
  const changed = change.name !== undefined || change.floors !== undefined
  const field: React.CSSProperties = { ...inputStyle, border: 'none', background: color.hover }

  const submit = async () => {
    if (!trimmedName || !changed) return
    setBusy(true)
    setError(null)
    try {
      await onSave(change)
    } catch (e) {
      setError(errorText(e))
      setBusy(false)
    }
  }

  return (
    <form
      aria-label={t('missions.maps.rename.title')}
      onSubmit={(e) => { e.preventDefault(); void submit() }}
      style={{ display: 'grid', gap: space[3], padding: space[3], borderRadius: radius.md, background: color.card, maxWidth: 560 }}
    >
      <label style={{ display: 'grid', gap: space[1] }}>
        <span style={{ fontSize: font.size.sm, color: color.t2 }}>{t('missions.maps.rename.name')}</span>
        <input name="map-name" value={name} maxLength={MAX_MAP_NAME_CHARS} onChange={(e) => setName(e.target.value)} style={field} />
      </label>
      {map.floors.map((f) => (
        <label key={f.index} style={{ display: 'grid', gap: space[1] }}>
          <span style={{ fontSize: font.size.sm, color: color.t2 }}>{t('missions.maps.rename.floor', { index: f.index })}</span>
          <input
            name={`floor-${f.index}`} value={labels[f.index] ?? ''} maxLength={MAX_FLOOR_LABEL_CHARS}
            placeholder={t('liveops.map.floorN', { index: f.index })}
            onChange={(e) => setLabels((l) => ({ ...l, [f.index]: e.target.value }))} style={field}
          />
        </label>
      ))}
      <p style={{ margin: 0, fontSize: font.size.xs, color: color.t3, lineHeight: 1.5 }}>{t('missions.maps.rename.hint')}</p>
      {!trimmedName && <p style={{ margin: 0, fontSize: font.size.sm, color: color.amber }}>{t('missions.maps.rename.nameRequired')}</p>}
      {error && <p role="alert" style={{ margin: 0, fontSize: font.size.sm, color: color.red }}>{t('missions.maps.rename.failed', { error })}</p>}
      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
        <Button type="submit" variant="primary" disabled={busy || !trimmedName || !changed}>
          {busy ? t('missions.maps.rename.saving') : t('missions.maps.rename.save')}
        </Button>
        <Button disabled={busy} onClick={onCancel}>{t('missions.maps.rename.cancel')}</Button>
      </div>
    </form>
  )
}
