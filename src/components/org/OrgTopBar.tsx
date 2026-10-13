import { color, font, layout, space } from '@/design-system/tokens'
import { AlertCenterButton } from '@/components/shell/AlertCenterButton'
import { OperatorProfile } from '@/components/shell/OperatorProfile'
import { OrgNav } from './OrgNav'
import { useTranslation } from 'react-i18next'
import type { OrgPage } from '@/app/routes'

/** Org-level top bar — kept as the original TopBar pattern (logo, top-tab
 * nav, right cluster), just with org pages instead of site workspaces and
 * without the site/robot/view-mode selectors that don't apply here. */
export function OrgTopBar({ active, onSelect }: { active: OrgPage; onSelect: (p: OrgPage) => void }) {
  const { t } = useTranslation()
  return (
    <header style={{
      height: layout.topBarHeight, background: color.surface, borderBottom: `1px solid ${color.border}`,
      display: 'flex', alignItems: 'center', padding: `0 ${space[5]}px`,
      flexShrink: 0, zIndex: 10, gap: space[4],
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 176 }}>
        <img className="rh-logo" src="./rover-mark.png" alt="" style={{ width: 34, height: 34, objectFit: 'contain' }} />
        <div>
          <div style={{ fontWeight: font.weight.bold, fontSize: font.size.xl, color: color.t1, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
            RoverHub
          </div>
          <div style={{ fontSize: font.size.xs, color: color.t3, fontWeight: font.weight.regular }}>
            {t('common.organization')}
          </div>
        </div>
      </div>

      <OrgNav active={active} onSelect={onSelect} />

      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <AlertCenterButton />
        </div>
        <div style={{ width: 1, height: 28, background: color.border }} />
        <OperatorProfile />
      </div>
    </header>
  )
}
