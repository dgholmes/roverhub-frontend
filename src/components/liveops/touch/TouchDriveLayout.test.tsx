// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import { currentOperatorId } from '@/lib/realtime/operator'
import { DRIVE_INPUT_POLL_MS } from '@/lib/teleop'
import { initialRobots } from '@/mocks/mockRobots'
import { useDriveSpeedStore } from '@/store/useDriveSpeedStore'
import type { Orientation } from '@/lib/touchShell'
import type { RobotState } from '@/types'
import { stickTravel } from './Joystick'
import { DRIVE_INSET_HEIGHT, DRIVE_INSET_MARGIN, DRIVE_INSET_WIDTH } from './touchLayout'

/**
 * The driving body, and the two things about it that are not geometry
 * (`touchLayout.test.ts` owns that).
 *
 * **The corner E-Stop.** It exists because both thumbs are on the sticks while
 * driving, so it is moved out of the dock and into a corner a palm will not
 * find. Two invariants, neither negotiable: it is inside the element that goes
 * fullscreen, in every state, and it is **never** gated by control ownership.
 * The second is the one a refactor breaks silently -- drawing the stop control
 * inside the drive surface would read as tidy and would take it away at the one
 * moment an operator reaches for it, when a mission or another operator has
 * just taken control out from under their thumbs.
 *
 * **Orientation change mid-drive** (plan Review Focus 5). Rotating the tablet
 * recomputes the layout and remounts the sticks, and a remount must COMMAND a
 * stop rather than merely stop publishing -- otherwise the robot keeps the last
 * setpoint until the bridge's 2 s watchdog notices. Two paths make it real and
 * both run on unmount: `useDriveLoop`'s cleanup and each `Joystick`'s release.
 * Note the complement, which matters just as much: `useTouchShell` keeps its
 * object identity when nothing changed, so the `resize` storm a rotation
 * animation fires must NOT remount anything.
 *
 * A per-file `jsdom` pragma, as `TouchDriveLayer.test.tsx` uses: real
 * `Joystick`s, the real `useDriveLoop`, real fake timers, `driveRobot` spied at
 * the store seam. jsdom measures everything as zero, so both the sticks' travel
 * and the body's own size are stubbed -- a stick with no travel reads every
 * touch as centred, which would make the drive assertions pass for the wrong
 * reason, and an unmeasured body draws no panes at all.
 */

// ── Stand-ins ───────────────────────────────────────────────────────────────
// The E-Stop is a marker: what this file asserts about it is WHERE it is, never
// what it does (`estopHold.test.ts` owns the 800 ms ring and the timeout).
vi.mock('@/components/liveops/command/EStopButton', () => ({
  // `data-fill` records the one prop this file cares about: without it the
  // component keeps the desktop bar's inline 148 x 48 and overflows the
  // corner box. EStopButton.refusal.test.tsx asserts what `fill` then does.
  EStopButton: ({ fill }: { fill?: boolean }) => <i data-estop="" data-fill={fill ? '' : undefined} />,
}))
// The body's two pictures: Leaflet and the WebRTC stack, neither of which
// survives this harness. Markers are enough -- which pane holds which picture
// is exactly what the swap test needs.
vi.mock('@/components/liveops/map/MapCanvas', () => ({ MapCanvas: () => <i data-pane="map" /> }))
vi.mock('@/components/liveops/hero/CameraFeedLayer', () => ({ CameraFeedLayer: () => <i data-pane="camera" /> }))
vi.mock('@/components/liveops/hero/CaptureRail', () => ({ CaptureRail: () => <i data-pane="capture" /> }))
vi.mock('@/liveops/useSiteMap', () => ({
  useSiteMap: () => ({ map: undefined, floorIndex: 0, onFloorChange: () => {} }),
}))

const live = vi.hoisted(() => {
  const drives: number[][] = []
  const commands: { type: string }[] = []
  const actions = {
    driveRobot: (_id: string, vx: number, vy: number, vyaw: number, ratio?: number) => {
      drives.push([vx, vy, vyaw, ratio ?? NaN])
      return true
    },
    lookRobot: () => true,
    dispatchCommand: (_id: string, type: string) => { commands.push({ type }) },
    activeCommands: [] as unknown[],
    // LiveOpsWorkspace's own reads, for the one test that renders it whole.
    init: () => {}, teardown: () => {}, missions: {}, events: [], linkPhase: 'connected',
  }
  return { drives, commands, actions }
})
vi.mock('@/store/useLiveOpsStore', () => ({
  useLiveOpsStore: (select: (s: typeof live.actions) => unknown) => select(live.actions),
}))
vi.mock('@/store/useSessionStore', () => ({
  useSessionStore: (sel: (s: Record<string, unknown>) => unknown) =>
    sel({ selectedRobotId: null, selectionPending: false, viewMode: 'stacked', cameraFit: 'contain' }),
}))

// ── LiveOpsWorkspace's surroundings, for the fullscreen-root test ───────────
// Forced onto the touch shell; which shell gets chosen is `touchShell.test.ts`.
const shell = vi.hoisted(() => ({
  owner: null as string | null,
  orientation: 'landscape' as 'landscape' | 'portrait',
  big: true,
}))
vi.mock('@/lib/useTouchShell', () => ({
  useTouchShell: () => ({ touch: true, orientation: shell.orientation, big: shell.big }),
}))
vi.mock('@/org/useSiteRobots', async () => {
  const { initialRobots: robots } = await import('@/mocks/mockRobots')
  return { useSiteRobots: () => [{ ...robots[1], control_owner: shell.owner }] }
})
vi.mock('@/liveops/useRobotRun', () => ({ useRobotRun: () => ({ view: null, dismiss: () => {} }) }))
vi.mock('@/liveops/useFullscreenToggle', () => ({
  useFullscreenToggle: () => ({ ref: { current: null }, isFullscreen: false, toggle: () => {} }),
}))
vi.mock('@/components/shell/RobotSelector', () => ({ RobotSelector: () => <i data-chip="robot" /> }))
vi.mock('@/components/shell/ConnectionStatus', () => ({ ConnectionStatus: () => <i data-chip="link" /> }))
vi.mock('@/components/common/StatePill', () => ({ StatePill: () => <i data-chip="state" /> }))
vi.mock('@/lib/auth/useAccount', () => ({ useOperatorName: () => 'operator-dev' }))
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
import { TouchDriveLayout } from './TouchDriveLayout'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** The body the stubs below report, mutable so a portrait test can hand the
 * layout a portrait-shaped body. Defaults to a tablet landscape: 1194 x 834
 * less a 44 px strip and a 72 px dock. */
const BODY = { width: 1194, height: 718 }
/** 834 x 1194 less the same chrome. */
const PORTRAIT_BODY = { width: 834, height: 1078 }

/** A 120 px pad at the viewport origin, as `TouchDriveLayer.test.tsx` uses. */
const PAD = 120
const CENTRE = PAD / 2
const TRAVEL = stickTravel(PAD)

const base = initialRobots[1]
const robotOf = (owner: string | null): RobotState => ({ ...base, robot_id: 'rover-pi', control_owner: owner })

let container: HTMLDivElement
let root: Root

function layout(robot: RobotState, orientation: Orientation = 'landscape', big = true) {
  act(() => root.render(
    <TouchDriveLayout
      siteId={base.site_id} robot={robot} run={null}
      orientation={orientation} big={big} barH={big ? 44 : 40} dockH={big ? 72 : 64}
    />,
  ))
}

/**
 * The whole shell, not just the body — which is where the stop control lives.
 *
 * It is rendered by `TouchLiveOps` outside every `ErrorBoundary`, because the
 * dock gives up its own while driving: if the corner one sat inside the body's
 * boundary, a crash in the drive layout would leave no stop at all. So the
 * invariant is a property of the shell and has to be asserted on the shell.
 */
function renderShell(owner: string | null, big = true, orientation: Orientation = 'landscape') {
  shell.owner = owner
  shell.big = big
  shell.orientation = orientation
  act(() => root.render(<LiveOpsWorkspace siteId={base.site_id} />))
}

/** The camera's label and front/rear switch, as one positioned row. */
const cameraControls = (): HTMLElement => {
  const el = container.querySelector<HTMLElement>('[data-camera-controls]')
  if (!el) throw new Error('no camera controls rendered')
  return el
}

const stick = (which: 'move' | 'turn'): HTMLElement => {
  const el = container.querySelector<HTMLElement>(`[data-touch-stick="${which}"] [role="group"]`)
  if (!el) throw new Error(`no ${which} stick rendered`)
  return el
}

function pointer(el: HTMLElement, type: string, dx = 0, dy = 0, pointerId = 1) {
  const e = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: CENTRE + dx, clientY: CENTRE + dy })
  Object.defineProperty(e, 'pointerId', { value: pointerId })
  act(() => { el.dispatchEvent(e) })
}

const poll = (ms = DRIVE_INPUT_POLL_MS) => act(() => { vi.advanceTimersByTime(ms) })
const lastDrive = () => live.drives[live.drives.length - 1]

/** `prefers-reduced-motion`, as the component reads it. jsdom's own
 * `matchMedia` answers `false` to everything, which is the motion case. */
function setReducedMotion(reduce: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => {}, removeEventListener: () => {},
    addListener: () => {}, removeListener: () => {},
    dispatchEvent: () => false,
  }))
}

/** The markup of the element carrying `marker`, by counting `div` depth from
 * it -- the same reader `TouchLiveOps.test.tsx` uses. */
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

beforeEach(() => {
  vi.useFakeTimers()
  live.drives.length = 0
  live.commands.length = 0
  shell.owner = null
  useDriveSpeedStore.setState({ speeds: {} })
  setReducedMotion(false)
  BODY.width = 1194
  BODY.height = 718
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, right: PAD, bottom: PAD, width: PAD, height: PAD, x: 0, y: 0,
    toJSON: () => ({}),
  } as DOMRect)
  // The body measures itself through clientWidth/clientHeight, and jsdom lays
  // nothing out. Without this the body is 0 x 0 and draws no panes at all.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => BODY.width })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => BODY.height })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight
  vi.unstubAllGlobals()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the corner E-Stop', () => {
  // The safety invariant, in the state with the least chrome left to hold it:
  // while driving, the dock's key set shrinks and both thumbs are busy.
  // LiveOpsWorkspace owns the element that goes fullscreen; everything the
  // touch shell draws, driving included, has to be inside it.
  it('is inside [data-fullscreen-root]', () => {
    shell.owner = currentOperatorId()
    const html = renderToStaticMarkup(<LiveOpsWorkspace siteId={base.site_id} />)
    expect(html).toContain('data-touch-dock')            // the touch branch was taken
    expect(html).toContain('data-touch-estop="corner"')  // and it is driving
    const fullscreenRoot = divSubtree(html, 'data-fullscreen-root')
    expect(fullscreenRoot).toContain('data-touch-estop="corner"')
    expect(divSubtree(fullscreenRoot, 'data-touch-estop="corner"')).toContain('data-estop')
  })

  // The one that a tidy refactor breaks in silence. The drive SURFACE is gated
  // on `operatorHoldsControl` and must be -- the stop control never is.
  it('is not gated by control ownership', () => {
    for (const owner of [null, 'mission:run-7', 'nav:goal-3', 'someone-else']) {
      renderShell(owner)
      // The drive SURFACE is gated on `operatorHoldsControl` and must be.
      expect(container.querySelector('[data-touch-drive]'), `${owner}: sticks`).toBeNull()
      // The stop never is. Not driving, it is the dock's -- a different
      // element, the same invariant.
      expect(container.querySelectorAll('[data-estop]').length, `${owner}: stop`).toBe(1)
      expect(container.querySelector('[data-touch-estop="corner"]'), `${owner}: corner`).toBeNull()
    }
  })

  // The complement, and the reason the dock may give its own up: driving, the
  // corner control is there instead. Never two on screen, never none.
  it('is exactly one control in both modes, and in the corner while driving', () => {
    renderShell(currentOperatorId())
    expect(container.querySelectorAll('[data-estop]').length).toBe(1)
    expect(container.querySelector('[data-touch-estop="corner"] [data-estop]')).not.toBeNull()
    expect(container.querySelector('[data-touch-drive]')).not.toBeNull()
  })

  // Before the ResizeObserver's first measurement the body is 0 x 0 and draws
  // no panes. A stop control that waits on a measurement is a stop control
  // missing from the first frame.
  it('renders before the body has been measured', () => {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight
    renderShell(currentOperatorId())
    expect(container.querySelector('[data-touch-pane]')).toBeNull()
    expect(container.querySelector('[data-touch-estop="corner"] [data-estop]')).not.toBeNull()
  })

  it('is 96x60 on a tablet and 72x44 on a phone', () => {
    renderShell(currentOperatorId(), true)
    const big = container.querySelector<HTMLElement>('[data-touch-estop="corner"]')!
    expect([big.style.width, big.style.height]).toEqual(['96px', '60px'])
    renderShell(currentOperatorId(), false)
    const small = container.querySelector<HTMLElement>('[data-touch-estop="corner"]')!
    expect([small.style.width, small.style.height]).toEqual(['72px', '44px'])
  })
})

describe('the landscape inset', () => {
  beforeEach(() => layout(robotOf(currentOperatorId()), 'landscape'))

  it('gives the camera the body and puts the map in the corner', () => {
    const full = container.querySelector<HTMLElement>('[data-touch-pane="camera"]')!
    expect(full.style.width).toBe(`${BODY.width}px`)
    expect(full.style.height).toBe(`${BODY.height}px`)

    const inset = container.querySelector<HTMLElement>('[data-touch-inset]')!
    expect(inset.style.left).toBe(`${DRIVE_INSET_MARGIN}px`)
    expect(inset.style.top).toBe(`${DRIVE_INSET_MARGIN}px`)
    expect(inset.style.width).toBe(`${DRIVE_INSET_WIDTH}px`)
    expect(inset.style.height).toBe(`${DRIVE_INSET_HEIGHT}px`)
    expect(inset.querySelector('[data-pane="map"]')).not.toBeNull()
  })

  // §7.2.3's own mitigation for collapsing the map on Take control: pausing a
  // mission is also a Take control, and the map is one tap from full size.
  it('swaps the map back to full size when tapped', () => {
    const swap = container.querySelector<HTMLElement>('[data-touch-inset] [data-touch-swap]')!
    act(() => { swap.click() })
    expect(container.querySelector('[data-touch-inset] [data-pane="camera"]')).not.toBeNull()
    const full = container.querySelector<HTMLElement>('[data-touch-pane="map"]')!
    expect(full.style.width).toBe(`${BODY.width}px`)
  })
})

describe('the inset animation', () => {
  it('animates with transform only, over 220ms', () => {
    setReducedMotion(false)
    layout(robotOf(currentOperatorId()), 'landscape')
    const inset = container.querySelector<HTMLElement>('[data-touch-inset]')!
    expect(inset.dataset.animate).toBe('')
    // Whatever moves, the pane's own box does not: a width/height animation
    // would resize Leaflet 60 times a second.
    expect(inset.style.width).toBe(`${DRIVE_INSET_WIDTH}px`)
    expect(inset.style.height).toBe(`${DRIVE_INSET_HEIGHT}px`)
  })

  it('prefers-reduced-motion renders the inset at its destination with no transition', () => {
    setReducedMotion(true)
    layout(robotOf(currentOperatorId()), 'landscape')
    const inset = container.querySelector<HTMLElement>('[data-touch-inset]')!
    expect(inset.dataset.animate).toBeUndefined()
    // At its destination, not on its way to it.
    expect(inset.style.left).toBe(`${DRIVE_INSET_MARGIN}px`)
    expect(inset.style.width).toBe(`${DRIVE_INSET_WIDTH}px`)
    expect(inset.style.transform === '' || inset.style.transform === 'none').toBe(true)
  })
})

describe('portrait driving keeps both views', () => {
  it('pins the feed to the top and gives the map the remainder', () => {
    BODY.width = PORTRAIT_BODY.width
    BODY.height = PORTRAIT_BODY.height
    layout(robotOf(currentOperatorId()), 'portrait')

    // Nothing is an inset here: both pictures are full width, so there is
    // nothing to promote and no swap to offer.
    expect(container.querySelector('[data-touch-inset]')).toBeNull()

    const camera = container.querySelector<HTMLElement>('[data-touch-pane="camera"]')!
    const map = container.querySelector<HTMLElement>('[data-touch-pane="map"]')!
    expect(camera.style.top).toBe('0px')
    expect(camera.style.width).toBe(`${PORTRAIT_BODY.width}px`)
    // 4:3 at its native aspect, never letterboxed into half a body.
    expect(PORTRAIT_BODY.width / parseInt(camera.style.height, 10)).toBeCloseTo(4 / 3, 2)
    // And the map takes everything underneath -- portrait keeps BOTH views.
    expect(parseInt(map.style.top, 10)).toBeGreaterThan(parseInt(camera.style.height, 10))
    expect(parseInt(map.style.height, 10)).toBeGreaterThan(0)
    expect(parseInt(map.style.top, 10) + parseInt(map.style.height, 10)).toBe(PORTRAIT_BODY.height)
  })
})

// Plan Review Focus 5.
describe('an orientation change mid-drive', () => {
  it('remounts the sticks and commands a stop', () => {
    layout(robotOf(currentOperatorId()), 'landscape')
    const before = stick('move')
    pointer(before, 'pointerdown')
    pointer(before, 'pointermove', 0, -TRAVEL)
    poll()
    expect(lastDrive()).toEqual([0.64, 0, 0, 60])
    const sent = live.drives.length

    // The tablet is rotated. The layout recomputes and the drive surface is
    // rebuilt under the operator's thumbs.
    layout(robotOf(currentOperatorId()), 'portrait')

    // A remount, not a re-render: this is what runs `useDriveLoop`'s cleanup
    // and each Joystick's release.
    expect(stick('move')).not.toBe(before)
    // And the stop is COMMANDED, not merely implied by silence.
    expect(lastDrive()).toEqual([0, 0, 0, 60])
    // Nothing the old sticks were holding survives the rotation.
    poll(2000)
    for (const d of live.drives.slice(sent)) expect([d[0], d[1], d[2]]).toEqual([0, 0, 0])
  })

  it('carries the chosen speed % into the stop, as every DRIVE does', () => {
    act(() => useDriveSpeedStore.getState().setTier('rover-pi', 'slow'))
    layout(robotOf(currentOperatorId()), 'landscape')
    pointer(stick('move'), 'pointerdown')
    pointer(stick('move'), 'pointermove', 0, -TRAVEL)
    poll()
    layout(robotOf(currentOperatorId()), 'portrait')
    expect(lastDrive()).toEqual([0, 0, 0, 30])
  })

  // The complement, and the reason `useTouchShell` keeps its object identity
  // when nothing changed: a rotation animation fires a storm of `resize`
  // events, and remounting the sticks on each would stop the robot repeatedly
  // in the middle of a drive the operator never interrupted.
  it('a re-render that changes no axis remounts nothing and stops nothing', () => {
    layout(robotOf(currentOperatorId()), 'landscape')
    const before = stick('move')
    pointer(before, 'pointerdown')
    pointer(before, 'pointermove', 0, -TRAVEL)
    poll()
    const sent = live.drives.length

    layout(robotOf(currentOperatorId()), 'landscape')

    expect(stick('move')).toBe(before)
    expect(live.drives.length).toBe(sent)
    poll()
    expect(lastDrive()).toEqual([0.64, 0, 0, 60])
  })
})

describe('the corner stop fits its corner', () => {
  // It rendered 148 px wide inside a 96 px box and had its label clipped off
  // the right edge of the screen. The cause is worth keeping written down:
  // the size came from a stylesheet rule in this layout, and `EStopButton`
  // sets its box in an INLINE style, which wins. The fix is that component's
  // own `fill` prop, so what this asserts is that the prop is passed.
  it('asks the stop to take the box rather than its own size', () => {
    // The shell, not the layout: the corner stop is rendered by TouchLiveOps
    // outside every boundary (see the note at the top of this file).
    renderShell(currentOperatorId())
    const estop = container.querySelector('[data-touch-estop="corner"] [data-estop]')
    expect(estop, 'no corner stop').not.toBeNull()
    expect(estop!.hasAttribute('data-fill'), 'the corner stop was not asked to fill its box').toBe(true)
  })
})

describe("the camera's own controls", () => {
  // Both were separately absolutely positioned at `bottom: 8, left: 8`: on
  // top of each other, and underneath the left thumb stick. The label read
  // through the stick's ring and the switch could not be tapped at all.
  it('are one row, not two things in the same corner', () => {
    layout(robotOf(currentOperatorId()))
    const row = cameraControls()
    expect(row.querySelector('button'), 'no facing switch in the row').not.toBeNull()
    expect(row.textContent?.trim(), 'no camera name in the row').not.toBe('')
  })

  // While driving in landscape every corner is spoken for: the map inset
  // top-left, the stop top-right, a stick in each bottom corner. So the row
  // goes down the left edge, clear of the inset above it.
  it('sit under the map inset in landscape, not in a corner', () => {
    layout(robotOf(currentOperatorId()))
    const row = cameraControls()
    expect(row.style.left).toBe(`${DRIVE_INSET_MARGIN}px`)
    expect(row.style.bottom, 'the row is still anchored to the bottom').toBe('')
    const top = Number.parseInt(row.style.top, 10)
    expect(top).toBeGreaterThanOrEqual(DRIVE_INSET_MARGIN + DRIVE_INSET_HEIGHT)
  })

  // Portrait keeps the bottom-left corner: the sticks are over the map there,
  // below the camera pane, so nothing of the camera's is under a thumb.
  it('keep the bottom-left corner in portrait', () => {
    layout(robotOf(currentOperatorId()), 'portrait')
    const row = cameraControls()
    expect(row.style.bottom).not.toBe('')
    expect(row.style.top).toBe('')
  })
})
