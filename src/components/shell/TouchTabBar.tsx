import { color, font, radius, space } from '@/design-system/tokens'
import { TOUCH_TAB_BAR_HEIGHT } from '@/app/touchNav'

/**
 * The touch shell's bottom tab bar: the phone counterpart of `IconSidebar`.
 * Generic over the item type so one component serves both the site workspaces
 * and the org pages; icons come from the caller so the workspace icon map
 * stays in `WorkspaceSidebar`.
 */
export function TouchTabBar<T extends string>({
  items, active, label, icon, onSelect, ariaLabel,
}: {
  items: readonly T[]
  active: T
  label: (item: T) => string
  icon: (item: T) => React.ElementType
  onSelect: (item: T) => void
  ariaLabel: string
}) {
  return (
    // Tint only: surface against bg, no border or stripe (ui-design-system skill).
    // data-card-bound: floating cards clear this bar, as they clear the two
    // touch headers. It is the one bar that renders on LiveOps, where the
    // cards are (liveops/barCardPlacement.ts).
    <nav data-touch-tabbar data-card-bound="bottom" aria-label={ariaLabel} style={{
      display: 'flex', flexShrink: 0, minHeight: TOUCH_TAB_BAR_HEIGHT, background: color.surface,
      padding: `${space[1]}px ${space[1]}px calc(${space[2]}px + env(safe-area-inset-bottom, 0px))`,
    }}>
      {items.map((item) => {
        const Icon = icon(item)
        const isActive = item === active
        return (
          <button
            key={item}
            onClick={() => onSelect(item)}
            aria-current={isActive ? 'page' : undefined}
            style={{
              flex: 1, minHeight: 44, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 2,
              background: 'transparent', border: 'none', fontFamily: font.family, cursor: 'pointer',
              color: isActive ? color.accent : color.t2,
            }}
          >
            {/* The one highlight this bar has, and it is a rounded pill.
                The button itself must stay unpainted: the base hover tint
                (kit.css) fills whatever box it is on, and on a square-cornered
                full-cell button that reads as a second, unrounded highlight
                beside this one. kit.css suppresses it for `[data-touch-tabbar]`
                and moves it onto this element instead. */}
            <span data-tab-pill="" style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 48, height: 26, borderRadius: radius.full,
              background: isActive ? color.accentDim : 'transparent',
            }}>
              <Icon size={20} strokeWidth={1.75} />
            </span>
            <span style={{ fontSize: 10, fontWeight: isActive ? font.weight.semibold : font.weight.medium }}>
              {label(item)}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
