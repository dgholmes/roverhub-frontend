import { useSiteRobots } from '@/org/useSiteRobots'
import { useTranslation } from 'react-i18next'
import { formatLocale } from '@/i18n'
import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, ImageOff } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge, Button, KeyValue, Segmented, Tabs } from '@/components/kit'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { MissingBadge, Placeholder, SampleBadge } from '@/components/org/parts'
import type { SnapshotPage, SnapshotRecord } from '@/types'
import { groupByDay, hasUsablePosition, sinceFor, type MediaRange } from '@/data/mediaLibrary'
import { EstimatedBadge } from '@/components/common/EstimatedBadge'
import { useTouchShell } from '@/lib/useTouchShell'
import { SnapshotMap } from './SnapshotMap'
import { RunsView } from './RunsView'
import { RunPage } from './RunPage'
import { SurveysView } from './surveys/SurveysView'
import { SurveyReplayPage } from './surveys/SurveyReplayPage'
import { selectStyle } from './selectStyle'
import {
  DATA_TABS, dataTabFromHash, hashForData, hashForSiteRun, hashForSiteSurvey, runIdFromHash, surveyIdFromHash,
  type DataTab,
} from '@/app/routes'
import { useRemembered, viewKey } from '@/lib/viewMemory'

type MediaView = 'grid' | 'map'

const RANGES: MediaRange[] = ['today', '7d', '30d', 'all']

const isString = (v: unknown): v is string => typeof v === 'string'
const isRange = (v: unknown): v is MediaRange => (RANGES as unknown[]).includes(v)
const isMediaView = (v: unknown): v is MediaView => v === 'grid' || v === 'map'

/** What Data shows: a tab, and the run or survey open in it, if any. */
interface DataLocation {
  tab: DataTab
  run: string | null
  survey: string | null
}

/** What a Data hash opens, or null when it is not a Data hash. */
function locationFromHash(hash: string): DataLocation | null {
  const tab = dataTabFromHash(hash)
  if (!tab) return null
  return {
    tab,
    run: tab === 'missions' ? runIdFromHash(hash) : null,
    survey: tab === 'surveys' ? surveyIdFromHash(hash) : null,
  }
}

function hashForLocation(siteId: string, at: DataLocation): string {
  if (at.tab === 'missions' && at.run) return hashForSiteRun(siteId, at.run)
  if (at.tab === 'surveys' && at.survey) return hashForSiteSurvey(siteId, at.survey)
  return hashForData(siteId, at.tab)
}

function timeOf(s: SnapshotRecord): string {
  return new Date(s.captured_at ?? s.received_at).toLocaleTimeString(formatLocale(), { hour: '2-digit', minute: '2-digit' })
}

function Media({ siteId }: { siteId: string }) {
  const { t } = useTranslation()
  const robots = useSiteRobots()
  // Narrow (under 700 px, a phone or a narrow window) fits three snapshots
  // across; any wider viewport keeps the desktop grid, touch or not.
  const { narrow } = useTouchShell()
  // The filters are this viewer's conveniences, not part of a link, so they
  // are remembered per site rather than put in the address. A remembered
  // robot this site no longer has shows every robot.
  const [rememberedRobot, setRobotId] = useRemembered(viewKey('data', siteId, 'media', 'robot'), '', isString)
  const robotId = robots.some((r) => r.robot_id === rememberedRobot) ? rememberedRobot : ''
  const [range, setRange] = useRemembered<MediaRange>(viewKey('data', siteId, 'media', 'range'), '7d', isRange)
  const [view, setView] = useRemembered<MediaView>(viewKey('data', siteId, 'media', 'view'), 'grid', isMediaView)
  const [page, setPage] = useState<SnapshotPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<SnapshotRecord | null>(null)
  // Measured from the loaded image rather than assumed: the frame size depends
  // on which video path the edge device ran when the photo was taken (640x480
  // over DDS, 1280x720 from the robot's own RTSP stream), and is not recorded.
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => { setDims(null) }, [open])
  const nameOf = useMemo(() => Object.fromEntries(robots.map((r) => [r.robot_id, r.name])), [robots])

  useEffect(() => {
    let cancelled = false
    setError(null)
    dataProvider.listSnapshots({ site_id: siteId, robot_id: robotId || undefined, since: sinceFor(range), limit: 200 })
      .then((p) => { if (!cancelled) setPage(p) })
      .catch((e: unknown) => { if (!cancelled) { setPage(null); setError(e instanceof Error ? e.message : String(e)) } })
    return () => { cancelled = true }
  }, [siteId, robotId, range])

  const days = page ? groupByDay(page.items, new Date(), { today: t('data.today'), yesterday: t('data.yesterday'), locale: formatLocale() }) : []

  return (
    <div style={{ display: 'grid', gap: space[4] }}>
      <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
        <label htmlFor="media-robot" style={{ fontSize: font.size.sm, color: color.t2 }}>{t('data.robot')}</label>
        <select id="media-robot" style={selectStyle} value={robotId} onChange={(e) => setRobotId(e.target.value)}>
          <option value="">{t('data.allRobots')}</option>
          {robots.map((r) => <option key={r.robot_id} value={r.robot_id}>{r.name}</option>)}
        </select>
        <Segmented label={t('fleetDetail.dataWs.rangeAria')} options={RANGES.map((value) => ({ value, label: t(`data.range.${value}`) }))} value={range} onChange={setRange} />
        <span style={{ flex: 1 }} />
        {page?.sample && <SampleBadge />}
        <Segmented label={t('fleetDetail.dataWs.viewAria')} options={[{ value: 'grid', label: t('data.view.grid') }, { value: 'map', label: t('data.view.map') }]} value={view} onChange={setView} />
      </div>

      {error ? (
        <Placeholder title={t('fleetDetail.dataWs.errorTitle')}>{t('fleetDetail.dataWs.errorBody', { error })}</Placeholder>
      ) : !page ? (
        <div style={{ fontSize: font.size.md, color: color.t3 }}>{t('data.loading')}</div>
      ) : view === 'map' ? (
        page.items.some(hasUsablePosition)
          ? <SnapshotMap items={page.items} nameOf={nameOf} onOpen={setOpen} />
          : <Placeholder title={t('fleetDetail.dataWs.mapTitle')}>{t('fleetDetail.dataWs.mapBody', { count: page.total })}</Placeholder>
      ) : page.items.length === 0 ? (
        <Placeholder title={t('data.emptyTitle')}>{t('data.emptyBody')}</Placeholder>
      ) : (
        <div style={{ display: 'grid', gap: space[5] }}>
          {days.map((d) => (
            <section key={d.key}>
              <h3 style={{ margin: `0 0 ${space[3]}px`, fontSize: font.size.md, fontWeight: font.weight.bold, color: color.t1 }}>
                {d.label} <span style={{ fontWeight: font.weight.regular, color: color.t3 }}>· {d.items.length}</span>
              </h3>
              <div style={{ display: 'grid', gap: space[3], gridTemplateColumns: `repeat(auto-fill, minmax(${narrow ? 104 : 200}px, 1fr))` }}>
                {d.items.map((s) => (
                  <button
                    key={s.snapshot_id}
                    onClick={() => setOpen(s)}
                    style={{ all: 'unset', cursor: 'pointer', display: 'grid', gap: space[1], minWidth: 0 }}
                  >
                    <div style={{ aspectRatio: '4 / 3', borderRadius: radius.md, overflow: 'hidden', background: color.videoBg, border: `1px solid ${color.border}` }}>
                      <img src={s.image_url} alt={t('fleetDetail.dataWs.snapshotAlt', { name: nameOf[s.robot_id] ?? s.robot_id })} loading="lazy"
                        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                    </div>
                    <div style={{ fontSize: font.size.md, color: color.t1, fontWeight: font.weight.semibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {nameOf[s.robot_id] ?? s.robot_id}
                    </div>
                    <div style={{ fontSize: font.size.sm, color: color.t3 }}>
                      {timeOf(s)}{s.camera ? t('fleetDetail.dataWs.cameraSuffix', { camera: s.camera }) : ''}
                    </div>
                  </button>
                ))}
              </div>
            </section>
          ))}
          {page.next_offset !== null && (
            <div style={{ fontSize: font.size.sm, color: color.t3 }}>{t('fleetDetail.dataWs.showingNewest', { shown: page.items.length, total: page.total })}</div>
          )}
        </div>
      )}

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent style={{ background: color.elevated, border: `1px solid ${color.border}`, color: color.t1, maxWidth: 880 }}>
          {open && (
            <>
              <DialogHeader>
                <DialogTitle style={{ color: color.t1 }}>{nameOf[open.robot_id] ?? open.robot_id} · {timeOf(open)}</DialogTitle>
              </DialogHeader>
              <img
                src={open.image_url} alt=""
                onLoad={(e) => setDims({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                style={{ width: '100%', borderRadius: radius.md, background: color.videoBg }}
              />
              <KeyValue rows={[
                { label: t('fleetDetail.dataWs.robot'), value: open.robot_id },
                { label: t('fleetDetail.dataWs.camera'), value: open.camera ?? t('fleetDetail.dataWs.notRecorded') },
                { label: t('fleetDetail.dataWs.taken'), value: open.captured_at ? new Date(open.captured_at).toLocaleString(formatLocale()) : t('fleetDetail.dataWs.notRecorded') },
                {
                  label: t('fleetDetail.dataWs.position'),
                  value: open.position && hasUsablePosition(open)
                    ? <span style={{ display: 'inline-flex', gap: space[2], alignItems: 'center' }}>{open.position.x_m.toFixed(1)}, {open.position.y_m.toFixed(1)} m <EstimatedBadge compact quality={open.position.quality ?? 'estimated'} /></span>
                    : open.position ? t('fleetDetail.dataWs.positionLost') : t('fleetDetail.dataWs.notRecorded'),
                },
                { label: t('fleetDetail.dataWs.received'), value: new Date(open.received_at).toLocaleString(formatLocale()) },
                { label: t('fleetDetail.dataWs.resolution'), value: dims ? `${dims.w} × ${dims.h}` : '…' },
                { label: t('fleetDetail.dataWs.size'), value: `${Math.round(open.size_bytes / 1024)} KB` },
              ]} />
              <div style={{ fontSize: font.size.sm, color: color.t3 }}>
                {t('fleetDetail.dataWs.streamFrame')}
              </div>
              <div>
                <Button icon={ExternalLink} onClick={() => window.open(open.image_url, '_blank', 'noopener')}>{t('fleetDetail.dataWs.openFull')}</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Later({ tab }: { tab: Exclude<DataTab, 'media' | 'missions' | 'surveys'> }) {
  const { t } = useTranslation()
  return (
    <div style={{ display: 'grid', gap: space[3], maxWidth: 720 }}>
      <div style={{ display: 'flex', gap: space[2] }}>
        <MissingBadge what="database" />
        {tab === 'reports' && <Badge tone="amber" title={t('fleetDetail.dataWs.needsPatrolsTitle')}>{t('fleetDetail.dataWs.needsPatrols')}</Badge>}
      </div>
      <Placeholder title={t(`fleetDetail.dataWs.${tab}Title`)}>{t(`fleetDetail.dataWs.${tab}Body`)}</Placeholder>
    </div>
  )
}

/**
 * Site Data workspace (PRD §11): Media now, Replays, Reports and Exports
 * laid out with what they wait on. Media lists stored snapshots through the
 * data provider, which reads roverhub-backend's GET /snapshots against a real
 * backend and sample captures otherwise.
 */
export function DataWorkspace({ siteId }: { siteId: string }) {
  const { t } = useTranslation()
  // The tab, and the run or survey open in it, live in the address
  // (hashForData, hashForSiteRun, hashForSiteSurvey), so a reload or a copied
  // link reopens them. Every change replaces the address in place rather than
  // adding a step, so Back leaves Data instead of walking back through runs;
  // closing a run or survey puts its tab's list back in the address. (Until
  // 2026-11-26 a link opened its run once and the address was reset to bare
  // Data, which made a reload drop both the run and the tab.)
  const [at, setAt] = useState<DataLocation>(
    () => locationFromHash(window.location.hash) ?? { tab: 'media', run: null, survey: null },
  )
  const { tab, run: openRun, survey: openSurvey } = at
  const show = (next: DataLocation) => {
    setAt(next)
    const hash = hashForLocation(siteId, next)
    if (window.location.hash !== hash) window.history.replaceState(window.history.state, '', hash)
  }
  // Back and Forward while Data stays mounted change only the address, so
  // follow it. An address that is not Data's is the shell on its way out.
  useEffect(() => {
    const follow = () => { const next = locationFromHash(window.location.hash); if (next) setAt(next) }
    window.addEventListener('hashchange', follow)
    return () => window.removeEventListener('hashchange', follow)
  }, [])
  // The robot filter lists live robots, so start the same feed Fleet does.
  const init = useLiveOpsStore((s) => s.init)
  const teardown = useLiveOpsStore((s) => s.teardown)
  useEffect(() => {
    init()
    return () => teardown()
  }, [init, teardown])
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
      <div style={{ maxWidth: 1440, margin: '0 auto', padding: `${space[4]}px ${space[6]}px ${space[10]}px`, display: 'grid', gap: space[4] }}>
        <Tabs
          label={t('fleetDetail.dataWs.tabsAria')}
          value={tab}
          onChange={(v) => show({ tab: v, run: null, survey: null })}
          options={DATA_TABS.map((value) => ({ value, label: t(`data.tabs.${value}`) }))}
        />
        {tab === 'media' && <Media siteId={siteId} />}
        {tab === 'missions' && (openRun
          ? <RunPage siteId={siteId} runId={openRun} onBack={() => show({ ...at, run: null })} />
          : <RunsView siteId={siteId} onOpen={(run) => show({ ...at, run })} />)}
        {tab === 'surveys' && (openSurvey
          ? <SurveyReplayPage siteId={siteId} surveyId={openSurvey} onBack={() => show({ ...at, survey: null })} />
          : <SurveysView siteId={siteId} onOpen={(survey) => show({ ...at, survey })} />)}
        {tab !== 'media' && tab !== 'missions' && tab !== 'surveys' && <Later tab={tab} />}
        {tab === 'media' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.sm, color: color.t3 }}>
            <ImageOff size={14} aria-hidden /> {t('fleetDetail.dataWs.videoNote')}
          </div>
        )}
      </div>
    </div>
  )
}
