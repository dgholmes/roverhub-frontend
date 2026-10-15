import { useTranslation } from 'react-i18next'
import { color, font, space } from '@/design-system/tokens'
import { hashForSiteWorkspace, type Workspace } from '@/app/routes'
import { otherSitesWithRobots } from '@/org/siteRobots'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'

/**
 * A slim bar shown when this site has no robots but others do. A robot's
 * site comes from its bridge's SITE_ID, so a bridge left on `site-dev` puts
 * its robot somewhere other than the site someone opened; without this the
 * site would just look empty.
 */
export function SiteEmptyNotice({ siteId, workspace }: { siteId: string; workspace: Workspace }) {
  const { t } = useTranslation()
  const robots = useLiveOpsStore((s) => s.robots)
  const sites = useSessionStore((s) => s.sites)
  if (robots.some((r) => r.site_id === siteId)) return null
  const elsewhere = otherSitesWithRobots(robots, siteId)
  if (elsewhere.length === 0) return null
  return (
    <div role="status" style={{
      display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap',
      padding: `${space[2]}px ${space[4]}px`, background: color.card,
      borderBottom: `1px solid ${color.border}`, fontSize: font.size.md, color: color.t1,
    }}>
      <span>{t('sites.emptyHere')}</span>
      {elsewhere.map((s) => (
        <a key={s.siteId} href={hashForSiteWorkspace(s.siteId, workspace)} style={{ color: color.accent, fontWeight: font.weight.semibold }}>
          {t('sites.openOther', { site: sites.find((x) => x.id === s.siteId)?.name ?? s.siteId, count: s.count })}
        </a>
      ))}
    </div>
  )
}
