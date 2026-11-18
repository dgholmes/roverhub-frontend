import { useTranslation } from 'react-i18next'
import { useAccountMenu } from '@/lib/auth/accountMenu'
import { useEngineerTools } from '@/org/useCan'

/** The amber "Engineer tools on" chip, shown in the top bar (and the site
 * bar) for as long as an owner or admin has the engineer's tools switched on,
 * so working with extra rights is never easy to forget. Clicking it opens the
 * account menu, where the switch is. Renders nothing otherwise -- with sign-in
 * off too, and against a backend that predates the switch. */
export function EngineerToolsChip() {
  const { t } = useTranslation()
  const on = useEngineerTools()
  const openMenu = useAccountMenu((s) => s.setOpen)
  if (!on) return null
  return (
    <button
      type="button"
      data-testid="engineer-tools-chip"
      className="rh-badge rh-badge--amber rh-badge--lg"
      title={t('auth.engineerTools.chipTitle')}
      onClick={() => openMenu(true)}
      // A badge's tint and dot, without its outline.
      style={{ border: 'none', cursor: 'pointer', fontWeight: 600 }}
    >
      <span className="rh-dot" aria-hidden />
      {t('auth.engineerTools.chip')}
    </button>
  )
}
