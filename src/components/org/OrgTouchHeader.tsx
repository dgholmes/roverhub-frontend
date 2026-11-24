import { useTranslation } from 'react-i18next'
import { color, font, space } from '@/design-system/tokens'
import { TOUCH_SITE_BAR_HEIGHT } from '@/app/touchNav'
import { AlertCenterButton } from '@/components/shell/AlertCenterButton'
import { OperatorProfile } from '@/components/shell/OperatorProfile'

/**
 * The touch counterpart of `OrgTopBar`: the RoverHub mark, the alert centre and
 * the operator profile. The five org pages are the bottom tab bar's, so no nav
 * renders here.
 */
export function OrgTouchHeader() {
  const { t } = useTranslation()
  return (
    <header data-org-touch-header data-card-bound="top" style={{
      height: TOUCH_SITE_BAR_HEIGHT, flexShrink: 0, display: 'flex', alignItems: 'center',
      gap: space[2], padding: `0 ${space[2]}px 0 ${space[3]}px`, background: color.surface,
      borderBottom: `1px solid ${color.border}`, fontFamily: font.family,
    }}>
      <img className="rh-logo" src="./rover-mark.png" alt="" style={{ width: 28, height: 28, objectFit: 'contain', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <span style={{ fontWeight: font.weight.bold, fontSize: font.size.lg, color: color.t1, letterSpacing: '-0.01em', lineHeight: 1.2 }}>
          RoverHub
        </span>
        <span style={{ fontSize: font.size.xs, color: color.t3 }}>{t('common.organization')}</span>
      </div>
      <AlertCenterButton />
      <OperatorProfile compact />
    </header>
  )
}
