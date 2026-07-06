import { Building2, ChevronDown } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { color, font, radius, space } from '@/design-system/tokens'
import { useSessionStore } from '@/store/useSessionStore'

/** Scopes visible data to a site (docs/05-ui-ux.md §2.2). Only one site exists
 * in the current mock fleet, so the menu lists it as the sole, selected entry —
 * present and functional in shape, not a placeholder. Real multi-site listing
 * arrives with the future Org Console (docs/01-prd.md §6.4, OD-8). */
export function SiteSelector() {
  const sites = useSessionStore((s) => s.sites)
  const activeSiteId = useSessionStore((s) => s.activeSiteId)
  const setActiveSite = useSessionStore((s) => s.setActiveSite)
  const activeSite = sites.find((s) => s.id === activeSiteId) ?? sites[0]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          style={{
            display: 'flex', alignItems: 'center', gap: space[2],
            padding: '6px 10px', borderRadius: radius.md,
            background: color.card, border: `1px solid ${color.border}`,
            color: color.t1, fontFamily: font.family, cursor: 'pointer',
          }}
        >
          <Building2 size={13} color={color.t2} strokeWidth={1.8} />
          <span style={{ fontSize: font.size.sm, fontWeight: font.weight.medium }}>{activeSite.name}</span>
          <ChevronDown size={11} color={color.t3} strokeWidth={2} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        style={{ background: color.elevated, border: `1px solid ${color.border}`, color: color.t1 }}
      >
        {sites.map((site) => (
          <DropdownMenuItem
            key={site.id}
            onSelect={() => setActiveSite(site.id)}
            style={{ fontSize: font.size.sm }}
          >
            {site.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
