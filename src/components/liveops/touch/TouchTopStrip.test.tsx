// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from 'i18next'
import '@/i18n'
import { BATTERY_UNKNOWN_LABEL } from '@/liveops/batteryDisplay'
import { initialRobots } from '@/mocks/mockRobots'
import type { RobotState } from '@/types'

/**
 * The two-zone strip (design §6.1).
 *
 * What this file pins is the thing the operator complained about: the robot's
 * identity scrolled away with the readings, so they could not tell which robot
 * they were commanding. The fix is structural -- a pinned zone and a scrolling
 * zone -- and structure is what a renderer test can hold still.
 *
 * A per-file `jsdom` pragma, as `TouchDriveLayer.test.tsx` uses, because the
 * back chevron is a click and `renderToStaticMarkup` cannot be clicked.
 *
 * The three composite chips are stood in: each reads a store of its own and
 * each has its own test, and what is asserted here is *which zone they are
 * in*, never what they draw.
 */
vi.mock('@/components/shell/RobotSelector', () => ({ RobotSelector: () => <i data-chip="robot" /> }))
vi.mock('@/components/shell/ConnectionStatus', () => ({
  ConnectionStatus: ({ variant }: { variant?: string }) => <i data-chip="link" data-variant={variant} />,
}))
vi.mock('@/components/common/StatePill', () => ({ StatePill: () => <i data-chip="state" /> }))

import {
  PHONE_READINGS_MIN_WIDTH, PHONE_ROBOT_MAX_WIDTH, PHONE_ROBOT_MIN_WIDTH,
  TOUCH_TARGET_CSS, TouchTopStrip, touchStripHeight,
} from './TouchTopStrip'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const base = initialRobots[1]
const robot = (over: Partial<RobotState> = {}): RobotState => ({ ...base, ...over })

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function strip(
  r: RobotState = robot(), onBack?: () => void, big = true,
  orientation: 'landscape' | 'portrait' = 'landscape',
) {
  act(() => root.render(<TouchTopStrip robot={r} big={big} orientation={orientation} onBack={onBack} />))
}

const stripRoot = (): HTMLElement => container.querySelector<HTMLElement>('[data-touch-strip]')!

const zone = (name: 'pinned' | 'readings' | 'status'): HTMLElement => {
  const el = container.querySelector<HTMLElement>(`[data-strip-zone="${name}"]`)
  if (!el) throw new Error(`no ${name} zone`)
  return el
}

const item = (name: string): HTMLElement => {
  const el = container.querySelector<HTMLElement>(`[data-strip-item="${name}"]`)
  if (!el) throw new Error(`the strip has no ${name}`)
  return el
}

describe('the strip is three zones', () => {
  // Portrait has no room for them: measured at 390 px, the identity, six
  // readings and the two status icons left the readings 48 px of the row.
  // `TouchLiveOps` draws them over the view instead, and this is the half
  // of that contract the strip owns.
  it('drops the readings in portrait and keeps both pinned ends', () => {
    strip(robot(), undefined, false, 'portrait')
    expect(container.querySelector('[data-strip-zone="readings"]'), 'readings still in the strip').toBeNull()
    expect(container.querySelector('[data-strip-item="battery"]'), 'a reading is still in the strip').toBeNull()
    // What stays is which robot, what it is doing, and the two icons.
    for (const name of ['robot', 'link', 'alerts']) {
      expect(container.querySelector(`[data-strip-item="${name}"]`), `${name} is missing`).not.toBeNull()
    }
  })

  it('pins which robot at one end and the console at the other', () => {
    strip()
    // Left: which robot, and what it is doing. Read together they are one
    // phrase -- this robot, standing -- so they are one zone (operator,
    // 2026-11-25). No scroll may take either away: an operator who cannot
    // see which robot they are commanding is the failure this zone exists
    // for.
    expect(zone('pinned').contains(item('robot')), 'robot is not pinned').toBe(true)
    // Right: the console's own state, not the robot's -- the link and the
    // alert centre.
    for (const name of ['link', 'alerts']) {
      expect(zone('status').contains(item(name)), `${name} is not in the status zone`).toBe(true)
    }
    // Middle: the readings, and nothing else.
    for (const name of ['battery', 'speed', 'heading', 'gait', 'legs', 'position']) {
      expect(zone('readings').contains(item(name)), `${name} is not in the scrolling zone`).toBe(true)
    }
    // Battery leads the scroll: on a phone only the first reading or two are
    // on screen at rest, and that must be the battery of the robot being
    // commanded.
    const readingOrder = [...zone('readings').querySelectorAll('[data-strip-item]')]
      .map((el) => el.getAttribute('data-strip-item'))
    // The state leads and the battery follows it: on a squeezed row those
    // two are what must be on screen (operator, 2026-11-25).
    expect(readingOrder[0]).toBe('state')
    expect(readingOrder[1]).toBe('battery')
    expect(readingOrder).not.toContain('link')
    // Neither pinned zone scrolls away, and at tablet size neither is
    // squeezed either (a phone gives way in the name only -- below).
    for (const name of ['pinned', 'status'] as const) {
      expect(zone(name).style.flexShrink, `${name} can shrink`).toBe('0')
      expect(zone(name).style.overflowX, `${name} scrolls`).toBe('')
    }
    expect(zone('readings').style.overflowX).toBe('auto')
    // The strip itself no longer scrolls: it is the frame now.
    expect(stripRoot().style.overflowX).toBe('')
  })

  // The status zone is last in the DOM as well as on screen: it is read after
  // the readings, and a reversed order would put the alert centre before the
  // battery it may be complaining about.
  it('orders the zones left, readings, status', () => {
    strip()
    const order = [...stripRoot().querySelectorAll('[data-strip-zone]')]
      .map((el) => el.getAttribute('data-strip-zone'))
    expect(order).toEqual(['pinned', 'readings', 'status'])
  })

  // The link is a signal meter here, not the desktop's worded chip: at 375 px
  // the word plus a dot plus a chevron costs about 110 px the readings need.
  // What the two variants draw is ConnectionStatus.test.tsx's business.
  it('asks the link for its icon variant', () => {
    strip()
    expect(item('link').querySelector('[data-chip="link"]')?.getAttribute('data-variant')).toBe('icon')
  })

  it('is one row that never wraps, at 44px on a tablet and 40px on a phone', () => {
    strip(robot(), undefined, true)
    expect(stripRoot().style.height).toBe('44px')
    expect(stripRoot().style.flexWrap).toBe('nowrap')
    expect(zone('readings').style.flexWrap).toBe('nowrap')
    strip(robot(), undefined, false)
    expect(stripRoot().style.height).toBe('40px')
    expect(touchStripHeight(false)).toBe(40)
  })

  // TouchDriveLayout reads these to hide the readings its own strip covers.
  // Renaming one breaks the drive layout silently, so the whole set is pinned.
  // A 375 px row cannot hold everything at its natural width: chevron 40,
  // name up to 104, state pill up to 128 ("Manual Control"), link 28, bell
  // 28, battery 42 and 50 of chrome come to 420. So WHICH of them gives way
  // is a decision, and it is this one -- the robot's name ellipsizes, down
  // to a floor that still shows the number. jsdom does not lay out, so what
  // is asserted here is that the room to give is where the design put it.
  it('makes the robot name the only thing that may be squeezed on a phone', () => {
    strip(robot(), undefined, false)
    const name = item('robot')
    expect(name.style.maxWidth).toBe(`${PHONE_ROBOT_MAX_WIDTH}px`)
    expect(name.style.minWidth).toBe(`${PHONE_ROBOT_MIN_WIDTH}px`)
    expect(name.style.flexShrink, 'the name cannot give').toBe('1')
    // Everything else holds its width -- including the state word, which is
    // never truncated.
    for (const other of ['state', 'link', 'alerts']) {
      expect(item(other).style.flexShrink, `${other} can be squeezed`).toBe('0')
    }
    // And the readings keep room for one reading, whatever else is asked
    // for: hiding the battery of the robot being commanded is the failure
    // this strip has now been reworked twice to end.
    expect(zone('readings').style.minWidth).toBe(`${PHONE_READINGS_MIN_WIDTH}px`)
  })

  // A tablet never runs out, so nothing there is capped or squeezable.
  it('caps and squeezes nothing on a tablet', () => {
    strip(robot(), undefined, true)
    expect(item('robot').style.maxWidth).toBe('')
    expect(item('robot').style.flexShrink).toBe('0')
    expect(zone('pinned').style.flexShrink).toBe('0')
    // The readings keep their floor at every width: the zone only exists in
    // landscape now, and a phone in landscape can still run out.
    expect(zone('readings').style.minWidth).toBe(`${PHONE_READINGS_MIN_WIDTH}px`)
  })

  it('keeps the alert bell at every width', () => {
    for (const big of [true, false]) {
      strip(robot(), undefined, big)
      expect(
        container.querySelector('[data-strip-item="alerts"]'),
        `no bell at ${big ? 'tablet' : 'phone'} size`,
      ).not.toBeNull()
    }
  })

  it('keeps every data-strip-item name', () => {
    strip()
    for (const name of ['robot', 'state', 'battery', 'speed', 'heading', 'gait', 'legs', 'position', 'link', 'alerts']) {
      expect(container.querySelector(`[data-strip-item="${name}"]`), `the strip has no ${name}`).not.toBeNull()
    }
  })
})

describe('the back chevron', () => {
  it('is drawn only when onBack is given, and calls it', () => {
    strip()
    expect(container.querySelector(`[aria-label="${i18n.t('touch.liveops.navAria')}"]`)).toBeNull()

    const onBack = vi.fn()
    strip(robot(), onBack)
    const back = container.querySelector<HTMLButtonElement>(
      `button[aria-label="${i18n.t('touch.liveops.navAria')}"]`,
    )
    expect(back, 'no back chevron').not.toBeNull()
    // It belongs to the pinned zone: a chevron that scrolls away is no exit.
    expect(zone('pinned').contains(back!)).toBe(true)
    // Square, and the strip's own height. It was as wide as the touch target
    // and as tall as the row, which the base hover tint then painted as a
    // grey rectangle across the corner of the strip.
    expect(back!.style.width).toBe(back!.style.height)
    expect(back!.style.width).toBe('44px')
    // Nothing fills it at rest, and kit.css suppresses the hover tint.
    expect(back!.style.background).toBe('transparent')
    expect(TOUCH_TARGET_CSS).toContain('[data-strip-back]:hover')
    act(() => { back!.click() })
    expect(onBack).toHaveBeenCalledTimes(1)
  })
})

describe('the readings', () => {
  it('gait and legs keep their word value', () => {
    strip(robot({ gait: 'flying_trot', leg_config: 'normal' }))
    expect(item('gait').textContent).toContain('flying trot')
    expect(item('legs').textContent).toContain(i18n.t('liveops.telemetry.legsNormal'))
  })

  // The captions are what pushed the robot's name off screen. The icon
  // carries the reading now; the value carries itself.
  it('battery, speed, heading and position have an icon and no caps caption', () => {
    strip()
    for (const name of ['battery', 'speed', 'heading', 'position']) {
      expect(item(name).innerHTML, `${name} still draws a caption`).not.toContain('uppercase')
      expect(item(name).querySelector('svg'), `${name} has no icon`).not.toBeNull()
    }
  })

  it('every reading still carries its translated name', () => {
    strip()
    const named: [string, string][] = [
      ['battery', i18n.t('fleet.overview.battery')],
      ['speed', i18n.t('fleet.overview.speed')],
      ['heading', i18n.t('fleet.overview.heading')],
      ['gait', i18n.t('liveops.telemetry.gait')],
      ['legs', i18n.t('liveops.telemetry.legs')],
      ['position', i18n.t('liveops.telemetry.position')],
    ]
    for (const [name, expected] of named) {
      const label = item(name).querySelector('.sr-only')
      expect(label, `${name} has no accessible name`).not.toBeNull()
      expect(label!.textContent).toBe(expected)
    }
    // The icons themselves say nothing aloud.
    for (const svg of Array.from(container.querySelectorAll('svg'))) {
      expect(svg.getAttribute('aria-hidden')).toBe('true')
    }
  })

  // A gRPC-only host reports `null` forever -- gRPC carries no battery field
  // at all -- and `null < 30` is `false`, so a bare comparison would paint a
  // dead battery healthy.
  it('a null battery renders unknown, not 0%', () => {
    strip(robot({ battery: { ...base.battery, percent: null } }))
    expect(item('battery').textContent).toContain(BATTERY_UNKNOWN_LABEL)
    expect(item('battery').textContent).not.toContain('0%')
  })

  it('position keeps its quality badge', () => {
    strip(robot({ position: { ...base.position, freshness: 'stale' } }))
    expect(item('position').textContent).toContain('m')
    expect(item('position').children.length).toBeGreaterThan(2)
  })
})

describe('the touch target', () => {
  // The selector looked like a tall box because a `min-height` on every button
  // in the strip made the visible box fill a 44 px row. The target is an
  // overlay now; the dock's own rule must not move with it.
  it('is an overlay in the strip and a min-height in the dock', () => {
    expect(TOUCH_TARGET_CSS).toContain('.rh-touchdeck button{min-height:var(--rh-touch-target,44px)}')
    expect(TOUCH_TARGET_CSS).not.toContain('.rh-touchstrip button{min-height')
    expect(TOUCH_TARGET_CSS).toContain('.rh-touchstrip button::after')
  })

  it('is at least 44px, and 48 on a tablet, whatever the strip height', () => {
    strip(robot(), undefined, false)
    expect(stripRoot().style.getPropertyValue('--rh-touch-target')).toBe('44px')
    strip(robot(), undefined, true)
    expect(stripRoot().style.getPropertyValue('--rh-touch-target')).toBe('48px')
  })
})
