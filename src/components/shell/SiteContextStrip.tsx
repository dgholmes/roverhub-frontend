import { ChevronRight } from 'lucide-react'
import { color, font, space } from '@/design-system/tokens'
import { hashForOrgPage, type Workspace } from '@/app/routes'
import { useSessionStore } from '@/store/useSessionStore'
import { AccentToggle, Badge, ThemeToggle } from '@/components/kit'

/**
 * The site level's one bar: names the site and workspace every action on
 * screen applies to, links back to the organization, and carries the active
 * workspace's own controls (`children` — LiveOps puts the robot selector, view
 * modes and fullscreen here).
 *
 * It replaces two stacked bars: a 32px breadcrumb strip and each LiveOps
 * view's own 44px header. Operators asked for no app chrome inside a site, so
 * this deliberately merges rather than adds — 76px of bars became 44px.
 * docs/audit/2026-08-12-ui-ux-audit.md A-35.
 */
export function SiteContextStrip({
  siteId, workspace, children,
}: {
  siteId: string
  workspace: Workspace
  children?: React.ReactNode
}) {
  const sites = useSessionStore((s) => s.sites)
  const site = sites.find((s) => s.id === siteId)
  const known = site != null

  return (
    <header className="rh-sitebar" style={{
      height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', gap: space[3],
      padding: `0 ${space[2]}px 0 ${space[4]}px`, background: color.surface,
      borderBottom: `1px solid ${color.border}`, fontFamily: font.family,
    }}>
      <nav aria-label="Breadcrumb" style={{
        display: 'flex', alignItems: 'center', gap: space[1], minWidth: 0, flex: 1,
        fontSize: font.size.md,
      }}>
        <a href={hashForOrgPage('Sites')} style={{ color: color.t2, flexShrink: 0 }}>
          Organization
        </a>
        <ChevronRight size={14} strokeWidth={1.75} color={color.t3} style={{ flexShrink: 0 }} aria-hidden />
        <span style={{
          color: known ? color.t1 : color.amber, fontWeight: font.weight.semibold,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {site?.name ?? siteId}
        </span>
        {!known && (
          // A route can name a site that does not exist. Saying so beats
          // rendering a populated workspace under it as though it were real.
          <Badge tone="amber">Unknown site</Badge>
        )}
        <ChevronRight size={14} strokeWidth={1.75} color={color.t3} style={{ flexShrink: 0 }} aria-hidden />
        <span aria-current="page" style={{ color: color.t2, flexShrink: 0 }}>{workspace}</span>
      </nav>

      {children && (
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexShrink: 0 }}>
          {children}
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        <AccentToggle />
        <ThemeToggle />
      </div>
    </header>
  )
}
