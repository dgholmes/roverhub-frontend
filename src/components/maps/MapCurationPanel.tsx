import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PenLine, Upload } from 'lucide-react'
import { Badge, Button, Segmented, type Tone } from '@/components/kit'
import { SectionGrid } from '@/components/fleet/v2/parts'
import { inputStyle } from '@/components/missions/parts'
import { color, font, radius, space } from '@/design-system/tokens'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { useCan } from '@/org/useCan'
import { pickSiteMap, useSiteMapStore } from '@/store/useSiteMapStore'
import type { MapQualityReport } from '@/types/mapPipeline'
import type { MapStatus, MapZone, SiteMap } from '@/types/maps'
import { ZoneEditor } from './ZoneEditor'
import { activationProblem } from './zoneGeometry'
import { errorText, freezeRefusalOf, type FreezeRefusal, type FreezeRefusalCode } from './mapPipeline'
import { MapQualitySection, useCheckName } from './MapQualitySection'
import { MapVersionsSection } from './MapVersionsSection'
import { SurveyUpload } from './SurveyUpload'
import { MapEditor } from './editor/MapEditor'
import { useMapQuality, useMapVersions } from './useMapPipeline'

const STATUS_TONE: Record<MapStatus, Tone> = { draft: 'neutral', active: 'green', archived: 'neutral' }

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

  // The backend's refusal wins over what the page inferred: it is the one that decides.
  const obstacle = problem === null ? (refusal?.code ?? qualityObstacle(quality)) : null
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
      {refusal?.message && <p style={{ ...note, fontSize: font.size.xs }}>{t('missions.maps.freezeServer', { message: refusal.message })}</p>}
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
  const [mapId, setMapId] = useState<string | null>(null)
  const [floorIndex, setFloorIndex] = useState(0)
  const [freezing, setFreezing] = useState(false)
  const [freezeError, setFreezeError] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<FreezeRefusal | null>(null)
  const [surveyOpen, setSurveyOpen] = useState(false)
  // The map editor (Edit map), open on the floor shown. Engineers and
  // supervisors: the backend lets editZones or configure make its edits.
  const [editing, setEditing] = useState(false)
  const canEditMap = canEdit || canConfigure

  const loadMaps = useCallback(async (select?: string) => {
    try {
      const list = await dataProvider.listMaps(siteId)
      setMaps(list)
      setLoadError(null)
      if (select) { setMapId(select); setFloorIndex(0); setRefusal(null); setFreezeError(null) }
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
    await useSiteMapStore.getState().reload()
  }, [selected, replace])

  const freeze = async (reason?: string) => {
    if (!selected) return
    setFreezing(true)
    setFreezeError(null)
    try {
      replace(await dataProvider.setMapStatus(selected.map_id, 'active', reason ? { reason } : undefined))
      setRefusal(null)
      await useSiteMapStore.getState().reload()
    } catch (e) {
      const why = freezeRefusalOf(e)
      setRefusal(why)
      if (!why) setFreezeError(errorText(e))
    } finally {
      setFreezing(false)
    }
  }

  const recheck = () => { setRefusal(null); void quality.recheck() }

  const restore = async (version: number) => {
    if (!selected) return
    replace(await dataProvider.restoreMapVersion(selected.map_id, version))
    setRefusal(null)
    await useSiteMapStore.getState().reload()
  }

  const onEdited = useCallback((saved: SiteMap) => {
    replace(saved)
    setRefusal(null)
    void useSiteMapStore.getState().reload()
  }, [replace])

  const onCreated = useCallback((created: string) => {
    void loadMaps(created)
    void useSiteMapStore.getState().reload()
  }, [loadMaps])

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
        {newSurveyButton}
        {!canConfigure && <p style={{ ...note, fontSize: font.size.sm }}>{t('missions.maps.survey.needsEngineer')}</p>}
      </div>
    )
  } else {
    const floor = selected.floors.some((f) => f.index === floorIndex) ? floorIndex : (selected.floors[0]?.index ?? 0)
    body = (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0, fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.t1 }}>{selected.name}</h2>
          <Badge tone={STATUS_TONE[selected.status]} dot>{t(`missions.maps.status.${selected.status}`)}</Badge>
          <span style={{ flex: 1 }} />
          {maps.length > 1 && !editing && (
            <select
              aria-label={t('missions.maps.pick')} value={selected.map_id}
              onChange={(e) => { setMapId(e.target.value); setFloorIndex(0); setFreezeError(null); setRefusal(null) }}
              style={{ ...inputStyle, border: 'none', background: color.hover }}
            >
              {maps.map((m) => <option key={m.map_id} value={m.map_id}>{m.name}</option>)}
            </select>
          )}
          {selected.floors.length > 1 && !editing && (
            <Segmented<string>
              label={t('missions.maps.floorsAria')} value={String(floor)} onChange={(v) => setFloorIndex(Number(v))}
              options={selected.floors.map((f) => ({
                value: String(f.index), label: f.label ?? t('liveops.map.floorN', { index: f.index }),
              }))}
            />
          )}
          {!editing && newSurveyButton}
          {canEditMap && !editing && selected.floors.length > 0 && (
            <Button icon={PenLine} title={t('missions.maps.editor.openHint')} onClick={() => setEditing(true)}>
              {t('missions.maps.editor.open')}
            </Button>
          )}
        </div>
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
            onClose={() => setEditing(false)} onSaved={onEdited}
          />
        )}
        {canEdit && !editing && (
          <FreezeControl
            map={selected} busy={freezing} onFreeze={() => void freeze()} error={freezeError}
            // While a check runs the report is about to change (and after a save is
            // briefly absent): say nothing about it until the check ends.
            quality={quality.job ? undefined : quality.report} refusal={refusal}
            canOverride={canOverride} onOverride={(reason) => void freeze(reason)}
            canRecheck={canRecheck && quality.job === null} onRecheck={recheck}
          />
        )}
        <SectionGrid>
          <MapQualitySection
            report={quality.report} error={quality.error} job={quality.job} jobError={quality.jobError}
            floorIndex={floor} canRecheck={canRecheck} onRecheck={recheck}
          />
          <MapVersionsSection versions={versions.versions} error={versions.error} canRestore={canConfigure} onRestore={restore} />
        </SectionGrid>
        {!editing && <ZoneEditor key={selected.map_id} map={selected} floorIndex={floor} onSave={saveZones} readOnly={!canEdit} />}
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
