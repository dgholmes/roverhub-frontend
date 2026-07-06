import { Building2, ChevronRight } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { useSessionStore } from '@/store/useSessionStore'
import { hashForSiteWorkspace } from '@/app/routes'

/**
 * The one org-level page that's real, not a placeholder — lists every site
 * in the organization and lets the operator enter one, landing in that
 * site's LiveOps workspace (docs/01-prd.md §6.4). Site creation/archival is
 * future scope (OD-8) — for now this reads from the same `sites[]` the
 * Phase A groundwork already introduced in useSessionStore.
 */
export function SitesPage() {
  const sites = useSessionStore((s) => s.sites)

  return (
    <div style={{ flex: 1, overflow: 'auto', padding: space[5] }}>
      <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.t1, marginBottom: space[4] }}>
        Sites
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: space[3] }}>
        {sites.map((site) => (
          <div key={site.id} style={{
            background: color.surface, border: `1px solid ${color.border}`, borderRadius: radius.md, padding: space[4],
            display: 'flex', flexDirection: 'column', gap: space[3],
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: space[2] }}>
              <Building2 size={18} color={color.t2} strokeWidth={1.8} />
              <span style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.t1 }}>{site.name}</span>
            </div>
            {site.timezone && <div style={{ fontSize: font.size.sm, color: color.t3 }}>{site.timezone}</div>}
            <a
              href={hashForSiteWorkspace(site.id, 'LiveOps')}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                marginTop: space[2], padding: '8px 0', borderRadius: radius.sm,
                background: color.accent, color: color.accentText, fontWeight: font.weight.bold,
                fontSize: font.size.sm, textDecoration: 'none',
              }}
            >
              Enter Site <ChevronRight size={14} />
            </a>
          </div>
        ))}
      </div>
    </div>
  )
}
