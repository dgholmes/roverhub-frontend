import { ChevronRight } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { hashForOrgPage, type Workspace } from '@/app/routes'
import { useSessionStore } from '@/store/useSessionStore'

/**
 * Names the site and workspace every action on screen applies to, and gives a
 * labelled way back to the organization.
 *
 * The site level was previously invisible in four of the five workspaces:
 * Missions showed the site nowhere at all, Fleet only as a per-row column, and
 * the sole route back to the org was an unlabeled icon button with a
 * hover-only tooltip. For a console whose controls move a physical robot,
 * "which site am I acting on?" should never require inference.
 *
 * Deliberately 32px and quiet: the original no-chrome decision was about
 * keeping a site feeling like a focused surface, and this preserves that while
 * still answering the question.
 * docs/audit/2026-08-12-ui-ux-audit.md A-35.
 */
export function SiteContextStrip({ siteId, workspace }: { siteId: string; workspace: Workspace }) {
  const sites = useSessionStore((s) => s.sites)
  const site = sites.find((s) => s.id === siteId)
  const known = site != null

  return (
    <div style={{
      height: 32, flexShrink: 0, display: 'flex', alignItems: 'center', gap: space[1],
      padding: `0 ${space[4]}px`, background: color.surface,
      borderBottom: `1px solid ${color.border}`, fontFamily: font.family,
      fontSize: font.size.md,
    }}>
      <a
        href={hashForOrgPage('Sites')}
        style={{ color: color.t2, textDecoration: 'none', flexShrink: 0 }}
      >
        Organization
      </a>
      <ChevronRight size={13} strokeWidth={1.8} color={color.t3} style={{ flexShrink: 0 }} />
      <span style={{
        color: known ? color.t1 : color.amber, fontWeight: font.weight.semibold,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {site?.name ?? siteId}
      </span>
      {!known && (
        // A route can name a site that does not exist. Saying so beats
        // rendering a populated workspace under it as though it were real.
        <span style={{
          flexShrink: 0, marginLeft: space[1], fontSize: font.size.sm, fontWeight: font.weight.bold,
          color: color.amber, background: color.amberBg, border: `1px solid ${color.amberBorder}`,
          borderRadius: radius.xs, padding: '0 5px',
        }}>
          UNKNOWN SITE
        </span>
      )}
      <ChevronRight size={13} strokeWidth={1.8} color={color.t3} style={{ flexShrink: 0 }} />
      <span style={{ color: color.t2, flexShrink: 0 }}>{workspace}</span>
    </div>
  )
}
