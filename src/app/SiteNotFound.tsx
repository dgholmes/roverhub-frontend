import { color, font, radius, space } from '@/design-system/tokens'
import { hashForOrgPage } from './routes'

/**
 * Shown when the route names a site the session does not know about.
 *
 * Distinct from `NotFound`: the URL is *shaped* correctly and the workspace
 * exists — it is the site that does not. Saying that plainly is the point,
 * because the alternative behaviours are both misleading: rendering a
 * populated workspace (what the app did before scoping) presents a neighbouring
 * site's robots as this site's, and rendering an empty one reads as "this site
 * has no robots yet". docs/audit/2026-08-12-ui-ux-audit.md A-34.
 */
export function SiteNotFound({ siteId }: { siteId: string }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', gap: space[3],
      alignItems: 'center', justifyContent: 'center', padding: space[6],
      background: color.bg, fontFamily: font.family,
    }}>
      <div style={{ fontSize: font.size['2xl'], fontWeight: font.weight.semibold, color: color.t1 }}>
        Site not found
      </div>
      <div style={{ fontSize: font.size.lg, color: color.t2, textAlign: 'center', maxWidth: 520 }}>
        No site in this organization has the id{' '}
        <code style={{
          fontFamily: 'monospace', color: color.t1, background: color.card,
          border: `1px solid ${color.border}`, borderRadius: radius.xs, padding: '1px 6px',
        }}>
          {siteId}
        </code>
        . Nothing is shown here rather than another site's robots.
      </div>
      <a
        href={hashForOrgPage('Sites')}
        style={{
          marginTop: space[2], padding: `${space[2]}px ${space[4]}px`,
          background: color.accentDim, border: `1px solid ${color.accentBorder}`,
          borderRadius: radius.sm, color: color.accent, textDecoration: 'none',
          fontSize: font.size.lg, fontWeight: font.weight.semibold,
        }}
      >
        Choose a site
      </a>
    </div>
  )
}
