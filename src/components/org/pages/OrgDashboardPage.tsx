import { useTranslation } from 'react-i18next'
import { attentionText } from '@/i18n/attentionText'
import { ChevronRight, CircleCheck } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge, Button } from '@/components/kit'
import { bridgeLiveness } from '@/fleet/bridgeHealth'
import { siteLocalTime } from '@/org/sites'
import { useOrgSites, type SiteSummary } from '@/org/useOrgSites'
import { useSiteMaps } from '@/org/useSiteMaps'
import { siteThumbnailMap } from '@/org/siteRecords'
import { orgHistory } from '@/org/orgData'
import { enterSite, openRobot } from '@/org/navigation'
import { stateVisualFor } from '@/liveops/stateDisplay'
import { reachabilityOf } from '@/lib/connectivityHealth'
import { Block, DailyBars, MissingBadge, OrgPage, Placeholder, SampleBadge, Stat } from '../parts'
import { SiteMap } from '../SiteMap'
import { SiteMapThumbnail } from '../SiteMapThumbnail'

const PLACE_KEY = { status: 'dashboard.open', motors: 'dashboard.motors', edge: 'dashboard.edgeDevice' } as const

/** One site in the Dashboard's Sites block: its floor map with its robots on
 * it, the site's local time, and the way in. */
function DashboardSiteCard({ site }: { site: SiteSummary }) {
  const { t } = useTranslation()
  const maps = useSiteMaps(site.id)
  return (
    <article data-dashboard-site={site.id} style={{
      background: color.card, borderRadius: radius.md, padding: space[2], display: 'grid', gap: space[2], minWidth: 0,
    }}>
      <SiteMapThumbnail
        map={siteThumbnailMap(maps.maps ?? [], site.robots.map((r) => r.bridge?.nav_map_id))} robots={site.robots}
        loading={maps.maps === null && !maps.error} error={!!maps.error} height={104}
      />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], padding: `0 ${space[1]}px` }}>
        <span style={{ flex: 1, minWidth: 0, fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1, overflowWrap: 'anywhere' }}>{site.name}</span>
        <span style={{ fontSize: font.size.sm, color: color.t3, fontVariantNumeric: 'tabular-nums' }}>
          {siteLocalTime(site.timezone) ?? '—'}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], padding: `0 ${space[1]}px` }}>
        <span style={{ flex: 1, display: 'flex', gap: 4, flexWrap: 'wrap' }} aria-label={t('common.robotCount', { count: site.robots.length })}>
          {site.robots.length === 0
            ? <span style={{ fontSize: font.size.sm, color: color.t3 }}>{t('common.noRobots')}</span>
            : site.robots.map((r) => {
              const v = stateVisualFor(r.abstract_state, r.sdk_state)
              return <span key={r.robot_id} title={`${r.name} · ${v.label}`} style={{ width: 8, height: 8, borderRadius: '50%', background: v.color }} />
            })}
        </span>
        <Button size="sm" onClick={() => enterSite(site.id)}>
          {t('common.enterSite')} <ChevronRight size={14} aria-hidden />
        </Button>
      </div>
    </article>
  )
}

/**
 * Organisation Dashboard: three layers, summary first. Live counts and a list
 * of what needs someone now; every site on a map; then trends over time.
 *
 * The first two run on live data. Each site shows its own floor map with its
 * robots on it; sites with a stored location are also placed on a plain
 * lat/lng grid until a basemap is wired in. The trends are
 * history, which needs the database: mock mode shows sample figures, marked
 * as such, and a real backend shows what is missing.
 */
export function OrgDashboardPage() {
  const { t } = useTranslation()
  const sites = useOrgSites()
  const robots = sites.flatMap((s) => s.robots)
  const online = robots.filter((r) => reachabilityOf(r) === 'online').length
  const problems = sites.flatMap((s) => s.attention.map((a) => ({ ...a, site: s })))
    .sort((a, b) => (a.attention.severity === b.attention.severity ? 0 : a.attention.severity === 'critical' ? -1 : 1))
  const silent = robots.filter((r) => r.bridge && bridgeLiveness(r.bridge.last_heartbeat_at) === 'silent').length
  const missions = sites.reduce((n, s) => n + s.missionsRunning, 0)
  const located = sites.filter((s) => s.location)
  const unlocated = sites.filter((s) => !s.location)

  return (
    <OrgPage
      title={t('dashboard.title')}
      subtitle={t('dashboard.subtitle', { sites: t('common.siteCount', { count: sites.length }), robots: t('common.robotCount', { count: robots.length }) })}
    >
      <div style={{ display: 'grid', gap: space[3], gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <Stat label={t('dashboard.robotsOnline')} value={`${online} / ${robots.length}`} tone={online < robots.length ? 'warn' : undefined} />
        <Stat label={t('dashboard.needAttention')} value={problems.length} tone={problems.some((p) => p.attention.severity === 'critical') ? 'crit' : problems.length ? 'warn' : undefined} />
        <Stat label={t('dashboard.patrolsRunning')} value={missions} />
        <Stat label={t('dashboard.edgeSilent')} value={silent} tone={silent ? 'warn' : undefined} />
      </div>

      <div style={{ display: 'grid', gap: space[4], gridTemplateColumns: 'repeat(auto-fit, minmax(min(440px, 100%), 1fr))', alignItems: 'start' }}>
        <Block title={t('dashboard.needsAttention')} aside={<span style={{ fontSize: font.size.sm, color: color.t3 }}>{t('dashboard.worstFirst')}</span>}>
          {problems.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: space[2], color: color.t2, fontSize: font.size.md }}>
              <CircleCheck size={16} color={color.green} aria-hidden /> {t('dashboard.allClear')}
            </div>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {problems.map(({ robot, attention, site }) => (
                <li key={robot.robot_id} style={{
                  display: 'grid', gridTemplateColumns: '8px 1fr auto', gap: space[3], alignItems: 'center',
                  padding: `${space[2]}px 0`, borderBottom: `1px solid ${color.border}`,
                }}>
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: attention.severity === 'critical' ? color.red : color.amber }} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1 }}>{robot.name}</span>{' '}
                    <span style={{ fontSize: font.size.md, color: attention.severity === 'critical' ? color.red : color.amber }}>{attentionText(t, attention)}</span>
                    <div style={{ fontSize: font.size.sm, color: color.t3 }}>{site.name}</div>
                  </span>
                  <Button size="sm" onClick={() => openRobot(site.id, robot.robot_id, attention.place === 'status' && robot.posture === 'fallen' ? 'LiveOps' : 'Fleet')}>
                    {attention.place === 'status' && robot.posture === 'fallen' ? t('dashboard.openInLiveOps') : t(PLACE_KEY[attention.place])}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Block>

        <Block title={t('dashboard.sites')} aside={located.length > 0 ? <Badge title={t('dashboard.mapTilesLaterTitle')}>{t('dashboard.mapTilesLater')}</Badge> : undefined}>
          {/* Each site by its own floor map; the lat/lng overview only for
              sites that have a location (spec 2026-11-26 §2). */}
          <div style={{ display: 'grid', gap: space[3], gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))' }}>
            {sites.map((s) => <DashboardSiteCard key={s.id} site={s} />)}
          </div>
          {located.length > 0 && (
            <SiteMap
              pins={located.map((s) => ({
                id: s.id, name: s.name, location: s.location!, robots: s.robots.length,
                worst: s.attention[0]?.attention.severity ?? null,
              }))}
              onSelect={(id) => enterSite(id)}
            />
          )}
          {unlocated.length > 0 && located.length > 0 && (
            <div style={{ fontSize: font.size.sm, color: color.t3 }}>
              {t('dashboard.unlocated', { count: unlocated.length })}
            </div>
          )}
        </Block>
      </div>

      <Block title={t('dashboard.last14')} aside={orgHistory ? <SampleBadge /> : <MissingBadge what="database" />}>
        {orgHistory ? (
          <div style={{ display: 'grid', gap: space[5], gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {[
              { title: t('dashboard.uptime'), data: orgHistory.uptimePct, unit: '%', decimals: 0, floor: 90 },
              { title: t('dashboard.patrols'), data: orgHistory.patrols },
              { title: t('dashboard.distance'), data: orgHistory.distanceKm, unit: ' km', decimals: 0 },
              { title: t('dashboard.alerts'), data: orgHistory.alerts },
            ].map((c) => {
              const total = c.unit === '%'
                ? t('dashboard.average', { value: `${(c.data.reduce((a, d) => a + d.value, 0) / c.data.length).toFixed(1)}%` })
                : t('dashboard.inTotal', { value: `${c.data.reduce((a, d) => a + d.value, 0).toFixed(c.decimals ?? 0)}${c.unit ?? ''}` })
              return (
                <div key={c.title} style={{ display: 'grid', gap: space[2] }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2] }}>
                    <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1 }}>{c.title}</span>
                    <span style={{ fontSize: font.size.sm, color: color.t3 }}>{total}</span>
                  </div>
                  <DailyBars data={c.data} unit={c.unit} decimals={c.decimals} floor={c.floor} />
                </div>
              )
            })}
          </div>
        ) : (
          <Placeholder title={t('dashboard.trendsTitle')}>{t('dashboard.trendsBody')}</Placeholder>
        )}
      </Block>
    </OrgPage>
  )
}
