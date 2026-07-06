import { color, radius, space } from '@/design-system/tokens'

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
    <nav style={{
      width: 64, flexShrink: 0, background: color.surface, borderRight: `1px solid ${color.border}`,
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
                width: 48, height: 48, borderRadius: radius.md,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                background: item.active ? color.accentDim : 'transparent',
                border: item.active ? `1px solid ${color.accentBorder}` : '1px solid transparent',
                color: item.disabled ? color.t4 : item.active ? color.accent : color.t2,
                cursor: item.disabled ? 'not-allowed' : 'pointer', position: 'relative',
              }}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span style={{ fontSize: 8, fontWeight: 600, letterSpacing: '0.02em' }}>{item.label}</span>
              {item.badge && (
                <span style={{
                  position: 'absolute', top: 2, right: 6, width: 14, height: 14, borderRadius: radius.full,
                  background: color.accent, color: color.accentText, fontSize: 8, fontWeight: 700,
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
