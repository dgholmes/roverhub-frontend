import { color, font, layout, space } from '@/design-system/tokens'
import { AlertCenterButton } from '@/components/shell/AlertCenterButton'
import { OperatorProfile } from '@/components/shell/OperatorProfile'

/** Org-level top bar — deliberately lighter than the site-level TopBar: no
 * site/robot/view-mode selectors, since those are site-scoped concepts that
 * don't apply above the site level. */
export function OrgTopBar() {
  return (
    <header style={{
      height: layout.topBarHeight, background: color.surface, borderBottom: `1px solid ${color.border}`,
      display: 'flex', alignItems: 'center', padding: `0 ${space[5]}px`,
      flexShrink: 0, zIndex: 10, gap: space[4],
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 176 }}>
        <img src="/rover.png" alt="RoverHub" style={{ width: 34, height: 34, objectFit: 'contain' }} />
        <div>
          <div style={{ fontWeight: font.weight.bold, fontSize: font.size.xl, color: color.t1, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
            RoverHub
          </div>
          <div style={{ fontSize: font.size.xs, color: color.t3, fontWeight: font.weight.regular }}>
            Organization
          </div>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexShrink: 0 }}>
        <AlertCenterButton />
        <div style={{ width: 1, height: 28, background: color.border }} />
        <OperatorProfile />
      </div>
    </header>
  )
}
