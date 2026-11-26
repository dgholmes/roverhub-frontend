import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { useId, useRef, useState } from 'react'
import { ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react'
import { hashForMap, hashForMapSurvey } from '@/app/routes'
import { Badge, Button, InlineAlertDialog, KeyValue, Tabs } from '@/components/kit'
import { color, font, radius, space } from '@/design-system/tokens'
import { useSessionStore } from '@/store/useSessionStore'
import { stateVisualFor } from '@/liveops/stateDisplay'
import { siteLocalTime } from '@/org/sites'
import { siteThumbnailMap, siteWriteError } from '@/org/siteRecords'
import { robotsOnMap } from '@/org/robotMapInfo'
import { useOrgAdmin } from '@/org/useOrgAdmin'
import { useOrgSites, type SiteSummary } from '@/org/useOrgSites'
import { useSiteMaps } from '@/org/useSiteMaps'
import { enterSite, openRobot } from '@/org/navigation'
import type { SiteMap } from '@/types/maps'
import { OrgPage, Placeholder } from '../parts'
import { SiteMapThumbnail } from '../SiteMapThumbnail'
import { RobotMapSummary } from '../RobotMapSummary'
import { MoveSiteAction } from './MoveRobotSite'
import { SiteFormDialog, type SiteFormMode } from './SiteFormDialog'

export type SitePanelTab = 'maps' | 'robots' | 'settings'
const PANEL_TABS: SitePanelTab[] = ['maps', 'robots', 'settings']

const MAP_STATUS_TONE = { active: 'green', draft: 'amber', archived: 'neutral' } as const

function worstPill(t: TFunction, s: SiteSummary) {
  const worst = s.attention[0]
  if (worst) {
    return (
      <Badge tone={worst.attention.severity === 'critical' ? 'red' : 'amber'} title={s.attention.map((a) => `${a.robot.name}: ${a.attention.text}`).join('; ')}>
        {t('sites.needAttention', { count: s.attention.length })}
      </Badge>
    )
  }
  if (s.robots.length === 0) return <Badge>{t('common.noRobots')}</Badge>
  return <Badge tone="green">{t('sites.allReady')}</Badge>
}

/** The first eight characters of a floor's content hash: the map's version. */
function shortVersion(map: SiteMap): string | null {
  const hash = map.floors.find((f) => f.content_hash)?.content_hash
  return hash ? hash.slice(0, 8) : null
}

function SiteCard({ site, selected, onSelect }: { site: SiteSummary; selected: boolean; onSelect: () => void }) {
  const { t } = useTranslation()
  const time = siteLocalTime(site.timezone)
  const maps = useSiteMaps(site.id)
  return (
    <article
      data-site-card={site.id}
      onClick={onSelect}
      style={{
        // Separated by tint, not outline: the selected site wears the selection wash.
        background: selected ? color.selected : color.surface, borderRadius: radius.lg, padding: space[3], cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: space[3], minWidth: 0,
      }}
    >
      <SiteMapThumbnail
        map={siteThumbnailMap(maps.maps ?? [], site.robots.map((r) => r.bridge?.nav_map_id))} robots={site.robots}
        loading={maps.maps === null && !maps.error} error={!!maps.error} height={132}
      />
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: space[2], padding: `0 ${space[1]}px` }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.t1 }}>{site.name}</div>
          <div style={{ fontSize: font.size.sm, color: color.t3, marginTop: 2 }}>
            {site.timezone ? `${site.timezone}${time ? ` · ${time}` : ''}` : t('sites.noTimezone')}
          </div>
        </div>
        {worstPill(t, site)}
      </div>
      <div style={{ display: 'flex', gap: 5, minHeight: 10, padding: `0 ${space[1]}px` }} aria-label={t('common.robotCount', { count: site.robots.length })}>
        {site.robots.map((r) => {
          const v = stateVisualFor(r.abstract_state, r.sdk_state)
          return <span key={r.robot_id} title={`${r.name} · ${v.label}`} style={{ width: 10, height: 10, borderRadius: '50%', background: v.color }} />
        })}
      </div>
      <div style={{ fontSize: font.size.md, color: color.t2, padding: `0 ${space[1]}px` }}>
        {site.robots.length === 0
          ? t('sites.emptyCard')
          : `${t('sites.summary', { robots: t('common.robotCount', { count: site.robots.length }), online: site.online })}${site.missionsRunning ? ` · ${t('sites.patrolsRunning', { count: site.missionsRunning })}` : ''}`}
      </div>
      <Button
        variant={selected ? 'primary' : 'secondary'}
        style={{ alignSelf: 'flex-start' }}
        onClick={(e) => { e.stopPropagation(); enterSite(site.id) }}
      >
        {t('common.enterSite')} <ChevronRight size={14} aria-hidden />
      </Button>
    </article>
  )
}

/** Maps tab: every map at the site, each with what it is and who has it. */
function MapsTab({ site }: { site: SiteSummary }) {
  const { t } = useTranslation()
  const entry = useSiteMaps(site.id)
  const note: React.CSSProperties = { margin: 0, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }
  if (entry.maps === null) {
    return <p style={note}>{entry.error ? t('orgSites.maps.error', { error: entry.error }) : t('orgSites.maps.loading')}</p>
  }
  const maps = [...entry.maps].sort((a, b) =>
    (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1) || b.updated_at.localeCompare(a.updated_at))
  if (maps.length === 0) {
    return (
      <div style={{ display: 'grid', gap: space[2] }}>
        <p style={note}>{t('orgSites.maps.none')}</p>
        <a href={hashForMapSurvey(site.id)} style={{ color: color.accent, fontSize: font.size.md, fontWeight: font.weight.semibold }}>
          {t('orgSites.maps.survey')}
        </a>
      </div>
    )
  }
  return (
    <ul aria-label={t('orgSites.tabs.maps')} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: space[3] }}>
      {entry.error && <li style={{ ...note, color: color.amber }}>{t('orgSites.maps.stale', { error: entry.error })}</li>}
      {maps.map((m) => {
        const holders = robotsOnMap(site.robots, m.map_id)
        const version = shortVersion(m)
        return (
          <li key={m.map_id} data-site-map={m.map_id} style={{
            display: 'grid', gridTemplateColumns: '112px 1fr', gap: space[3], alignItems: 'start',
            background: color.card, borderRadius: radius.md, padding: space[2],
          }}>
            <SiteMapThumbnail map={m} robots={site.robots} height={80} />
            <div style={{ minWidth: 0, display: 'grid', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
                <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1, minWidth: 0, overflowWrap: 'anywhere' }}>{m.name}</span>
                <Badge tone={MAP_STATUS_TONE[m.status]}>{t(`orgSites.mapStatus.${m.status}`)}</Badge>
              </div>
              <div style={{ fontSize: font.size.sm, color: color.t3 }}>
                {t('orgSites.maps.floors', { count: m.floors.length })}
                {version && <> · {t('orgSites.maps.version', { version })}</>}
              </div>
              <div style={{ fontSize: font.size.sm, color: color.t2 }}>
                {holders.length === 0 ? t('orgSites.maps.noRobots') : (
                  <span style={{ display: 'inline-flex', gap: space[2], flexWrap: 'wrap' }}>
                    {holders.map((r) => {
                      const v = stateVisualFor(r.abstract_state, r.sdk_state)
                      return (
                        <span key={r.robot_id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: v.color }} />{r.name}
                        </span>
                      )
                    })}
                  </span>
                )}
              </div>
              <a href={hashForMap(site.id, m.map_id)} style={{ color: color.accent, fontSize: font.size.sm, fontWeight: font.weight.semibold, justifySelf: 'start' }}>
                {t('orgSites.maps.open')}
              </a>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

/** Robots tab: each robot here with its state, its map, and Move to site. */
function RobotsTab({ site, sites }: { site: SiteSummary; sites: SiteSummary[] }) {
  const { t } = useTranslation()
  const entry = useSiteMaps(site.id)
  if (site.robots.length === 0) return <div style={{ fontSize: font.size.md, color: color.t3 }}>{t('sites.noneYet')}</div>
  return (
    <ul aria-label={t('orgSites.tabs.robots')} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: space[2] }}>
      {site.robots.map((r) => {
        const v = stateVisualFor(r.abstract_state, r.sdk_state)
        return (
          <li key={r.robot_id} data-site-robot={r.robot_id} style={{ background: color.card, borderRadius: radius.md, padding: space[2], display: 'grid', gap: space[1] }}>
            <button onClick={() => openRobot(site.id, r.robot_id)} style={{
              all: 'unset', cursor: 'pointer', width: '100%', boxSizing: 'border-box',
              display: 'grid', gridTemplateColumns: '8px 1fr auto', gap: space[2], alignItems: 'center', fontSize: font.size.md,
            }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: v.color }} />
              <span style={{ color: color.t1, fontWeight: font.weight.semibold }}>{r.name}</span>
              <span style={{ color: color.t3, fontSize: font.size.sm }}>{v.label}</span>
            </button>
            <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap', fontSize: font.size.sm, paddingLeft: 16 }}>
              <span style={{ color: color.t3 }}>{t('orgSites.robotMap.label')}</span>
              <RobotMapSummary robot={r} maps={entry.maps} />
            </div>
            <div style={{ paddingLeft: 16 }}><MoveSiteAction robot={r} sites={sites} /></div>
          </li>
        )
      })}
    </ul>
  )
}

/** Settings tab: what the site is, and, for an org owner or admin, Edit and
 * Delete. A site known only from its robots has no record to edit: saving
 * it creates one under the same id. */
function SettingsTab({ site, onEdit }: { site: SiteSummary; onEdit: () => void }) {
  const { t } = useTranslation()
  const admin = useOrgAdmin()
  const deleteSite = useSessionStore((s) => s.deleteSite)
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [refusal, setRefusal] = useState<string | null>(null)
  const deleteButton = useRef<HTMLButtonElement>(null)
  const askId = useId()
  const time = siteLocalTime(site.timezone)
  const unset = <span style={{ color: color.t3 }}>{t('common.notSet')}</span>
  const notAdmin = t('orgSites.settings.adminsOnly')

  const confirmDelete = async () => {
    setBusy(true)
    setRefusal(null)
    try {
      await deleteSite(site.id)
      setAsking(false)
    } catch (e) {
      const w = siteWriteError(e)
      const parts = [
        w.robots.length ? t('orgSites.settings.keptByRobots', { robots: w.robots.join(', ') }) : null,
        w.maps.length ? t('orgSites.settings.keptByMaps', { maps: w.maps.join(', ') }) : null,
      ].filter(Boolean).join(' ')
      setRefusal(w.status === 409
        ? `${t('orgSites.settings.deleteRefused')} ${w.text ?? ''} ${parts}`.trim()
        : t('orgSites.settings.deleteFailed', { reason: w.text ?? t('common.unknown') }))
      setAsking(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', gap: space[4] }}>
      {site.discovered && (
        <p style={{ margin: 0, fontSize: font.size.sm, color: color.t2, lineHeight: 1.5 }}>{t('orgSites.settings.discovered')}</p>
      )}
      <KeyValue rows={[
        { label: t('sites.siteId'), value: site.id },
        { label: t('sites.name'), value: site.name },
        { label: t('sites.timezone'), value: site.timezone ?? unset },
        { label: t('sites.localTime'), value: time ?? '—' },
        { label: t('orgSites.settings.address'), value: site.address ? <span style={{ whiteSpace: 'normal', textAlign: 'right' }}>{site.address}</span> : unset },
        {
          label: t('sites.location'),
          value: site.location ? `${site.location.lat.toFixed(3)}, ${site.location.lng.toFixed(3)}` : unset,
        },
      ]} />
      <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
        <Button icon={Pencil} disabled={!admin} title={admin ? undefined : notAdmin} onClick={onEdit}>
          {site.discovered ? t('orgSites.settings.save') : t('orgSites.settings.edit')}
        </Button>
        {!site.discovered && (
          <Button
            ref={deleteButton} icon={Trash2} variant="danger" disabled={!admin || busy}
            title={admin ? undefined : notAdmin}
            onClick={() => { setRefusal(null); setAsking(true) }}
          >
            {t('orgSites.settings.delete')}
          </Button>
        )}
      </div>
      {!admin && <p style={{ margin: 0, fontSize: font.size.sm, color: color.t3 }}>{notAdmin}</p>}
      {asking && (
        <InlineAlertDialog
          label={t('orgSites.settings.deleteTitle', { name: site.name })} describedBy={askId}
          onClose={() => setAsking(false)} returnFocus={deleteButton}
          style={{ background: color.redBg, borderRadius: radius.md, padding: space[3], display: 'grid', gap: space[2] }}
        >
          <p id={askId} style={{ margin: 0, fontSize: font.size.sm, color: color.t1, lineHeight: 1.5 }}>
            {t('orgSites.settings.deleteBody', { name: site.name })}
          </p>
          <div style={{ display: 'flex', gap: space[2] }}>
            <Button data-autofocus onClick={() => setAsking(false)}>{t('common.cancel')}</Button>
            <Button variant="danger" disabled={busy} onClick={() => void confirmDelete()}>
              {busy ? t('orgSites.settings.deleting') : t('orgSites.settings.deleteConfirm')}
            </Button>
          </div>
        </InlineAlertDialog>
      )}
      {refusal && <div role="alert" style={{ color: color.red, fontSize: font.size.sm, lineHeight: 1.5 }}>{refusal}</div>}
    </div>
  )
}

function SitePanel({ site, sites, tab, onTab, onEdit }: {
  site: SiteSummary
  sites: SiteSummary[]
  tab: SitePanelTab
  onTab: (tab: SitePanelTab) => void
  onEdit: () => void
}) {
  const { t } = useTranslation()
  return (
    <aside data-site-panel={site.id} style={{
      background: color.surface, borderRadius: radius.lg, padding: space[4],
      display: 'flex', flexDirection: 'column', gap: space[4], position: 'sticky', top: 0,
    }}>
      <div>
        <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.t1 }}>{site.name}</div>
        <div style={{ fontSize: font.size.sm, color: color.t3 }}>{site.id}{site.discovered ? ` · ${t('sites.foundFromRobots')}` : ''}</div>
      </div>
      <Tabs
        options={PANEL_TABS.map((value) => ({ value, label: t(`orgSites.tabs.${value}`) }))}
        value={tab} onChange={onTab} label={t('orgSites.tabs.aria')}
      />
      {tab === 'maps' && <MapsTab site={site} />}
      {tab === 'robots' && <RobotsTab site={site} sites={sites} />}
      {tab === 'settings' && <SettingsTab site={site} onEdit={onEdit} />}
    </aside>
  )
}

/**
 * Every site with its live robots and its floor map, and the selected site's
 * maps, robots and settings beside them (spec 2026-11-26 §2). Sites are
 * stored by the backend (GET/POST/PATCH/DELETE /sites); a site a robot
 * reports with no record is listed too, and saving it creates one. Creating,
 * editing and deleting are for organisation owners and admins.
 */
export function SitesPage() {
  const { t } = useTranslation()
  const sites = useOrgSites()
  const activeSiteId = useSessionStore((s) => s.activeSiteId)
  const sitesStatus = useSessionStore((s) => s.sitesStatus)
  const sitesError = useSessionStore((s) => s.sitesError)
  const loadSites = useSessionStore((s) => s.loadSites)
  const admin = useOrgAdmin()
  const [selectedId, setSelectedId] = useState<string>(activeSiteId)
  const [tab, setTab] = useState<SitePanelTab>('maps')
  const [form, setForm] = useState<SiteFormMode | null>(null)
  const selected = sites.find((s) => s.id === selectedId) ?? sites[0]

  return (
    <OrgPage
      title={t('sites.title')}
      subtitle={t('common.siteCount', { count: sites.length })}
      actions={(
        <Button
          variant="primary" icon={Plus} disabled={!admin}
          title={admin ? undefined : t('orgSites.settings.adminsOnly')}
          onClick={() => setForm({ kind: 'create' })}
        >
          {t('sites.newSite')}
        </Button>
      )}
    >
      {sitesStatus === 'error' && (
        <div role="alert" style={{
          display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap',
          background: color.amberBg, borderRadius: radius.md, padding: `${space[2]}px ${space[3]}px`, fontSize: font.size.sm, color: color.t1,
        }}>
          <span style={{ flex: 1, minWidth: 200 }}>{t('orgSites.listError', { error: sitesError ?? '' })}</span>
          <Button size="sm" onClick={() => void loadSites()}>{t('orgSites.retry')}</Button>
        </div>
      )}
      {sitesStatus === 'loading' && sites.length === 0 && (
        <div role="status" style={{ fontSize: font.size.sm, color: color.t3 }}>{t('orgSites.loading')}</div>
      )}
      {/* Cards take the room; the panel keeps ~400px beside them and drops
          below them when the window is too narrow for both. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: space[4], alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 600px', minWidth: 0, display: 'grid', gap: space[3], gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', alignContent: 'start' }}>
          {sites.map((s) => (
            <SiteCard key={s.id} site={s} selected={s.id === selected?.id} onSelect={() => setSelectedId(s.id)} />
          ))}
        </div>
        <div style={{ flex: '1 1 400px', maxWidth: 520, minWidth: 'min(300px, 100%)' }}>
          {selected ? (
            <SitePanel
              site={selected} sites={sites} tab={tab} onTab={setTab}
              onEdit={() => setForm(selected.discovered ? { kind: 'adopt', site: selected } : { kind: 'edit', site: selected })}
            />
          ) : (
            <Placeholder title={t('sites.noSitesTitle')}>{t('sites.noSitesBody')}</Placeholder>
          )}
        </div>
      </div>

      {form && (
        <SiteFormDialog
          mode={form}
          onClose={() => setForm(null)}
          onSaved={(id) => { setSelectedId(id); setForm(null) }}
        />
      )}
    </OrgPage>
  )
}
