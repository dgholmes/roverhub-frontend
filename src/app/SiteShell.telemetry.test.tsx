// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoreApi, UseBoundStore } from 'zustand'
import '@/i18n'
import { currentOperatorId } from '@/lib/realtime/operator'
import { initialRobots } from '@/mocks/mockRobots'
import type { RobotState } from '@/types'

/**
 * What the site shell subscribes to, measured rather than read.
 *
 * `useLiveOpsStore` replaces its `robots` array on every notify (coalesced to
 * 5 Hz), so a shell that reads the array re-renders five times a second --
 * and since no workspace child is memoised, the whole site subtree goes with
 * it, Blockly's canvas and the Maps page's Leaflet views included. The shell
 * needs one boolean from that store, so it selects one, and zustand then
 * notifies it only when the answer changes.
 *
 * This file stands a real zustand store in for the live one, so a telemetry
 * frame can actually be pushed and the renders counted. The other SiteShell
 * tests use a plain selector mock, which cannot notify at all.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const SITE = 'site-north-yard'
const base = initialRobots.find((r) => r.site_id === SITE) as RobotState

const shell = vi.hoisted(() => ({ touch: false }))
vi.mock('@/lib/useTouchShell', () => ({
  useTouchShell: () => ({ touch: shell.touch, orientation: 'portrait' as const, big: false }),
}))

// The store under test: real zustand, so `setState` notifies subscribers.
const live = vi.hoisted(() => ({ store: null as unknown as UseBoundStore<StoreApi<{ robots: unknown[]; events: unknown[] }>> }))
vi.mock('@/store/useLiveOpsStore', async () => {
  const { create } = await import('zustand')
  live.store = create(() => ({ robots: [] as unknown[], events: [] as unknown[] }))
  return { useLiveOpsStore: live.store }
})

const session = vi.hoisted(() => ({
  state: {
    setActiveSite: () => {}, reconcileSelectedRobot: () => {},
    activeSiteId: 'site-north-yard', selectedRobotId: null as string | null, selectionPending: false,
    role: 'operator', sites: [{ id: 'site-north-yard', name: 'North Yard' }],
  } as Record<string, unknown>,
}))
vi.mock('@/store/useSessionStore', () => {
  const useSessionStore = (sel: (s: Record<string, unknown>) => unknown) => sel(session.state)
  useSessionStore.getState = () => session.state
  return { useSessionStore }
})
vi.mock('@/org/useCan', () => ({ useSiteRole: () => 'operator', useCan: () => true }))

// The chrome around the workspace: each reads stores of its own, and none of
// them is what this file measures.
vi.mock('@/components/shell/WorkspaceSidebar', () => ({
  WorkspaceSidebar: () => <i data-rail="" />, ICONS: new Proxy({}, { get: () => () => null }),
}))
vi.mock('@/components/shell/SiteContextStrip', () => ({ SiteContextStrip: () => null }))
vi.mock('@/components/shell/TouchSiteBar', () => ({ TouchSiteBar: () => null }))
vi.mock('@/components/shell/SiteEmptyNotice', () => ({ SiteEmptyNotice: () => null }))

// The counter: a workspace child, which re-renders exactly when the shell does
// (nothing between them is memoised -- which is the point).
const renders = vi.hoisted(() => ({ n: 0 }))
vi.mock('@/components/fleet/FleetWorkspace', () => ({
  FleetWorkspace: () => { renders.n += 1; return <i data-ws="Fleet" /> },
}))
vi.mock('@/components/liveops/LiveOpsWorkspace', () => ({
  LiveOpsWorkspace: () => { renders.n += 1; return <div data-fullscreen-root="" /> },
}))
vi.mock('@/components/missions/MissionsWorkspace', () => ({ MissionsWorkspace: () => null }))
vi.mock('@/components/data/DataWorkspace', () => ({ DataWorkspace: () => null }))
vi.mock('@/components/systems/SystemsWorkspace', () => ({ SystemsWorkspace: () => null }))

import { SiteShell } from './SiteShell'
import type { Workspace } from './routes'

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>

/** One telemetry frame: the same robots, in a new array, as the store does it. */
function telemetry(owner: string | null = null) {
  act(() => { live.store.setState({ robots: [{ ...base, control_owner: owner }] }) })
}

function mount(workspace: Workspace) {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => root.render(<SiteShell siteId={SITE} workspace={workspace} />))
}

beforeEach(() => {
  shell.touch = false
  renders.n = 0
  live.store.setState({ robots: [{ ...base, control_owner: null }] })
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('what the site shell re-renders for', () => {
  it('does not re-render the workspace on a telemetry frame', () => {
    mount('Fleet')
    expect(renders.n).toBe(1)
    telemetry()
    telemetry()
    telemetry()
    expect(renders.n).toBe(1)
  })

  it('does not re-render it on touch either, while the answer is unchanged', () => {
    shell.touch = true
    mount('Fleet')
    expect(renders.n).toBe(1)
    telemetry('mission:run_1')
    telemetry('someone-else')
    expect(renders.n).toBe(1)
  })

  it('still notices when the operator takes control, and hides the bar', () => {
    shell.touch = true
    mount('LiveOps')
    expect(host.querySelector('[data-touch-tabbar]')).not.toBeNull()
    telemetry(currentOperatorId())
    expect(host.querySelector('[data-touch-tabbar]')).toBeNull()
    telemetry(null)
    expect(host.querySelector('[data-touch-tabbar]')).not.toBeNull()
  })
})
