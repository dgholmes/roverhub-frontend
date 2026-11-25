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

import { PHONE_ROBOT_MAX_WIDTH, TOUCH_TARGET_CSS, TouchTopStrip, touchStripHeight } from './TouchTopStrip'

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

function strip(r: RobotState = robot(), onBack?: () => void, big = true) {
  act(() => root.render(<TouchTopStrip robot={r} big={big} onBack={onBack} />))
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
  it('pins which robot at one end and the status at the other', () => {
    strip()
    // Left: which robot. No scroll may take it away -- an operator who cannot
    // see which robot they are commanding is the failure this zone exists for.
    expect(zone('pinned').contains(item('robot')), 'robot is not pinned').toBe(true)
    // Right: what it is doing, how good the link is, and the alert centre.
    for (const name of ['state', 'link', 'alerts']) {
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
    expect(readingOrder[0]).toBe('battery')
    expect(readingOrder).not.toContain('link')
    // Neither pinned zone can scroll away or be squeezed out.
    for (const name of ['pinned', 'status'] as const) {
      expect(zone(name).style.flexShrink, `${name} can shrink`).toBe('0')
      expect(zone(name).style.overflowX, `${name} scrolls`).toBe('')
    }
    expect(zone('readings').style.overflowX).toBe('auto')
    // The strip itself no longer scrolls: it is the frame now.
    expect(stripRoot().style.overflowX).toBe('')
  })

  // The status zone is last in the DOM as well as on screen: it is read after
  // the readings it qualifies, and a reversed order would put the alert
  // centre before the battery it may be complaining about.
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
  // Arithmetic, not taste. Measured at 390 px with all three in the status
  // zone: the two pinned zones came to 311 px of the row and the readings
  // got NINE -- not one reading on screen, which is the exact failure that
  // pinning the identity was supposed to end. The bell is one tap away on a
  // phone, through the back chevron: the site bar carries it beside Settings.
  it('keeps the alert bell on a tablet and drops it on a phone', () => {
    strip(robot(), undefined, true)
    expect(container.querySelector('[data-strip-item="alerts"]'), 'no bell on a tablet').not.toBeNull()
    strip(robot(), undefined, false)
    expect(container.querySelector('[data-strip-item="alerts"]'), 'the bell is still on a phone').toBeNull()
    // What a phone must never lose is the battery of the robot it is
    // commanding, and the room for it comes from the name and the gaps.
    expect(item('battery')).not.toBeNull()
    expect(item('robot').style.maxWidth).toBe(`${PHONE_ROBOT_MAX_WIDTH}px`)
    expect(stripRoot().style.gap).not.toBe('')
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
