import { ChevronLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { color, font, space } from '@/design-system/tokens'
import { hashForOrgPage } from '@/app/routes'
import { TOUCH_SITE_BAR_HEIGHT } from '@/app/touchNav'
import { useSessionStore } from '@/store/useSessionStore'
import { Badge } from '@/components/kit'
import { AlertCenterButton } from './AlertCenterButton'
import { OperatorProfile } from './OperatorProfile'

/**
 * The touch counterpart of `SiteContextStrip`, for the four non-LiveOps
 * workspaces. The 68 px rail is gone on touch; this carries what it did besides
 * the workspace icons (those are the bottom tab bar's): the way back to the
 * organization, the alert centre and the operator profile.
 *
 * No workspace breadcrumb and no engineer-tools chip: the tab bar already shows
 * the current workspace and the bar has ~390 px to work with.
 */
export function TouchSiteBar({ siteId }: { siteId: string }) {
  const { t } = useTranslation()
  const sites = useSessionStore((s) => s.sites)
  const site = sites.find((s) => s.id === siteId)
  const known = site != null

  return (
    <header data-card-bound="top" style={{
      height: TOUCH_SITE_BAR_HEIGHT, flexShrink: 0, display: 'flex', alignItems: 'center',
      gap: space[2], padding: `0 ${space[2]}px`, background: color.surface,
      borderBottom: `1px solid ${color.border}`, fontFamily: font.family,
    }}>
      <a href={hashForOrgPage('Sites')} aria-label={t('touch.siteBar.backAria')} style={{
        display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, minHeight: 44,
        padding: `0 ${space[2]}px 0 ${space[1]}px`, color: color.t2, fontSize: font.size.md,
      }}>
        <ChevronLeft size={18} strokeWidth={1.75} aria-hidden />
        {t('common.organization')}
      </a>
      <span style={{
        flex: 1, minWidth: 0, color: known ? color.t1 : color.amber,
        fontWeight: font.weight.semibold, fontSize: font.size.md,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {site?.name ?? siteId}
      </span>
      {!known && <Badge tone="amber">{t('common.unknownSite')}</Badge>}
      <AlertCenterButton />
      <OperatorProfile compact />
    </header>
  )
}
