import { color, font, radius, space } from '@/design-system/tokens'

export interface IconSidebarItem {
  key: string
  label: string
  icon: React.ElementType
  active: boolean
  onClick: () => void
  disabled?: boolean
  badge?: string
}

/**
 * Generic vertical icon rail — shared by the site-level workspace nav
 * (LiveOps/Fleet/Missions/Data/Systems) and the org-level page nav
 * (Dashboard/Sites/Team/Devices/Settings), so both levels read as one
 * consistent navigation pattern.
 */
export function IconSidebar({
  items, topSlot, bottomSlot,
}: {
  items: IconSidebarItem[]
  topSlot?: React.ReactNode
  bottomSlot?: React.ReactNode
}) {
  return (
    // data-card-bound: floating cards keep their gap off this rail
    // (liveops/barCardPlacement.ts).
    <nav data-card-bound="left" style={{
      width: 68, flexShrink: 0, background: color.surface,
      display: 'flex', flexDirection: 'column', alignItems: 'center', padding: `${space[3]}px 0`, gap: space[2],
    }}>
      {topSlot}
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[1], width: '100%', alignItems: 'center' }}>
        {items.map((item) => {
          const Icon = item.icon
          return (
            <button
              key={item.key}
              onClick={item.onClick}
              disabled={item.disabled}
              title={item.label}
              aria-label={item.label}
              aria-current={item.active ? 'page' : undefined}
              style={{
                width: 56, height: 52, borderRadius: radius.md,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                // Tint only: no border, no stripe (ui-design-system skill).
                background: item.active ? color.accentDim : 'transparent',
                border: 'none', fontFamily: font.family,
                color: item.disabled ? color.t4 : item.active ? color.accent : color.t2,
                cursor: item.disabled ? 'not-allowed' : 'pointer', position: 'relative',
              }}
            >
              <Icon size={20} strokeWidth={1.75} />
              <span style={{ fontSize: font.size.xs, fontWeight: item.active ? font.weight.semibold : font.weight.medium }}>{item.label}</span>
              {item.badge && (
                <span style={{
                  position: 'absolute', top: 4, right: 8, minWidth: 16, height: 16, padding: '0 4px', borderRadius: radius.full,
                  background: color.red, color: '#ffffff', fontSize: font.size['2xs'], fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {item.badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
      <div style={{ marginTop: 'auto' }}>{bottomSlot}</div>
    </nav>
  )
}
