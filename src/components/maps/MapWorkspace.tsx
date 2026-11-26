import { useCallback, useEffect, useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Info, Pencil, PenLine, Radar, Scissors, Upload } from 'lucide-react'
import { Badge, Button, IconButton, InlineAlertDialog, KeyValue, Segmented, Tabs, type Tone } from '@/components/kit'
import { Section, SectionGrid } from '@/components/fleet/v2/parts'
import { color, font, radius, space } from '@/design-system/tokens'
import { useAuthStore } from '@/lib/auth/authStore'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { useTouchShell } from '@/lib/useTouchShell'
import { robotsForSite } from '@/org/siteRobots'
import { useCan } from '@/org/useCan'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { mapsChanged, pickSiteMap, useSiteMapStore } from '@/store/useSiteMapStore'
import { useSessionStore } from '@/store/useSessionStore'
import { useMissionStore } from '@/missions/useMissionStore'
import { isSurveyBusy } from '@/survey/surveyModel'
import { useSurveyStatuses } from '@/survey/useSurvey'
import { MAX_FLOOR_LABEL_CHARS, type MapRename, type MapStatus, type MapZone, type SiteMap } from '@/types/maps'
import {
  hashForMap, hashForMapEditor, hashForMapSurvey, hashForSiteSurvey, hashForSiteWorkspace, MAP_TABS,
  mapRouteFromHash, type MapRoute, type MapTab,
} from '@/app/routes'
import { useRemembered, viewKey } from '@/lib/viewMemory'
import { SurveyPage } from '@/components/survey/SurveyPage'
import { FreezeControl } from './FreezeControl'
import { HomeSection, useHomeDraft } from './HomeSection'
import { InlineName, MAX_MAP_NAME_CHARS, MissionsOnMap } from './MapPageParts'
import { MapPlanView } from './MapPlanView'
import { PLAN_VIEWS, planViewHold, shownPlanView, type PlanView } from './planView'
import { MapQualitySection, useCheckName } from './MapQualitySection'
import { MapReadyRows, useMapReadiness } from './MapReadyChecklist'
import { MapRobotsSection, type RobotMapAsk } from './MapRobotsSection'
import { MapVersionsSection } from './MapVersionsSection'
import { SurveyUpload } from './SurveyUpload'
import { ZonePanel, useZoneDraft } from './ZoneEditor'
import { MapEditor } from './editor/MapEditor'
import { errorText, freezeRefusalOf, type FreezeRefusal } from './mapPipeline'
import { TRIM_MARGIN_M, type ReadinessAction } from './mapReadiness'
import { useMapQuality, useMapVersions } from './useMapPipeline'
import { useProviderRobots } from './useProviderRobots'

const STATUS_TONE: Record<MapStatus, Tone> = { draft: 'neutral', active: 'green', archived: 'neutral' }

/** The tab a map opens on when the address names none: a draft is being made
 *  ready, so Setup; an active one is in use, so Overview. */
export function defaultMapTab(map: Pick<SiteMap, 'status'>): MapTab {
  return map.status === 'draft' ? 'setup' : 'overview'
}

const PAGE_ROUTE: MapRoute = { view: 'page', mapId: null, tab: null }

const isFloorIndex = (v: unknown): v is number => Number.isInteger(v)

/**
 * The Map workspace (docs/superpowers/specs/2026-11-26-map-workspace-and-sites-design.md §1):
 * a site's maps, map-first. Wide, a list of the maps, the selected map filling
 * the centre, and a panel of tabs (Overview, Zones, Quality, Versions, Setup);
 * narrow (< 700 px), one pane at a time: the list, then the map with the tabs
 * under it, with a way back. Edit map opens the map editor over all three;
 * Survey with a robot is a page of its own.
 *
 * The address holds where the operator is (routes.tsx `mapRouteFromHash`): the
 * map, the tab, the editor or the Survey page. Replaced Missions › Maps
 * (MapCurationPanel), whose behaviour it keeps.
 */
export function MapWorkspace({ siteId }: { siteId: string }) {
  const init = useLiveOpsStore((s) => s.init)
  const teardown = useLiveOpsStore((s) => s.teardown)
  // Send to robot and Use this map dispatch through the LiveOps store, and the
  // map draws the robots it holds.
  useEffect(() => { init(); return () => teardown() }, [init, teardown])
  // Missions on this map reads the site's library.
  useEffect(() => {
    const s = useMissionStore.getState()
    if (s.siteId !== siteId) void s.load(siteId)
  }, [siteId])

  const [route, setRoute] = useState<MapRoute>(() => mapRouteFromHash(window.location.hash) ?? PAGE_ROUTE)
  useEffect(() => {
    const follow = () => setRoute(mapRouteFromHash(window.location.hash) ?? PAGE_ROUTE)
    window.addEventListener('hashchange', follow)
    return () => window.removeEventListener('hashchange', follow)
  }, [])
  /** Move to `hash`: a step for Back, or in place (which fires no hashchange). */
  const go = useCallback((hash: string, replace = false) => {
    if (hash !== window.location.hash) {
      if (replace) window.history.replaceState(window.history.state, '', hash)
      else window.location.hash = hash
    }
    setRoute(mapRouteFromHash(hash) ?? PAGE_ROUTE)
  }, [])

  // The Survey page, moved here as it was.
  if (route.view === 'survey') return <SurveyPage siteId={siteId} />
  return <MapPage siteId={siteId} route={route} go={go} />
}

function MapPage({ siteId, route, go }: { siteId: string; route: MapRoute; go: (hash: string, replace?: boolean) => void }) {
  const { t } = useTranslation()
  const canConfigure = useCan('configure')
  const { narrow } = useTouchShell()
  const [maps, setMaps] = useState<SiteMap[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [surveyOpen, setSurveyOpen] = useState(false)

  const loadMaps = useCallback(async (select?: string) => {
    try {
      const list = await dataProvider.listMaps(siteId)
      setMaps(list)
      setLoadError(null)
      if (select) go(hashForMap(siteId, select), true)
    } catch (e) {
      setLoadError(errorText(e))
    }
  }, [siteId, go])

  useEffect(() => {
    setMaps(null)
    setLoadError(null)
    void loadMaps()
    // A map uploaded since LiveOps last asked would otherwise stay invisible
    // there for the rest of the session.
    void useSiteMapStore.getState().reload()
  }, [siteId, loadMaps])

  const replace = useCallback((updated: SiteMap) => {
    setMaps((list) => list && list.map((m) => (m.map_id === updated.map_id ? updated : m)))
  }, [])

  const onCreated = useCallback((created: string) => {
    void loadMaps(created)
    void mapsChanged()
  }, [loadMaps])

  const routeMapId = route.view === 'page' || route.view === 'edit' ? route.mapId : null
  const named = maps && routeMapId ? maps.find((m) => m.map_id === routeMapId) ?? null : null
  // Narrow, the bare address is the list; wide, it shows the map the site would pick.
  const selected = maps ? named ?? (narrow && !routeMapId ? null : pickSiteMap(maps)) : null

  const actions = (
    <>
      <SurveyEntry siteId={siteId} onOpen={() => go(hashForMapSurvey(siteId))} />
      {canConfigure && !surveyOpen && (
        <Button icon={Upload} onClick={() => setSurveyOpen(true)}>{t('missions.maps.survey.open')}</Button>
      )}
    </>
  )
  const upload = (
    <div style={{ padding: `0 ${space[4]}px` }}>
      <SurveyUpload siteId={siteId} maps={maps ?? []} open={surveyOpen} onClose={() => setSurveyOpen(false)} onCreated={onCreated} />
    </div>
  )
  const note: React.CSSProperties = { margin: 0, fontSize: font.size.md, color: color.t3 }
  const pad: React.CSSProperties = { flex: 1, minHeight: 0, overflow: 'auto', padding: space[6], display: 'grid', gap: space[5], alignContent: 'start' }

  if (loadError || maps === null || maps.length === 0) {
    return (
      <div style={pad}>
        {upload}
        {loadError ? <p role="alert" style={{ ...note, color: color.red }}>{t('missions.maps.loadFailed', { error: loadError })}</p>
          : maps === null ? <p style={note}>{t('missions.maps.loading')}</p>
          : (
            <div style={{ display: 'grid', gap: space[2], justifyItems: 'start' }}>
              <p style={{ ...note, color: color.t1 }}>{t('missions.maps.noMaps')}</p>
              <p style={{ ...note, fontSize: font.size.sm }}>{t('missions.maps.noMapsHint')}</p>
              <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>{actions}</div>
              {!canConfigure && <p style={{ ...note, fontSize: font.size.sm }}>{t('missions.maps.survey.needsEngineer')}</p>}
            </div>
          )}
      </div>
    )
  }

  // Picking a map from the list: wide, in place (a reload or a copied link
  // shows it; not a step for Back); narrow, a step, so Back returns to the list.
  const list = (
    <MapsList maps={maps} selectedId={selected?.map_id ?? null} onSelect={(id) => go(hashForMap(siteId, id), !narrow)} />
  )

  if (!selected) {
    // Narrow, step one: the list.
    return (
      <div data-map-step="list" style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'grid', alignContent: 'start' }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap', padding: `${space[3]}px ${space[4]}px` }}>
          <h2 style={{ margin: 0, flex: 1, fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.t1 }}>{t('missions.maps.page.listTitle')}</h2>
          {actions}
        </header>
        {upload}
        <div style={{ padding: space[3] }}>{list}</div>
      </div>
    )
  }

  return (
    <MapView
      key={selected.map_id}
      siteId={siteId} map={selected} maps={maps} route={route} go={go}
      onChanged={replace} actions={actions} upload={upload} list={list}
      surveyOpen={surveyOpen}
    />
  )
}

/**
 * "Survey with a robot". Starting a survey and putting the map it makes on a
 * robot both need `configure` (operator, 2026-11-26: "if a user can survey
 * with a robot they should be able to send the made map to the robot"), so
 * without it the button is shown off, with the reason, rather than leading to
 * a form that says no. While a survey is under way on one of the site's
 * robots it stays open to everyone, who may watch it. Its own component: it
 * reads the robots live, which must not re-render the page.
 */
function SurveyEntry({ siteId, onOpen }: { siteId: string; onOpen: () => void }) {
  const { t } = useTranslation()
  const canConfigure = useCan('configure')
  const all = useProviderRobots()
  const robots = useMemo(() => robotsForSite(all, siteId), [all, siteId])
  const statuses = useSurveyStatuses(robots)
  const underWay = robots.some((r) => isSurveyBusy(statuses[r.robot_id]?.state))
  // An owner/admin only has to turn Engineer tools on (off after every sign-in).
  const canSwitchOn = useAuthStore((s) => s.status === 'signedIn' && s.user?.can_use_engineer_tools === true)
  const why = !canConfigure && !underWay
    ? t(canSwitchOn ? 'survey.entry.needsEngineerTools' : 'survey.entry.needsEngineer')
    : null
  return (
    // The reason is on the wrapper too: a disabled button gets no hover in every browser.
    <span title={why ?? undefined} style={{ display: 'inline-flex' }}>
      <Button icon={Radar} title={why ?? (canConfigure ? t('survey.entry.hint') : t('survey.entry.watchHint'))}
        disabled={why !== null} data-survey-entry={why ? 'off' : 'on'} onClick={onOpen}>
        {t('survey.entry.button')}
      </Button>
    </span>
  )
}

/** The site's maps: name, status, floors, the first floor's version, and a dot
 *  per robot set up for the map. Tinted rows, the selected one stronger. */
function MapsList({ maps, selectedId, onSelect }: { maps: SiteMap[]; selectedId: string | null; onSelect: (mapId: string) => void }) {
  const { t } = useTranslation()
  const robots = useProviderRobots()
  return (
    <ul aria-label={t('missions.maps.page.listAria')} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: space[1] }}>
      {maps.map((m) => {
        const on = robots.filter((r) => r.bridge?.nav_map_id === m.map_id)
        const hash = m.floors[0]?.content_hash
        const current = m.map_id === selectedId
        return (
          <li key={m.map_id}>
            <button
              type="button" data-map-id={m.map_id} aria-current={current ? 'true' : undefined}
              onClick={() => onSelect(m.map_id)}
              style={{
                width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', fontFamily: font.family,
                display: 'grid', gap: space[1], padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.sm,
                background: current ? color.selected : 'transparent', color: color.t1,
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: space[2], minWidth: 0 }}>
                <span style={{ flex: 1, minWidth: 0, fontSize: font.size.md, fontWeight: font.weight.bold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {m.name}
                </span>
                <Badge tone={STATUS_TONE[m.status]} dot>{t(`missions.maps.status.${m.status}`)}</Badge>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.sm, color: color.t3 }}>
                <span>{t('missions.maps.page.floors', { count: m.floors.length })}</span>
                {hash && <span title={hash} style={{ fontVariantNumeric: 'tabular-nums' }}>{hash.slice(0, 8)}</span>}
                <span style={{ flex: 1 }} />
                {on.length > 0 && (
                  <span data-robot-dots={on.length} title={`${t('missions.maps.page.robotsHere', { count: on.length })}: ${on.map((r) => r.name).join(', ')}`}
                    style={{ display: 'inline-flex', gap: 3 }}>
                    {on.map((r) => <span key={r.robot_id} style={{ width: 8, height: 8, borderRadius: radius.full, background: color.accent }} />)}
                  </span>
                )}
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

/**
 * One map on the page: the header, the centre map and the panel, and every
 * action on it. Keyed by map, so a question asked about one map (the zones
 * answer, a trim, a rename) is never carried to another.
 */
function MapView({ siteId, map: selected, maps, route, go, onChanged, actions, upload, list, surveyOpen }: {
  siteId: string
  map: SiteMap
  maps: SiteMap[]
  route: MapRoute
  go: (hash: string, replace?: boolean) => void
  onChanged: (map: SiteMap) => void
  actions: React.ReactNode
  upload: React.ReactNode
  list: React.ReactNode
  surveyOpen: boolean
}) {
  const { t } = useTranslation()
  const name = useCheckName()
  const canEdit = useCan('editZones')
  const canConfigure = useCan('configure')
  const canOverride = useCan('override')
  const canRecheck = canEdit || canConfigure
  const canEditMap = canEdit || canConfigure
  // Zones are traced vertex by vertex and the map editor is brushed, which a
  // phone has no room for, so on a narrow screen both open to read (M4 §7.6.3)
  // and the way into the map editor is not offered. A tablet edits like a
  // desktop. Layout, too, follows `narrow` and never `touch`.
  const { narrow } = useTouchShell()
  const editing = route.view === 'edit' && !narrow
  const routeTab = route.view === 'page' ? route.tab : null

  // The floor is the viewer's own choice, not part of a link, so it is
  // remembered per site and map (2026-11-26) rather than put in the address.
  // A floor the map no longer has falls back to its first.
  const [floorIndex, setFloorIndex] = useRemembered(viewKey('mapws', 'floor', siteId, selected.map_id), 0, isFloorIndex)
  const floor = selected.floors.some((f) => f.index === floorIndex) ? floorIndex : (selected.floors[0]?.index ?? 0)
  // The tab: the address's, else this map's default, fixed when the map is
  // shown, so activating a draft does not move the page from Setup.
  const [tab, setTabState] = useState<MapTab>(() => routeTab ?? defaultMapTab(selected))
  useEffect(() => { if (routeTab) setTabState(routeTab) }, [routeTab])
  const setTab = (next: MapTab) => {
    setTabState(next)
    // In place, so a reload or a copied link opens this tab; not a step for Back.
    if (!editing) go(hashForMap(siteId, selected.map_id, next), true)
  }

  const [freezing, setFreezing] = useState(false)
  const [freezeError, setFreezeError] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<FreezeRefusal | null>(null)
  // Activate on a map with no zones asks whether any are needed (spec 4.8),
  // every time. The answer counts only for that one attempt: this map at this
  // version (`map_id@updated_at`), so the override that may follow keeps it,
  // and is dropped once the map is activated. Any change to the map (a save,
  // a trim, a restore) is a new version, and asks again.
  const [askZones, setAskZones] = useState(false)
  const [zonesAnsweredFor, setZonesAnsweredFor] = useState<string | null>(null)
  const attemptKey = (m: SiteMap) => `${m.map_id}@${m.updated_at}`
  // Trim (spec 4.5): asked first, because it saves a new version.
  const [trimAsk, setTrimAsk] = useState<number | null>(null)
  const [trimming, setTrimming] = useState(false)
  const [trimNote, setTrimNote] = useState<{ ok: boolean; text: string } | null>(null)
  // Rename (spec 4.9): the map's name, or the floor's label, edited in place in the header.
  const [renaming, setRenaming] = useState<'map' | 'floor' | null>(null)
  // Flat / 3D / Point cloud, chosen in the header; the centre map shows it.
  const [planView, setPlanView] = useState<PlanView>('2d')
  const trimTextId = useId()
  // The checklist's Send to robot / Use this map open that robot's question in Overview.
  const [robotAsk, setRobotAsk] = useState<RobotMapAsk | null>(null)

  // The map's files may have changed (upload, restore): read the report and versions again.
  const refreshKey = `${selected.map_id}@${selected.updated_at}`
  const quality = useMapQuality(selected.map_id, refreshKey)
  // Read again when a check finishes too: a version's quality badge comes from
  // the check the backend queued after the save, which ends after the map changed.
  const versions = useMapVersions(selected.map_id, `${refreshKey}#${quality.report?.computed_at ?? ''}`)
  const readiness = useMapReadiness({
    map: selected, floorIndex: floor, maps, quality: quality.report, qualityRunning: quality.job !== null,
  })

  const saveZones = useCallback(async (zones: MapZone[]) => {
    onChanged(await dataProvider.saveMapZones(selected.map_id, zones))
    await mapsChanged()
  }, [selected.map_id, onChanged])
  const zoneDraft = useZoneDraft(selected, saveZones)
  // Drawing happens on the centre map only while Zones is open.
  const { stopDrawing } = zoneDraft
  useEffect(() => { if (tab !== 'zones') stopDrawing() }, [tab, stopDrawing])
  // Home (0.0.33) is picked on the centre map only while Overview is open.
  const homeDraft = useHomeDraft(selected, floor)
  const { cancel: cancelHome } = homeDraft
  useEffect(() => { if (tab !== 'overview') cancelHome() }, [tab, cancelHome])
  const onHomeChanged = useCallback((saved: SiteMap) => {
    onChanged(saved)
    // LiveOps draws home and Return home walks to it: tell it at once.
    void mapsChanged()
  }, [onChanged])

  const freeze = async (reason?: string, zonesReviewed = false) => {
    setFreezing(true)
    setFreezeError(null)
    try {
      const options = reason || zonesReviewed
        ? { ...(reason ? { reason } : {}), ...(zonesReviewed ? { zonesReviewed: true } : {}) }
        : undefined
      onChanged(await dataProvider.setMapStatus(selected.map_id, 'active', options))
      setRefusal(null)
      setZonesAnsweredFor(null)
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
    if (selected.zones.length > 0) { void freeze(reason); return }
    if (zonesAnsweredFor === attemptKey(selected)) { void freeze(reason, true); return }
    setRefusal(null)
    setAskZones(true)
  }
  const activateAnyway = () => {
    setZonesAnsweredFor(attemptKey(selected))
    setAskZones(false)
    void freeze(undefined, true)
  }
  const drawZones = () => { setAskZones(false); setRefusal(null); setTab('zones') }
  const dismissZones = () => {
    setAskZones(false)
    setRefusal((r) => (r?.code === 'zones_unreviewed' ? null : r))
  }

  const trim = async (floorToTrim: number) => {
    setTrimming(true)
    setTrimNote(null)
    try {
      const updated = await dataProvider.trimFloor(selected.map_id, floorToTrim)
      // A floor already inside the margin comes back as it was, with no new version.
      const unchanged = updated.updated_at === selected.updated_at
        && updated.floors.find((f) => f.index === floorToTrim)?.content_hash === selected.floors.find((f) => f.index === floorToTrim)?.content_hash
      setTrimNote({ ok: true, text: t(unchanged ? 'missions.maps.trim.unchanged' : 'missions.maps.trim.done', { margin: TRIM_MARGIN_M }) })
      setTrimAsk(null)
      if (!unchanged) {
        onChanged(updated)
        setRefusal(null)
        await mapsChanged()
      }
    } catch (e) {
      setTrimNote({ ok: false, text: t('missions.maps.trim.failed', { error: errorText(e) }) })
    } finally {
      setTrimming(false)
    }
  }

  // A refusal is thrown back to the inline input, which shows it and stays open.
  const rename = async (change: MapRename) => {
    onChanged(await dataProvider.renameMap(selected.map_id, change))
    void mapsChanged()
  }

  const recheck = () => { setRefusal(null); void quality.recheck() }

  const openEditor = () => go(hashForMapEditor(siteId, selected.map_id))
  // Closing returns to the page, in place, so a reload shows the page.
  const closeEditor = () => go(hashForMap(siteId, selected.map_id), true)

  /** A Setup step's button: it does its work here, or opens the tab (or page)
   *  that holds it. None of them scrolls. */
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
      case 'drawZones': setTab('zones'); return
      case 'sendToRobot':
      case 'useOnRobot':
        setTab('overview')
        setRobotAsk((a) => ({ robotId: action.robotId, act: action.kind === 'useOnRobot' ? 'use' : 'send', nonce: (a?.nonce ?? 0) + 1 }))
        return
      case 'checkQuality': recheck(); return
      case 'activate': requestFreeze(); return
      // Find moving things again is in the map editor's flat view.
      case 'findMoving': openEditor(); return
      // Trim asks first: it saves a new version, which puts an active map back to draft.
      case 'trim': setTrimNote(null); setTrimAsk(action.floorIndex); return
    }
  }

  const restore = async (version: number) => {
    onChanged(await dataProvider.restoreMapVersion(selected.map_id, version))
    setRefusal(null)
    await mapsChanged()
  }

  const onEdited = useCallback((saved: SiteMap) => {
    onChanged(saved)
    setRefusal(null)
    void mapsChanged()
  }, [onChanged])

  const steps = readiness.steps
  const done = steps.filter((s) => s.tone === 'green').length
  const note: React.CSSProperties = { margin: 0, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }

  // ---- the header ----------------------------------------------------------
  const floorName = (f: { index: number; label?: string | null }) => f.label ?? t('liveops.map.floorN', { index: f.index })
  const shownFloor = selected.floors.find((f) => f.index === floor) ?? null
  // Drawing a zone or picking a home is done on the floor plan: the view is
  // held on Flat meanwhile, and the header says why.
  const viewHold = planViewHold(zoneDraft.drawing, homeDraft.picking)
  const viewShown = shownPlanView(planView, viewHold)
  const heldWhy = viewHold ? t(`missions.maps.page.viewHeld.${viewHold}`) : undefined
  const header = (
    <header style={{
      display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap', flexShrink: 0,
      padding: `${space[3]}px ${space[4]}px`, background: color.surface,
    }}>
      {narrow && (
        <Button size="sm" variant="ghost" icon={ChevronLeft} aria-label={t('missions.maps.page.backAria')} onClick={() => go(hashForMap(siteId))}>
          {t('missions.maps.page.back')}
        </Button>
      )}
      {renaming === 'map' && !editing ? (
        <InlineName
          value={selected.name} label={t('missions.maps.rename.name')} maxLength={MAX_MAP_NAME_CHARS} required
          hint={t('missions.maps.rename.hint')} fontSize={font.size.lg}
          onSave={(name) => rename({ name })} onDone={() => setRenaming(null)}
        />
      ) : (
        <h2 style={{ margin: 0, fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.t1, minWidth: 0, overflowWrap: 'anywhere' }}>{selected.name}</h2>
      )}
      {canEdit && !editing && renaming !== 'map' && (
        <IconButton size="sm" icon={Pencil} label={t('missions.maps.rename.open')} onClick={() => setRenaming('map')} />
      )}
      <Badge tone={STATUS_TONE[selected.status]} dot>{t(`missions.maps.status.${selected.status}`)}</Badge>
      {!editing && (
        <Button size="sm" data-ready-chip={`${done}/${steps.length}`} title={t('missions.maps.page.readyTitle')}
          active={tab === 'setup'} onClick={() => setTab('setup')}>
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: radius.full, flexShrink: 0, background: done === steps.length ? color.green : color.amber }} />
          {t('missions.maps.page.ready', { done, total: steps.length })}
          <ChevronRight size={14} aria-hidden />
        </Button>
      )}
      {!editing && shownFloor && (
        <span data-floor-switch="" style={{ display: 'inline-flex', alignItems: 'center', gap: space[1] }}>
          {renaming === 'floor' ? (
            <InlineName
              value={shownFloor.label ?? ''} label={t('missions.maps.rename.floor', { index: shownFloor.index })}
              placeholder={t('liveops.map.floorN', { index: shownFloor.index })} maxLength={MAX_FLOOR_LABEL_CHARS}
              hint={t('missions.maps.rename.hint')} fontSize={font.size.md}
              onSave={(label) => rename({ floors: [{ index: shownFloor.index, label: label || null }] })}
              onDone={() => setRenaming(null)}
            />
          ) : selected.floors.length > 1 ? (
            <Segmented<string>
              label={t('missions.maps.floorsAria')} value={String(floor)}
              onChange={(v) => { setFloorIndex(Number(v)); setTrimAsk(null); setTrimNote(null) }}
              options={selected.floors.map((f) => ({ value: String(f.index), label: floorName(f) }))}
            />
          ) : (
            <span style={{ fontSize: font.size.md, color: color.t2 }}>{floorName(shownFloor)}</span>
          )}
          {canEdit && renaming !== 'floor' && (
            <IconButton size="sm" icon={Pencil} label={t('missions.maps.rename.floorOpen', { floor: floorName(shownFloor) })}
              onClick={() => setRenaming('floor')} />
          )}
        </span>
      )}
      {!editing && shownFloor && (
        <span data-view-switch={viewShown} data-view-held={viewHold ?? undefined} title={heldWhy}
          style={{ display: 'inline-flex', alignItems: 'center', gap: space[2] }}>
          <Segmented<PlanView>
            label={t('missions.maps.page.viewAria')} value={viewShown} onChange={setPlanView}
            options={PLAN_VIEWS.map((v) => ({
              value: v, label: t(`missions.maps.page.view.${v === '2d' ? 'flat' : v}`),
              disabled: viewHold !== null && v !== '2d', title: heldWhy,
            }))}
          />
          {heldWhy && <span role="status" style={{ fontSize: font.size.sm, color: color.t3 }}>{heldWhy}</span>}
        </span>
      )}
      <span style={{ flex: 1 }} />
      {!editing && actions}
      {canEditMap && !narrow && !editing && selected.floors.length > 0 && (
        <Button icon={PenLine} title={t('missions.maps.editor.openHint')} onClick={openEditor}>{t('missions.maps.editor.open')}</Button>
      )}
    </header>
  )

  if (editing) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {header}
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: space[4] }}>
          <MapEditor key={`${selected.map_id}/${floor}`} map={selected} floorIndex={floor} onClose={closeEditor} onSaved={onEdited} />
        </div>
      </div>
    )
  }

  // ---- the panel's tabs ----------------------------------------------------
  const currentVersion = versions.versions?.find((v) => v.current)?.version ?? null
  const floorHash = selected.floors.find((f) => f.index === floor)?.content_hash ?? null
  const surveyId = readiness.reads.survey?.surveyId ?? null
  const report = quality.job ? undefined : quality.report
  const qualityLine = quality.job ? t('missions.maps.page.qualityRunning')
    : report === undefined ? t('missions.maps.page.qualityLoading')
    : report === null ? t('missions.maps.page.qualityNone')
    : !report.current ? t('missions.maps.page.qualityStale')
    : report.passed ? t('missions.maps.page.qualityPassed')
    : t('missions.maps.page.qualityFailed', { checks: report.failed.map(name).join(', ') })
  const qualityTone: Tone = report && report.current ? (report.passed ? 'green' : 'red') : 'neutral'

  // Overview (operator, 2026-11-26: "too texty"): facts to scan, each
  // explanation behind a hover or an info mark rather than a sentence.
  const facts = [
    {
      label: t('missions.maps.page.version'),
      value: (
        <span data-version-fact="" style={{ display: 'inline-flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap', fontVariantNumeric: 'tabular-nums' }}>
          {currentVersion !== null && <span>{t('missions.maps.page.versionValue', { version: currentVersion })}</span>}
          {/* The floor's content hash (schema 0.0.20): what a robot's map files
              must hash to (roverhub-edge/scripts/map_hash.py) for its walks here
              to be accepted. Absent from an older backend. */}
          {floorHash ? (
            <>
              <span title={floorHash} style={{ color: color.t2, fontWeight: font.weight.regular }}>{floorHash.slice(0, 12)}</span>
              <span role="img" aria-label={t('missions.maps.version', { hash: floorHash.slice(0, 12) })}
                title={t('missions.maps.version', { hash: floorHash.slice(0, 12) })}
                style={{ display: 'inline-flex', color: color.t3, cursor: 'help' }}>
                <Info size={14} strokeWidth={1.75} aria-hidden />
              </span>
            </>
          ) : <span style={{ color: color.t3, fontWeight: font.weight.regular }}>{t('missions.maps.page.noHash')}</span>}
        </span>
      ),
    },
    {
      label: t('missions.maps.page.quality'),
      value: (
        <button type="button" data-quality-summary="" title={t('missions.maps.page.seeQuality')} onClick={() => setTab('quality')}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
          <Badge tone={qualityTone} dot style={{ whiteSpace: 'normal', height: 'auto', minHeight: 20, textAlign: 'left' }}>{qualityLine}</Badge>
        </button>
      ),
    },
    ...(surveyId ? [{
      label: t('missions.maps.page.builtFrom'),
      // A survey id is long: cut to the row, whole on hover.
      value: (
        <a href={hashForSiteSurvey(siteId, surveyId)} title={surveyId} style={{
          color: color.accent, display: 'block', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{surveyId}</a>
      ),
    }] : []),
    {
      label: t('missions.maps.page.floorsLabel'),
      value: <span data-floors-fact="" style={{ whiteSpace: 'normal', textAlign: 'right' }}>{selected.floors.length > 0 ? selected.floors.map(floorName).join(' · ') : t('missions.maps.page.noFloor')}</span>,
    },
  ]

  const overview = (
    <SectionGrid>
      <Section title={t('missions.maps.page.factsTitle')}>
        <KeyValue rows={facts} />
      </Section>
      <HomeSection map={selected} floorIndex={floor} draft={homeDraft} onChanged={onHomeChanged} />
      <MapRobotsSection map={selected} floorIndex={floor} maps={maps} ask={robotAsk} />
      <MissionsOnMap siteId={siteId} mapId={selected.map_id} />
    </SectionGrid>
  )

  const setup = (
    <div style={{ display: 'grid', gap: space[5] }}>
      <MapReadyRows steps={steps} onAction={onReadyAction} />
      {trimAsk !== null && canEdit && (
        <InlineAlertDialog label={t('missions.maps.trim.title')} describedBy={trimTextId}
          onClose={() => { if (!trimming) setTrimAsk(null) }} style={{
            display: 'grid', gap: space[2], padding: space[3], borderRadius: radius.md, background: color.amberBg,
          }}>
          <p id={trimTextId} style={{ ...note, color: color.t1 }}>
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
            <Button data-autofocus disabled={trimming} onClick={() => setTrimAsk(null)}>{t('missions.maps.trim.cancel')}</Button>
          </div>
          {trimNote && !trimNote.ok && <p role="alert" style={{ ...note, color: color.red }}>{trimNote.text}</p>}
        </InlineAlertDialog>
      )}
      {trimAsk === null && trimNote && (
        <p role="status" style={{ ...note, color: trimNote.ok ? color.t2 : color.red }}>{trimNote.text}</p>
      )}
      {canEdit && (
        <FreezeControl
          map={selected} busy={freezing} onFreeze={() => requestFreeze()} error={freezeError}
          askZones={askZones} onDrawZones={drawZones} onActivateAnyway={activateAnyway} onDismissZones={dismissZones}
          // While a check runs the report is about to change (and after a save is
          // briefly absent): say nothing about it until the check ends.
          quality={quality.job ? undefined : quality.report} refusal={refusal}
          canOverride={canOverride} onOverride={(reason) => requestFreeze(reason)}
          canRecheck={canRecheck && quality.job === null} onRecheck={recheck}
        />
      )}
    </div>
  )

  const zonesReadOnly = !canEdit || narrow
  const panelBody = tab === 'overview' ? overview
    : tab === 'zones' ? (
      <div style={{ display: 'grid', gap: space[3] }}>
        <ZonePanel map={selected} draft={zoneDraft} readOnly={zonesReadOnly} readOnlyReason={canEdit ? 'touch' : 'role'} />
        {!zonesReadOnly && zoneDraft.drawing && <p style={note}>{t('missions.maps.page.zonesDrawingNote')}</p>}
      </div>
    )
    : tab === 'quality' ? (
      <MapQualitySection
        report={quality.report} error={quality.error} job={quality.job} jobError={quality.jobError}
        floorIndex={floor} canRecheck={canRecheck} onRecheck={recheck}
      />
    )
    : tab === 'versions' ? <MapVersionsSection versions={versions.versions} error={versions.error} canRestore={canConfigure} onRestore={restore} />
    : setup

  const tabs = (
    <div style={{ overflowX: 'auto', flexShrink: 0 }}>
      <Tabs<MapTab>
        label={t('missions.maps.page.tabsAria')} value={tab} onChange={setTab}
        // Setup is reached from the header's Ready chip (spec §1), which keeps
        // four tabs that fit the panel at any width; while it is open no tab
        // is selected and the chip is.
        options={MAP_TABS.filter((k) => k !== 'setup').map((k) => ({ value: k, label: t(`missions.maps.page.tabs.${k}`) }))}
      />
    </div>
  )
  const panel = (
    <div data-map-panel={tab} style={{ display: 'grid', gap: space[4], alignContent: 'start', minWidth: 0 }}>
      {tabs}
      {panelBody}
    </div>
  )
  const plan = selected.floors.length > 0
    ? <MapPlanView map={selected} floorIndex={floor} view={planView} draft={zoneDraft} home={homeDraft} />
    : <p style={{ ...note, padding: space[4] }}>{t('missions.maps.page.noFloor')}</p>

  if (narrow) {
    // Step two: the map, full width, with the panel's tabs under it.
    return (
      <div data-map-step="map" style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {header}
        {surveyOpen && upload}
        <div style={{ height: '50vh', minHeight: 260, flexShrink: 0, padding: space[2] }}>{plan}</div>
        <div style={{ padding: space[4] }}>{panel}</div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {header}
      {upload}
      <div data-map-layout="wide" style={{
        flex: 1, minHeight: 0, display: 'grid', gap: space[3], padding: space[3],
        gridTemplateColumns: 'clamp(180px, 20%, 260px) minmax(0, 1fr) clamp(280px, 28%, 340px)',
      }}>
        <nav style={{ minHeight: 0, overflow: 'auto', padding: space[2], borderRadius: radius.md, background: color.surface }}>
          {list}
        </nav>
        <div style={{ minHeight: 0, minWidth: 0 }}>{plan}</div>
        <div style={{ minHeight: 0, overflow: 'auto', padding: space[4], borderRadius: radius.md, background: color.surface }}>
          {panel}
        </div>
      </div>
    </div>
  )
}
