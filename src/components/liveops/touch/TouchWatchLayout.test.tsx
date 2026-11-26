// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import type { Orientation } from '@/lib/touchShell'

/**
 * The watching body's panes, and the one piece of behaviour that is not
 * geometry (`touchLayout.test.ts` owns the arithmetic).
 *
 * **A tablet in landscape gets three pictures**, the FlightHub-2 arrangement
 * the operator picked: map over the second camera on the left, the main camera
 * big on the right. A phone, and any portrait body, gets two -- a third tile
 * at 390 px leaves each pane about 70 px of height, which is not a picture.
 * This file asserts the rendering reads `camera2 === null` rather than
 * re-deriving that condition, by driving it from the orientation and size the
 * shell passes.
 *
 * **Both camera panes are labelled.** Two near-identical grey frames are
 * indistinguishable until something moves, and mistaking one for the other
 * while watching a robot is the failure the word prevents -- the same reason
 * `DualCamView` labels its panes.
 *
 * **Tapping the tile swaps the facings**, and the invariant that matters is
 * that it is ONE piece of state: after any number of taps the two panes show
 * different cameras, because the tile is always the other facing by
 * construction rather than by a "which pane holds what" model that could drift.
 *
 * A per-file `jsdom` pragma, as `TouchDriveLayout.test.tsx` uses. jsdom lays
 * nothing out, so the body's own size is stubbed -- an unmeasured body draws
 * no panes at all, which is itself asserted below.
 */

// The body's pictures: Leaflet and the WebRTC stack, neither of which survives
// this harness. The camera marker carries its facing, which is the whole
// subject of the swap tests.
// `data-nav-portal` records whether the map was told to draw its tool group
// somewhere else. What that group then looks like is NavGoalLayer's business.
vi.mock('@/components/liveops/map/MapCanvas', () => ({
  MapCanvas: ({ navToolsPortal }: { navToolsPortal?: HTMLElement | null }) => (
    <i data-pane="map" data-nav-portal={navToolsPortal ? '' : undefined} />
  ),
}))
vi.mock('@/components/liveops/hero/CameraFeedLayer', () => ({
  CameraFeedLayer: ({ facing }: { facing?: string }) => <i data-pane="camera" data-facing={facing} />,
}))
vi.mock('@/components/liveops/hero/CaptureRail', () => ({ CaptureRail: () => <i data-pane="capture" /> }))
vi.mock('@/liveops/useSiteMap', () => ({
  useSiteMap: () => ({ map: undefined, floorIndex: 0, onFloorChange: () => {} }),
}))
// A site, so the main camera is remembered under a real key (cameraChoice.ts);
// storage is cleared before every test so one test's swap never leaks into the
// next.
const SITE = 'site-test'
vi.mock('@/store/useSessionStore', () => ({
  useSessionStore: (sel: (s: Record<string, unknown>) => unknown) => sel({ cameraFit: 'contain', activeSiteId: 'site-test' }),
}))

import { remember } from '@/lib/viewMemory'
import { cameraChoiceKey } from '@/liveops/cameraChoice'
import { TouchWatchLayout } from './TouchWatchLayout'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** A tablet landscape body: 1194 x 834 less a 44 px strip and a 72 px dock. */
const TABLET_LANDSCAPE = { width: 1194, height: 718 }
/** The same tablet, turned. */
const TABLET_PORTRAIT = { width: 834, height: 1078 }
/** A phone in landscape: 844 x 390 less its smaller chrome. */
const PHONE_LANDSCAPE = { width: 844, height: 286 }

const BODY = { ...TABLET_LANDSCAPE }

const robot = initialRobots[1]

let container: HTMLDivElement
let root: Root

function layout(orientation: Orientation = 'landscape', big = true, navToolsHost: HTMLElement | null = null) {
  act(() => root.render(
    <TouchWatchLayout
      siteId={robot.site_id} robot={robot} run={null}
      orientation={orientation} big={big} barH={big ? 44 : 40} dockH={big ? 64 : 56}
      navToolsHost={navToolsHost}
    />,
  ))
}

const pane = (which: string) => container.querySelector<HTMLElement>(`[data-touch-pane="${which}"]`)
const facingOf = (which: string) =>
  pane(which)?.querySelector<HTMLElement>('[data-pane="camera"]')?.dataset.facing
const labelOf = (which: string) => pane(which)?.querySelector('span.rh-on-video')?.textContent
const swap = () => container.querySelector<HTMLElement>('[data-touch-pane="camera2"] [data-touch-swap]')

beforeEach(() => {
  localStorage.clear()
  Object.assign(BODY, TABLET_LANDSCAPE)
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
  vi.restoreAllMocks()
})

describe('a tablet in landscape', () => {
  beforeEach(() => layout('landscape', true))

  it('draws three panes: the map and the second camera left, the main camera right', () => {
    for (const which of ['map', 'camera', 'camera2']) {
      expect(pane(which), which).not.toBeNull()
    }
    const map = pane('map')!
    const main = pane('camera')!
    const second = pane('camera2')!

    // The main camera is the big pane, on the right; the other two share the
    // left column, map on top.
    expect(parseInt(main.style.left, 10)).toBeGreaterThan(0)
    expect(parseInt(main.style.width, 10)).toBeGreaterThan(parseInt(map.style.width, 10))
    expect(second.style.left).toBe('0px')
    expect(second.style.width).toBe(map.style.width)
    expect(parseInt(second.style.top, 10)).toBeGreaterThanOrEqual(parseInt(map.style.height, 10))

    // Every pane fills its rect: no inset, no padding, no border.
    for (const el of [map, main, second]) {
      expect(el.style.position).toBe('absolute')
      expect(el.style.padding).toBe('')
      expect(el.style.border).toBe('')
    }
    // And the column is accounted for exactly, seam included.
    expect(parseInt(second.style.top, 10) + parseInt(second.style.height, 10))
      .toBe(parseInt(main.style.height, 10))
  })

  it('shows two different cameras, each labelled', () => {
    expect(facingOf('camera')).toBe('front')
    expect(facingOf('camera2')).toBe('back')
    expect(labelOf('camera')).toBe(i18n.t('liveops.camera.front'))
    expect(labelOf('camera2')).toBe(i18n.t('liveops.camera.rear'))
  })

  it('swaps the facings when the tile is tapped, and never shows one camera twice', () => {
    const tile = swap()!
    expect(tile.getAttribute('aria-label')).toBe(i18n.t('touch.liveops.swapCameraAria'))
    // A real target, not an icon: the button covers its own tile and is at
    // least 48 px however small the tile gets.
    expect(parseInt(tile.style.inset, 10)).toBe(0)
    expect([tile.style.minWidth, tile.style.minHeight]).toEqual(['48px', '48px'])

    act(() => { tile.click() })
    expect(facingOf('camera')).toBe('back')
    expect(facingOf('camera2')).toBe('front')
    expect(labelOf('camera')).toBe(i18n.t('liveops.camera.rear'))
    expect(labelOf('camera2')).toBe(i18n.t('liveops.camera.front'))

    // One piece of state, so a second tap is the way back and the two panes
    // can never agree.
    act(() => { swap()!.click() })
    expect(facingOf('camera')).toBe('front')
    expect(facingOf('camera2')).toBe('back')
  })

  it('the main pane’s own front/rear switch moves the tile with it', () => {
    const toggle = container.querySelector<HTMLElement>(
      `[data-touch-pane="camera"] [aria-label="${i18n.t('liveops.camera.switchToRear')}"]`,
    )
    expect(toggle, 'the camera pane keeps its switch').not.toBeNull()
    act(() => { toggle!.click() })
    expect(facingOf('camera')).toBe('back')
    expect(facingOf('camera2')).toBe('front')
  })
})

describe('the main camera is remembered', () => {
  it("comes back as the robot's remembered camera, the tile showing the other", () => {
    remember(cameraChoiceKey(SITE, robot.robot_id)!, { facing: 'back', mode: 'rgb' })
    layout('landscape', true)
    expect(facingOf('camera')).toBe('back')
    expect(facingOf('camera2')).toBe('front')
  })

  it('a swap survives a remount, as a reload or a layout switch does', () => {
    layout('landscape', true)
    act(() => { swap()!.click() })
    act(() => root.unmount())
    root = createRoot(container)
    layout('landscape', true)
    expect(facingOf('camera')).toBe('back')
  })
})

describe('two panes and no empty tile', () => {
  it('a phone in landscape gets the map and one camera', () => {
    Object.assign(BODY, PHONE_LANDSCAPE)
    layout('landscape', false)
    expect(pane('map')).not.toBeNull()
    expect(pane('camera')).not.toBeNull()
    expect(pane('camera2')).toBeNull()
    expect(container.querySelectorAll('[data-touch-pane]').length).toBe(2)
  })

  it('a tablet in portrait gets the map and one camera', () => {
    Object.assign(BODY, TABLET_PORTRAIT)
    layout('portrait', true)
    expect(pane('camera2')).toBeNull()
    expect(container.querySelectorAll('[data-touch-pane]').length).toBe(2)
  })

  it('a phone in portrait gets the map and one camera', () => {
    Object.assign(BODY, { width: 390, height: 600 })
    layout('portrait', false)
    expect(pane('camera2')).toBeNull()
    expect(container.querySelectorAll('[data-touch-pane]').length).toBe(2)
  })
})

// Before the ResizeObserver's first measurement the body is 0 x 0. Nothing is
// drawn then -- not a third tile, and not a squashed first two.
it('an unmeasured body draws no panes at all', () => {
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight
  layout('landscape', true)
  expect(container.querySelectorAll('[data-touch-pane]').length).toBe(0)
  expect(container.querySelector('[data-touch-body]')).not.toBeNull()
})

describe("the map's tool group in portrait", () => {
  // Measured at 390 x 844: the map pane is about 340 px tall and the group
  // plus its hint lines take 85 off the top -- a quarter of the floorplan,
  // and the quarter nearest the robot. The camera above has room to spare,
  // and an overlay on a video is the ordinary place for controls.
  // The host itself belongs to the shell (TouchLiveOps), which stacks it
  // under the readings band in one column -- the band wraps to two lines on
  // a phone, and a host positioned from a constant landed beneath it. What
  // this layout owes is to pass the host it is given on to the map.
  it('hands the host it is given to the map', () => {
    const host = document.createElement("div")
    layout('portrait', false, host)
    expect(container.querySelector('[data-pane="map"]')!.hasAttribute('data-nav-portal')).toBe(true)
  })

  it('draws the group on the map when there is no host', () => {
    layout('portrait', false)
    expect(container.querySelector('[data-pane="map"]')!.hasAttribute('data-nav-portal')).toBe(false)
  })

  // Landscape keeps it on the map: there the map is a full-height column
  // with room for a 40 px row at its top.
  // Landscape keeps it on the map: there the map is a full-height column
  // with room for a 40 px row at its top, so the shell passes no host.
  it('stays on the map in landscape even when a host is passed', () => {
    layout('landscape', true, document.createElement("div"))
    expect(container.querySelector('[data-pane="map"]')!.hasAttribute('data-nav-portal')).toBe(false)
  })
})
