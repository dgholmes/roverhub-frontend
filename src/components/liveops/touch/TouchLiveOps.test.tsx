import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '@/i18n'
import { color } from '@/design-system/tokens'
import { BATTERY_UNKNOWN_LABEL } from '@/liveops/batteryDisplay'
import { DECK_KINDS } from '@/liveops/commandDeck'
import { initialRobots } from '@/mocks/mockRobots'
import type { RobotState } from '@/types'

/**
 * The touch shell's scaffold: the strip, the dock, and where the shell mounts.
 *
 * Vitest runs with `environment: 'node'` -- no jsdom and no component
 * renderer -- so everything here is `renderToStaticMarkup` with the leaves
 * stood in, the pattern of `map/MapCanvas.test.tsx` and `hero/HeroInset.test.tsx`.
 * What is pinned is placement and layout, not the leaves' own behaviour: each
 * of those has its own test already.
 */

// ── Stand-ins ───────────────────────────────────────────────────────────────
// The E-Stop is a marker rather than the real button because what this file
// asserts about it is *where it is*, never what it does -- estopHold.test.ts
// owns the behaviour.
vi.mock('@/components/liveops/command/EStopButton', () => ({
  EStopButton: () => <i data-estop="" />,
}))
vi.mock('@/components/liveops/command/ControlToggleButton', () => ({
  ControlToggleButton: () => <i data-ctl="control" />,
}))
vi.mock('@/components/liveops/command/PostureButtons', () => ({
  PostureButtons: () => <i data-ctl="posture" />,
}))
vi.mock('@/components/liveops/command/ObstacleAvoidanceToggle', () => ({
  ObstacleAvoidanceToggle: () => <i data-ctl="avoidance" />,
}))
vi.mock('@/components/liveops/command/LedButton', () => ({
  LedButton: () => <i data-ctl="led" />,
}))
vi.mock('@/components/liveops/command/SpeakButton', () => ({
  SpeakButton: () => <i data-ctl="speak" />,
}))
// The strip's three composite chips: each reads a store of its own and each
// has its own test. Stood in so the `flex-wrap` assertion below is about the
// strip's layout and not about what a chip does inside itself.
vi.mock('@/components/shell/RobotSelector', () => ({ RobotSelector: () => <i data-chip="robot" /> }))
vi.mock('@/components/shell/ConnectionStatus', () => ({ ConnectionStatus: () => <i data-chip="link" /> }))
vi.mock('@/components/common/StatePill', () => ({ StatePill: () => <i data-chip="state" /> }))
vi.mock('@/lib/auth/useAccount', () => ({ useOperatorName: () => 'operator-dev' }))

// The two stores, as selector functions over a fixed state. The real ones read
// localStorage and construct the data provider, neither of which exists in the
// `node` environment.
const stores = vi.hoisted(() => ({
  liveops: {
    init: () => {}, teardown: () => {}, missions: {}, events: [], linkPhase: 'connected',
    dispatchCommand: () => {}, activeCommands: [],
  } as Record<string, unknown>,
  session: { selectedRobotId: null, selectionPending: false, viewMode: 'stacked' } as Record<string, unknown>,
}))
vi.mock('@/store/useLiveOpsStore', () => ({
  useLiveOpsStore: (sel: (s: Record<string, unknown>) => unknown) => sel(stores.liveops),
}))
vi.mock('@/store/useSessionStore', () => ({
  useSessionStore: (sel: (s: Record<string, unknown>) => unknown) => sel(stores.session),
}))

// ── LiveOpsWorkspace's surroundings, for the one test that renders it ───────
// Forced onto the touch shell: the pointer test needs a browser, and the point
// of the test is the branch, not how the branch is chosen (touchShell.test.ts).
vi.mock('@/lib/useTouchShell', () => ({
  useTouchShell: () => ({ touch: true, orientation: 'landscape', big: true }),
}))
vi.mock('@/org/useSiteRobots', async () => {
  const { initialRobots: robots } = await import('@/mocks/mockRobots')
  return { useSiteRobots: () => [robots[1]] }
})
vi.mock('@/liveops/useRobotRun', () => ({ useRobotRun: () => ({ view: null, dismiss: () => {} }) }))
vi.mock('@/liveops/useFullscreenToggle', () => ({
  useFullscreenToggle: () => ({ ref: { current: null }, isFullscreen: false, toggle: () => {} }),
}))
// The desktop branch's parts. None is rendered on touch; they are stood in so
// importing LiveOpsWorkspace does not pull Leaflet and the camera stack into a
// `node` process.
vi.mock('@/components/liveops/hero/StackedView', () => ({ StackedView: () => null }))
vi.mock('@/components/liveops/hero/HeroView', () => ({ HeroView: () => null }))
vi.mock('@/components/liveops/hero/SplitView', () => ({ SplitView: () => null }))
vi.mock('@/components/liveops/hero/DualCamView', () => ({ DualCamView: () => null }))
vi.mock('@/components/liveops/hero/MapFirstView', () => ({ MapFirstView: () => null }))
vi.mock('@/components/liveops/hero/PatrolGridView', () => ({ PatrolGridView: () => null }))
vi.mock('@/components/liveops/rail/LeftRail', () => ({ LeftRail: () => <i data-rail="" /> }))
vi.mock('@/components/liveops/mission/EventLogPanel', () => ({ EventLogPanel: () => null }))
vi.mock('@/components/liveops/mission/CurrentTaskBar', () => ({ CurrentTaskBar: () => <i data-cmdbar="" /> }))
vi.mock('@/components/shell/SiteContextStrip', () => ({ SiteContextStrip: () => <i data-sitebar="" /> }))
vi.mock('@/components/survey/SurveyLiveOps', () => ({
  SurveyBanner: () => null,
  useSurveyMenu: () => ({ entry: null, dialog: null }),
}))

import { LiveOpsWorkspace } from '../LiveOpsWorkspace'
import { TouchDock } from './TouchDock'
import { TouchLiveOps } from './TouchLiveOps'
import { TouchTopStrip } from './TouchTopStrip'

const base = initialRobots[1]
const robot = (over: Partial<RobotState> = {}): RobotState => ({ ...base, ...over })

const strip = (r: RobotState, big = true) =>
  renderToStaticMarkup(<TouchTopStrip robot={r} big={big} />)

const shell = (immersive?: boolean) =>
  renderToStaticMarkup(
    <TouchLiveOps siteId={base.site_id} robot={robot()} run={null} immersive={immersive} />,
  )

const workspace = () => renderToStaticMarkup(<LiveOpsWorkspace siteId={base.site_id} />)

/** One strip reading's own markup, from its marker to the next reading's. */
function stripItem(html: string, name: string): string {
  const at = html.indexOf(`data-strip-item="${name}"`)
  expect(at, `the strip has no ${name}`).toBeGreaterThan(-1)
  const next = html.indexOf('data-strip-item="', at + 1)
  return html.slice(at, next === -1 ? html.length : next)
}

/** The markup of the element carrying `marker`, by counting `div` depth from
 * it. Static markup has no self-closing `div`, so the count is exact, and
 * nothing rendered here puts a `<div` inside an attribute value. */
function divSubtree(html: string, marker: string): string {
  const at = html.indexOf(marker)
  expect(at, `no element carries ${marker}`).toBeGreaterThan(-1)
  const open = html.lastIndexOf('<div', at)
  let depth = 0
  for (let i = open; i < html.length; i += 1) {
    if (html.startsWith('<div', i)) depth += 1
    else if (html.startsWith('</div>', i)) {
      depth -= 1
      if (depth === 0) return html.slice(open, i + 6)
    }
  }
  throw new Error(`unclosed element for ${marker}`)
}

describe('the touch shell scaffold', () => {
  // The safety invariant, in the shell with the least chrome to lose it
  // behind: wherever the E-Stop is drawn, it is inside the element that goes
  // fullscreen. LiveOpsWorkspace owns that element and the touch shell mounts
  // *inside* it -- mounting beside it would take the stop control off the
  // screen in fullscreen, which is audit A-02 over again.
  it('the E-Stop renders inside [data-fullscreen-root]', () => {
    const html = workspace()
    expect(html).toContain('data-touch-dock')          // the touch branch was taken
    expect(html).not.toContain('data-cmdbar')          // and not the desktop one
    expect(divSubtree(html, 'data-fullscreen-root')).toContain('data-estop')
  })

  it('the touch shell replaces the site bar, the view switch and the rail', () => {
    const html = workspace()
    expect(html).not.toContain('data-sitebar')
    expect(html).not.toContain('data-rail')
    expect(html).toContain('data-touch-strip')
  })

  it('immersive mode keeps the dock and the E-Stop mounted', () => {
    // The chrome that collapses is the shell's own strip...
    expect(shell(false)).toContain('data-touch-strip')
    const immersive = shell(true)
    expect(immersive).not.toContain('data-touch-strip')
    // ...and never the dock or the stop control.
    expect(immersive).toContain('data-touch-dock')
    expect(immersive).toContain('data-estop')
  })

  // Review Focus 4. A gRPC-only host reports `null` forever -- gRPC carries no
  // battery field at all -- and `null < 30` is `false` in JavaScript, so a bare
  // comparison paints a dead battery as healthy.
  it('a null battery renders unknown, not 0% and not a green chip', () => {
    const html = strip(robot({ battery: { ...base.battery, percent: null } }))
    const battery = stripItem(html, 'battery')
    expect(battery).toContain(BATTERY_UNKNOWN_LABEL)
    expect(battery).not.toContain('0%')
    expect(battery).not.toContain(color.green)   // never reads as healthy
    expect(battery).toContain(color.t3)          // muted: a deployment fact, not an emergency
  })

  it('a known battery still renders its percentage, and a low one reads low', () => {
    expect(stripItem(strip(robot({ battery: { ...base.battery, percent: 77.88 } })), 'battery'))
      .toContain('78%')
    expect(stripItem(strip(robot({ battery: { ...base.battery, percent: 9 } })), 'battery'))
      .toContain(color.red)
  })

  // The body height is the scarce resource on a handheld: a strip that wraps
  // to two rows takes 44 px off the map and the camera for a reading nobody
  // asked to be taller.
  it('the top strip is one row that scrolls, never two rows', () => {
    const html = strip(robot())
    expect(html).toContain('flex-wrap:nowrap')
    expect(html).toContain('overflow-x:auto')
    expect(html).not.toContain('flex-wrap:wrap')
  })

  it('the top strip is 44px on a tablet and 40px on a phone', () => {
    expect(strip(robot(), true)).toContain('height:44px')
    expect(strip(robot(), false)).toContain('height:40px')
  })

  it('every reading the design asks the strip for is present', () => {
    const html = strip(robot())
    for (const item of ['robot', 'battery', 'state', 'speed', 'heading', 'gait', 'legs', 'position', 'link']) {
      expect(html, `the strip has no ${item}`).toContain(`data-strip-item="${item}"`)
    }
  })

  it('the dock is 72px on a tablet and 64px on a phone, with the E-Stop at its end', () => {
    const dock = (big: boolean) => renderToStaticMarkup(
      <TouchDock robot={robot()} run={null} big={big} immersive={false} onToggleImmersive={() => {}} />,
    )
    expect(dock(true)).toContain('height:72px')
    expect(dock(false)).toContain('height:64px')
    // Anchored last, as in the desktop bar: it never shrinks and never scrolls.
    const html = dock(true)
    expect(html.indexOf('data-estop')).toBeGreaterThan(html.indexOf('data-touch-deck'))
  })

  // The same anti-drift guard commandDeck.test.ts applies to the desktop bar,
  // pointed at the other shell: a kind with no renderer here is a control the
  // operator has at the desk and not in their hands (design anti-goal #2).
  it('the dock draws every deck kind', () => {
    const src = readFileSync(new URL('./TouchDock.tsx', import.meta.url), 'utf8')
    const start = src.indexOf('deck-controls:begin')
    const end = src.indexOf('deck-controls:end')
    expect(start, 'TouchDock.tsx must mark its deck-controls region').toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const handled = [...src.slice(start, end).matchAll(/case '([A-Za-z]+)':/g)].map((m) => m[1])
    expect([...new Set(handled)].sort()).toEqual([...DECK_KINDS].sort())
  })
})
