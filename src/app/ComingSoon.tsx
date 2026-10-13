import { useTranslation } from 'react-i18next'
import { color, font, space } from '@/design-system/tokens'
import type { Workspace } from './routes'

/** Placeholder for workspaces not yet built. Present and labeled rather than
 * a missing nav entry — mirrors the R2/Future treatment rule (docs/05-ui-ux.md §18.3). */
export function ComingSoon({ workspace }: { workspace: Workspace }) {
  const { t } = useTranslation()
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      gap: space[2], color: color.t3,
    }}>
      <div style={{ fontSize: font.size['2xl'], fontWeight: font.weight.bold, color: color.t2 }}>
        {t(`nav.workspace.${workspace}`)}
      </div>
      <div style={{ fontSize: font.size.sm, maxWidth: 360, textAlign: 'center' }}>
        {workspace === 'LiveOps' ? '' : t(`liveops.comingSoon.${workspace}`)}
      </div>
      <div style={{ fontSize: font.size.xs, color: color.t3, marginTop: space[2] }}>
        {t('liveops.comingSoon.footer')}
      </div>
    </div>
  )
}
