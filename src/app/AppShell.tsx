import { useEffect, useState } from 'react'
import { NotFound } from './NotFound'
import { OrgShell } from './OrgShell'
import { SiteShell } from './SiteShell'
import { legacyMapsRedirect, legacySystemsRedirect, parseRoute } from './routes'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { useTouchRootAttribute } from '@/lib/useTouchShell'
import { useSessionStore } from '@/store/useSessionStore'

/** The route the address names, after moving an old Missions › Maps link to
 * its place in the Map workspace, or an old Systems link to its robot's tab in
 * Fleet (both 2026-11-26) -- in place, so Back does not return to the old
 * address and a bookmark keeps working. A Systems link that names no robot
 * opens the one the console is showing. */
export function currentRoute() {
  const hash = window.location.hash
  const moved = legacyMapsRedirect(hash)
    ?? legacySystemsRedirect(hash, useSessionStore.getState().selectedRobotId)
  if (moved) window.history.replaceState(window.history.state, '', moved)
  return parseRoute(window.location.hash)
}

/** Top-level dispatcher between the Organization Console and a site's
 * workspaces, based on the nested hash route. */
export function AppShell() {
  const [route, setRoute] = useState(currentRoute)
  // Puts `data-touch` on <html>, which is where the design system's touch
  // control sizing hangs off (design-system/kit.css). Here because it is the
  // one component every route passes through, and because a popover portalled
  // to <body> is outside every wrapper this app renders.
  useTouchRootAttribute()

  useEffect(() => {
    const onHash = () => setRoute(currentRoute())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // For a fault in a shell itself (the rail, the site bar). Workspaces and
  // pages have boundaries of their own inside the shells, so a fault there
  // never reaches this one and the shell stays. main.tsx has the very last
  // one, around sign-in and everything else.
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
