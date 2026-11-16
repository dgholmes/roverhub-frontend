import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Radar, ScrollText } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { ICON } from '@/components/kit'
import { hashForSystemsPage, systemsPageFromHash, SYSTEMS_PAGES, type SystemsPage } from '@/app/routes'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { LogsPage } from './LogsPage'
import { SensorsPage } from './SensorsPage'

const PAGE_ICON: Record<SystemsPage, React.ElementType> = { logs: ScrollText, sensors: Radar }

/**
 * Systems workspace (docs/05-ui-ux.md §13). Two pages so far: Logs, the
 * robot's own log, live and back 24 hours; and Sensors, where the lidar sits
 * on each robot (schema 0.0.23). The rest of §13 (topology, SDK connection,
 * permissions, safety policy, audit log) is not built, and is not shown as
 * dead tabs.
 *
 * The bare workspace address becomes `.../systems/logs` in place, so a
 * shared link names the page.
 */
export function SystemsWorkspace({ siteId }: { siteId: string }) {
  const { t } = useTranslation()
  const [page, setPage] = useState<SystemsPage>(() => systemsPageFromHash(window.location.hash))
  // The live feed, as every other workspace starts it: the robots' links stay
  // current, and the bell hears "the lidar seems to have moved" here too.
  const init = useLiveOpsStore((s) => s.init)
  const teardown = useLiveOpsStore((s) => s.teardown)
  useEffect(() => {
    init()
    return () => teardown()
  }, [init, teardown])

  useEffect(() => {
    const canonical = hashForSystemsPage(siteId, systemsPageFromHash(window.location.hash))
    if (window.location.hash !== canonical) window.history.replaceState(window.history.state, '', canonical)
    const follow = () => setPage(systemsPageFromHash(window.location.hash))
    follow()
    window.addEventListener('hashchange', follow)
    return () => window.removeEventListener('hashchange', follow)
  }, [siteId])

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <nav aria-label={t('systems.pagesAria')} style={{
        height: 44, flexShrink: 0, background: color.surface,
        display: 'flex', alignItems: 'center', padding: `0 ${space[4]}px`, gap: space[1],
      }}>
        {SYSTEMS_PAGES.map((p) => {
          const active = p === page
          const Icon = PAGE_ICON[p]
          return (
            <a
              key={p} href={hashForSystemsPage(siteId, p)} aria-current={active ? 'page' : undefined}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: space[2], padding: '6px 14px', borderRadius: radius.md,
                background: active ? color.selected : 'transparent', color: active ? color.t1 : color.t2,
                fontSize: font.size.md, fontWeight: active ? font.weight.semibold : font.weight.regular,
                fontFamily: font.family, textDecoration: 'none',
              }}
            >
              <Icon size={ICON.size} strokeWidth={ICON.stroke} aria-hidden color={active ? color.t1 : color.t2} />
              {t(`systems.pages.${p}`)}
            </a>
          )
        })}
      </nav>
      {page === 'sensors' ? <SensorsPage siteId={siteId} /> : <LogsPage siteId={siteId} />}
    </div>
  )
}
