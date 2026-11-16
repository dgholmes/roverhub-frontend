import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ScrollText } from 'lucide-react'
import { color, font, space } from '@/design-system/tokens'
import { ICON } from '@/components/kit'
import { hashForSystemsPage, systemsPageFromHash, type SystemsPage } from '@/app/routes'
import { LogsPage } from './LogsPage'

/**
 * Systems workspace (docs/05-ui-ux.md §13). Logs is its only page so far: the
 * robot's own log, live and back 24 hours. The rest of §13 (topology, SDK
 * connection, permissions, safety policy, audit log) is not built, and is not
 * shown as dead tabs.
 *
 * The bare workspace address becomes `.../systems/logs` in place, so a
 * shared link names the page.
 */
export function SystemsWorkspace({ siteId }: { siteId: string }) {
  const { t } = useTranslation()
  const [page, setPage] = useState<SystemsPage>(() => systemsPageFromHash(window.location.hash))

  useEffect(() => {
    const canonical = hashForSystemsPage(siteId, systemsPageFromHash(window.location.hash))
    if (window.location.hash !== canonical) window.history.replaceState(window.history.state, '', canonical)
    const follow = () => setPage(systemsPageFromHash(window.location.hash))
    window.addEventListener('hashchange', follow)
    return () => window.removeEventListener('hashchange', follow)
  }, [siteId])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <nav aria-label={t('systems.pagesAria')} style={{
        height: 44, flexShrink: 0, background: color.surface,
        display: 'flex', alignItems: 'center', padding: `0 ${space[4]}px`, gap: space[2],
      }}>
        <span aria-current="page" style={{
          display: 'inline-flex', alignItems: 'center', gap: space[2],
          fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1,
        }}>
          <ScrollText size={ICON.size} strokeWidth={ICON.stroke} aria-hidden color={color.t2} />
          {t(`systems.pages.${page}`)}
        </span>
      </nav>
      <LogsPage siteId={siteId} />
    </div>
  )
}
