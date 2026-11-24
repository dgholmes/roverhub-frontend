import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import type { RobotState } from '@/types'
import type { Workspace } from './routes'
import { VIEWPORT_CLASS } from './viewport'

/**
 * What the shell around the workspaces does on a handheld: the 68 px rail is
 * not rendered at all, the bottom tab bar takes its place, and the four
 * non-LiveOps workspaces get `TouchSiteBar` instead of `SiteContextStrip`.
 *
 * Vitest runs with `environment: 'node'` -- no jsdom and no component renderer
 * -- so this is `renderToStaticMarkup` with the five workspaces stood in, the
 * pattern of `liveops/touch/TouchLiveOps.test.tsx`. Each workspace reaches
 * MQTT, Leaflet or a store of its own and each has its own tests; what is
 * pinned here is the shell around them.
 */

// -- Stand-ins for the five workspaces -------------------------------------
// LiveOps keeps its fullscreen root and an E-Stop marker inside it, because
// where the E-Stop sits relative to that root is the safety invariant this
// file exists to pin.
vi.mock('@/components/liveops/LiveOpsWorkspace', () => ({
  LiveOpsWorkspace: () => <div data-fullscreen-root=""><i data-estop="" /></div>,
}))
vi.mock('@/components/fleet/FleetWorkspace', () => ({ FleetWorkspace: () => <i data-ws="Fleet" /> }))
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
// of which exists in the `node` environment.
const stores = vi.hoisted(() => ({
  session: {
    setActiveSite: () => {},
    reconcileSelectedRobot: () => {},
    activeSiteId: 'site-north-yard',
    selectedRobotId: null as string | null,
    selectionPending: false,
    role: 'operator',
    sites: [{ id: 'site-north-yard', name: 'North Yard' }],
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
function html({ touch, workspace, owner, robots = [base] }: {
  touch: boolean
  workspace: Workspace
  owner: string | null
  robots?: RobotState[]
}): string {
  env.touch = touch
  env.robots = robots.map((r) => ({ ...r, control_owner: owner }))
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
})
