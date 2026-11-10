import { useEffect, useState } from 'react'
import { NotFound } from './NotFound'
import { OrgShell } from './OrgShell'
import { SiteShell } from './SiteShell'
import { parseRoute } from './routes'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'

/** Top-level dispatcher between the Organization Console and a site's
 * workspaces, based on the nested hash route. */
export function AppShell() {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))

  useEffect(() => {
    const onHash = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // The last line of defence, for a fault in a shell itself (the rail, the
  // site bar). Workspaces and pages have boundaries of their own inside the
  // shells, so a fault there never reaches this one and the shell stays.
  return (
    <ErrorBoundary
      area="console shell" variant="page" fallbackStyle={{ minHeight: '100vh' }}
      // Any navigation is a fresh try.
      resetKeys={[JSON.stringify(route)]}
    >
      {route.kind === 'notFound' ? <NotFound hash={route.hash} />
        : route.kind === 'org' ? <OrgShell page={route.page} />
        : <SiteShell siteId={route.siteId} workspace={route.workspace} />}
    </ErrorBoundary>
  )
}
