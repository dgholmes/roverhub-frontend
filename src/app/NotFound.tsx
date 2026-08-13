import { color, font, radius, space } from '@/design-system/tokens'
import { hashForOrgPage } from './routes'

/**
 * Shown for a hash that matches no route.
 *
 * Previously these fell through to the Org Dashboard placeholder without
 * rewriting the hash, so the address bar, the highlighted nav item and the
 * content all disagreed — and a bookmark or a typo failed invisibly, looking
 * exactly like a legitimate visit to an empty page.
 * docs/audit/2026-08-12-ui-ux-audit.md A-33.
 */
export function NotFound({ hash }: { hash: string }) {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', gap: space[3],
      alignItems: 'center', justifyContent: 'center', padding: space[6],
      background: color.bg, fontFamily: font.family,
    }}>
      <div style={{ fontSize: font.size['2xl'], fontWeight: font.weight.semibold, color: color.t1 }}>
        Page not found
      </div>
      <div style={{ fontSize: font.size.lg, color: color.t2, textAlign: 'center', maxWidth: 520 }}>
        Nothing in RoverHub matches{' '}
        <code style={{
          fontFamily: 'monospace', color: color.t1, background: color.card,
          border: `1px solid ${color.border}`, borderRadius: radius.xs, padding: '1px 6px',
        }}>
          {hash || '#/'}
        </code>
        . It may be a stale bookmark, or a site that has since been removed.
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
        Go to Sites
      </a>
    </div>
  )
}
