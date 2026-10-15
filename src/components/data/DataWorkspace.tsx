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
import { groupByDay, sinceFor, type MediaRange } from '@/data/mediaLibrary'

type DataTab = 'media' | 'replays' | 'reports' | 'exports'
type MediaView = 'grid' | 'map'

const RANGES: MediaRange[] = ['today', '7d', '30d', 'all']

const selectStyle: React.CSSProperties = {
  height: 32, padding: '0 10px', borderRadius: radius.sm, background: color.card,
  border: `1px solid ${color.border}`, color: color.t1, fontFamily: font.family, fontSize: font.size.md,
}

function timeOf(s: SnapshotRecord): string {
  return new Date(s.captured_at ?? s.received_at).toLocaleTimeString(formatLocale(), { hour: '2-digit', minute: '2-digit' })
}

function Media({ siteId }: { siteId: string }) {
  const { t } = useTranslation()
  const robots = useSiteRobots()
  const [robotId, setRobotId] = useState('')
  const [range, setRange] = useState<MediaRange>('7d')
  const [view, setView] = useState<MediaView>('grid')
  const [page, setPage] = useState<SnapshotPage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<SnapshotRecord | null>(null)
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
        <Placeholder title={t('fleetDetail.dataWs.mapTitle')}>{t('fleetDetail.dataWs.mapBody', { count: page.total })}</Placeholder>
      ) : page.items.length === 0 ? (
        <Placeholder title={t('data.emptyTitle')}>{t('data.emptyBody')}</Placeholder>
      ) : (
        <div style={{ display: 'grid', gap: space[5] }}>
          {days.map((d) => (
            <section key={d.key}>
              <h3 style={{ margin: `0 0 ${space[3]}px`, fontSize: font.size.md, fontWeight: font.weight.bold, color: color.t1 }}>
                {d.label} <span style={{ fontWeight: font.weight.regular, color: color.t3 }}>· {d.items.length}</span>
              </h3>
              <div style={{ display: 'grid', gap: space[3], gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
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
              <img src={open.image_url} alt="" style={{ width: '100%', borderRadius: radius.md, background: color.videoBg }} />
              <KeyValue rows={[
                { label: t('fleetDetail.dataWs.robot'), value: open.robot_id },
                { label: t('fleetDetail.dataWs.camera'), value: open.camera ?? t('fleetDetail.dataWs.notRecorded') },
                { label: t('fleetDetail.dataWs.taken'), value: open.captured_at ? new Date(open.captured_at).toLocaleString(formatLocale()) : t('fleetDetail.dataWs.notRecorded') },
                { label: t('fleetDetail.dataWs.received'), value: new Date(open.received_at).toLocaleString(formatLocale()) },
                { label: t('fleetDetail.dataWs.size'), value: `${Math.round(open.size_bytes / 1024)} KB` },
              ]} />
              <div style={{ fontSize: font.size.sm, color: color.t3 }}>
                {t('fleetDetail.dataWs.downscaled')}
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

function Later({ tab }: { tab: Exclude<DataTab, 'media'> }) {
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
  const [tab, setTab] = useState<DataTab>('media')
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
          onChange={setTab}
          options={(['media', 'replays', 'reports', 'exports'] as const).map((value) => ({ value, label: t(`data.tabs.${value}`) }))}
        />
        {tab === 'media' ? <Media siteId={siteId} /> : <Later tab={tab} />}
        {tab === 'media' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], fontSize: font.size.sm, color: color.t3 }}>
            <ImageOff size={14} aria-hidden /> {t('fleetDetail.dataWs.videoNote')}
          </div>
        )}
      </div>
    </div>
  )
}
