// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import type { RobotState } from '@/types'
import type { Workspace } from './routes'
import { VIEWPORT_CLASS } from './viewport'

/**
 * What the shell around the workspaces does on a handheld: the 68 px rail is
 * not rendered at all, the bottom tab bar takes its place, and the four
 * non-LiveOps workspaces get `TouchSiteBar` instead of `SiteContextStrip`.
 *
 * Almost everything here is `renderToStaticMarkup` with the five workspaces
 * stood in, the pattern of `liveops/touch/TouchLiveOps.test.tsx`: each
 * workspace reaches MQTT, Leaflet or a store of its own and each has its own
 * tests, and what is pinned here is the shell around them. The one exception
 * is the last test, which mounts for real -- `renderToStaticMarkup` does not
 * run error boundaries at all, it rethrows, so a workspace fault can only be
 * seen through `createRoot`, as `shellBoundary.test.tsx` does it. That is also
 * why this file asks for jsdom.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// -- Stand-ins for the five workspaces -------------------------------------
// LiveOps keeps its fullscreen root and an E-Stop marker inside it, because
// where the E-Stop sits relative to that root is the safety invariant this
// file exists to pin.
vi.mock('@/components/liveops/LiveOpsWorkspace', () => ({
  LiveOpsWorkspace: () => <div data-fullscreen-root=""><i data-estop="" /></div>,
}))
// Fleet doubles as the workspace that can fail, for the boundary test below.
const fleet = vi.hoisted(() => ({ failing: false }))
vi.mock('@/components/fleet/FleetWorkspace', () => ({
  FleetWorkspace: (): React.ReactNode => {
    if (fleet.failing) throw new Error('workspace fault')
    return <i data-ws="Fleet" />
  },
}))
vi.mock('@/components/missions/MissionsWorkspace', () => ({ MissionsWorkspace: () => <i data-ws="Missions" /> }))
vi.mock('@/components/data/DataWorkspace', () => ({ DataWorkspace: () => <i data-ws="Data" /> }))
vi.mock('@/components/systems/SystemsWorkspace', () => ({ SystemsWorkspace: () => <i data-ws="Systems" /> }))

// -- The browser and the stores, as mutable state the helper below sets -----
// `useTouchShell` answers `{ touch: false }` with no DOM, so a test that did
// not mock it would assert the desktop branch and pass for the wrong reason.
const env = vi.hoisted(() => ({ touch: false, robots: [] as unknown[] }))

vi.mock('@/lib/useTouchShell', () => ({
  useTouchShell: () => ({ touch: env.touch, orientation: 'portrait', big: false }),
}))

const SITE = 'site-north-yard'

// The real stores read localStorage and construct the data provider, neither
// of which belongs in a test of the shell's layout.
const stores = vi.hoisted(() => ({
  session: {
    setActiveSite: () => {},
    reconcileSelectedRobot: () => {},
    activeSiteId: 'site-north-yard',
    selectedRobotId: null as string | null,
    selectionPending: false,
    role: 'operator',
    sites: [{ id: 'site-north-yard', name: 'North Yard' }],
    // LiveOps on touch opens immersed (design §6.2); `html()` below sets it
    // per test, and the default here is the un-immersed shell so every other
    // test in this file is about the bar's other reasons to be away.
    liveOpsImmersed: false,
    setLiveOpsImmersed: () => {},
  } as Record<string, unknown>,
}))
vi.mock('@/store/useSessionStore', () => {
  const useSessionStore = (sel: (s: Record<string, unknown>) => unknown) => sel(stores.session)
  useSessionStore.getState = () => stores.session
  return { useSessionStore }
})
vi.mock('@/store/useLiveOpsStore', () => {
  // `events` is the alert centre's, read through the same store by the rail
  // and both site bars.
  const state = () => ({ robots: env.robots, events: [] })
  const useLiveOpsStore = (sel: (s: Record<string, unknown>) => unknown) => sel(state())
  useLiveOpsStore.getState = state
  return { useLiveOpsStore }
})

import { currentOperatorId } from '@/lib/realtime/operator'
import { SiteShell } from './SiteShell'

const base = initialRobots.find((r) => r.site_id === SITE) as RobotState

/** The shell's markup for one browser, workspace and control owner. */
function html({ touch, workspace, owner, robots = [base], immersed = false }: {
  touch: boolean
  workspace: Workspace
  owner: string | null
  robots?: RobotState[]
  immersed?: boolean
}): string {
  env.touch = touch
  env.robots = robots.map((r) => ({ ...r, control_owner: owner }))
  stores.session.liveOpsImmersed = immersed
  return renderToStaticMarkup(<SiteShell siteId={SITE} workspace={workspace} />)
}

/** The markup of the element carrying `marker`, by counting `div` depth from
 * it. Static markup has no self-closing `div`, so the count is exact, and
 * nothing rendered here puts a `<div` inside an attribute value.
 * (A third local copy of the helper in `liveops/touch/TouchLiveOps.test.tsx`:
 * a test file exports nothing, so each one carries its own.) */
function divSubtree(markup: string, marker: string): string {
  const at = markup.indexOf(marker)
  expect(at, `no element carries ${marker}`).toBeGreaterThan(-1)
  const open = markup.lastIndexOf('<div', at)
  let depth = 0
  for (let i = open; i < markup.length; i += 1) {
    if (markup.startsWith('<div', i)) depth += 1
    else if (markup.startsWith('</div>', i)) {
      depth -= 1
      if (depth === 0) return markup.slice(open, i + 6)
    }
  }
  throw new Error(`unclosed element for ${marker}`)
}

describe('the site shell on a handheld', () => {
  it('spends no width on a rail at touch', () => {
    const out = html({ touch: true, workspace: 'Fleet', owner: null })
    expect(out).not.toContain('data-rail')
    expect(out).toContain('data-touch-tabbar')
  })

  it('keeps the 68px rail on a fine pointer', () => {
    const out = html({ touch: false, workspace: 'Fleet', owner: null })
    expect(out).toContain('data-rail')
    expect(out).not.toContain('data-touch-tabbar')
  })

  it('hides the bar while the operator holds control of the shown robot', () => {
    expect(html({ touch: true, workspace: 'LiveOps', owner: currentOperatorId() }))
      .not.toContain('data-touch-tabbar')
  })

  // `driving` is `operatorHoldsControl` and nothing else: a mission holds
  // `control_owner` too, and nobody is steering with the bottom of the screen.
  it('keeps the bar when a mission holds control', () => {
    expect(html({ touch: true, workspace: 'LiveOps', owner: 'mission:run_1' }))
      .toContain('data-touch-tabbar')
  })

  // Design §6.2: LiveOps on touch opens as the live view, and the back chevron
  // in its strip clears the flag to bring the navigation back in place.
  it('hides the bar on LiveOps while the live view is immersed', () => {
    expect(html({ touch: true, workspace: 'LiveOps', owner: null, immersed: true }))
      .not.toContain('data-touch-tabbar')
    expect(html({ touch: true, workspace: 'LiveOps', owner: null, immersed: false }))
      .toContain('data-touch-tabbar')
  })

  // The flag is LiveOps' own. Another workspace is the console, not the live
  // view, and its navigation is never taken away by it.
  it('keeps the bar on the other workspaces whatever the flag says', () => {
    expect(html({ touch: true, workspace: 'Fleet', owner: null, immersed: true }))
      .toContain('data-touch-tabbar')
  })

  // Review Focus 2. `resolveShownRobot` answers `null` for a site with no
  // robots, and `operatorHoldsControl(undefined)` is `false` -- the bar shows.
  it('shows the bar and does not throw when the site has no robot', () => {
    const render = () => html({ touch: true, workspace: 'LiveOps', owner: null, robots: [] })
    expect(render).not.toThrow()
    expect(render()).toContain('data-touch-tabbar')
  })

  // Review Focus 5, the safety invariant: the tab bar is a sibling rendered
  // after the content column, never a wrapper around it, so the E-Stop stays
  // inside the element LiveOps puts fullscreen and the bar does not follow it
  // in there.
  it('leaves the E-Stop inside the fullscreen root, with the bar outside it', () => {
    const out = html({ touch: true, workspace: 'LiveOps', owner: null })
    const root = divSubtree(out, 'data-fullscreen-root')
    expect(root).toContain('data-estop')
    expect(root).not.toContain('data-touch-tabbar')
    expect(out).toContain('data-touch-tabbar')
  })

  it('gives the four other workspaces the touch site bar instead of the context strip', () => {
    const out = html({ touch: true, workspace: 'Data', owner: null })
    expect(out).toContain('data-touch-sitebar')
    expect(out).not.toContain('rh-sitebar')
  })

  it('leaves LiveOps to draw its own strip inside the fullscreen root', () => {
    const out = html({ touch: true, workspace: 'LiveOps', owner: null })
    expect(out).not.toContain('data-touch-sitebar')
    expect(out).not.toContain('rh-sitebar')
  })

  it('still uses dvh, never vh alone', () => {
    expect(html({ touch: true, workspace: 'Fleet', owner: null })).toContain(VIEWPORT_CLASS)
  })

  // The handheld counterpart of `shellBoundary.test.tsx`'s "keeps the
  // workspace navigation": the tab bar is rendered outside every
  // ErrorBoundary, so a workspace that throws shows its fallback and leaves
  // the operator a way back to LiveOps and its E-Stop. With the bar inside the
  // boundary instead, a crashed workspace would strand a phone with no
  // navigation at all -- there is no rail to fall back on.
  it('keeps the tab bar when the workspace throws', () => {
    // The boundary logs the fault it caught, and React logs the error it
    // rethrows in development; neither is this test's output.
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    env.touch = true
    env.robots = [base]
    fleet.failing = true
    try {
      act(() => root.render(<SiteShell siteId={SITE} workspace="Fleet" />))
      expect(host.textContent).toContain(i18n.t('common.errorBoundary.view'))
      expect(host.querySelector('[data-touch-tabbar]')).not.toBeNull()
      expect(host.querySelector('[data-rail]')).toBeNull()
    } finally {
      act(() => root.unmount())
      host.remove()
      fleet.failing = false
      errorLog.mockRestore()
    }
  })
})
