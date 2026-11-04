import { useTranslation } from 'react-i18next'
import { color, font, radius, space } from '@/design-system/tokens'
import { Button } from '@/components/kit'
import { hashForOrgPage } from './routes'

/** Shown instead of a site's workspaces when the signed-in user has no role
 * at that site. */
export function NoSiteAccess() {
  const { t } = useTranslation()
  return (
    <div style={{ minHeight: '100vh', background: color.bg, fontFamily: font.family, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: space[4] }}>
      <div style={{ maxWidth: 420, background: color.surface, borderRadius: radius.lg, padding: space[6], display: 'grid', gap: space[3] }}>
        <h1 style={{ margin: 0, fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.t1 }}>{t('auth.noSiteTitle')}</h1>
        <p style={{ margin: 0, fontSize: font.size.md, color: color.t2, lineHeight: 1.5 }}>{t('auth.noSiteBody')}</p>
        <Button variant="primary" style={{ justifySelf: 'start' }} onClick={() => { window.location.hash = hashForOrgPage('Sites') }}>
          {t('auth.backToOrg')}
        </Button>
      </div>
    </div>
  )
}
