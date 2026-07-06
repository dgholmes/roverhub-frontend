import { useEffect, useState } from 'react'
import { OrgShell } from './OrgShell'
import { SiteShell } from './SiteShell'
import { parseRoute } from './routes'

/** Top-level dispatcher between the Organization Console and a site's
 * workspaces, based on the nested hash route. */
export function AppShell() {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash))

  useEffect(() => {
    const onHash = () => setRoute(parseRoute(window.location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  if (route.kind === 'org') return <OrgShell page={route.page} />
  return <SiteShell siteId={route.siteId} workspace={route.workspace} />
}
