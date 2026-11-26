// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import i18n from 'i18next'
import '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import type { RobotState } from '@/types'
import { useSessionStore } from '@/store/useSessionStore'
import { ConnectionStatus } from './ConnectionStatus'

/**
 * The connection chip, and the one thing about it that is not cosmetic: its
 * panel must not be a child of the control.
 *
 * It was, and that worked everywhere the trigger sat in a box that could
 * overflow. The touch strip is not such a box -- it is one non-wrapping row
 * with `overflow: hidden` -- so there the panel rendered, reported a sensible
 * rect, and painted nothing. Tapping the chip did nothing at all, which is
 * how a status control stops being trusted.
 *
 * A jsdom pragma because this is a click and a portal, and neither survives
 * `renderToStaticMarkup`.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const robot: RobotState = initialRobots[1]

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

function render(variant?: 'chip' | 'icon') {
  act(() => root.render(<ConnectionStatus robot={robot} variant={variant} />))
}

const trigger = (): HTMLButtonElement => {
  const el = container.querySelector('button')
  if (!el) throw new Error('no trigger')
  return el
}
const panel = (): HTMLElement | null => document.body.querySelector('[role="dialog"]')

describe('the connection panel', () => {
  it('opens outside the control, so a clipping ancestor cannot hide it', () => {
    render('icon')
    expect(panel(), 'the panel is open before anything was pressed').toBeNull()

    act(() => { trigger().click() })
    const open = panel()
    expect(open, 'the panel did not open').not.toBeNull()
    // The assertion this file exists for: portalled, and NOT a descendant of
    // the control or of whatever bar the control was placed in.
    expect(container.contains(open!), 'the panel is inside the control again').toBe(false)
    expect(open!.parentElement).toBe(document.body)
    // Fixed, because an absolutely-positioned panel is placed against the
    // nearest positioned ancestor -- which is the thing that was clipping it.
    expect(open!.style.position).toBe('fixed')
  })

  it('closes on a second press and on Escape', () => {
    render('icon')
    act(() => { trigger().click() })
    expect(panel()).not.toBeNull()
    act(() => { trigger().click() })
    expect(panel()).toBeNull()

    act(() => { trigger().click() })
    act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })) })
    expect(panel()).toBeNull()
  })

  it('still lists every link in the chain', () => {
    render()
    act(() => { trigger().click() })
    const text = panel()!.textContent ?? ''
    for (const key of [
      'liveops.connection.cloudLink',
      'liveops.connection.edgeBridge',
      'liveops.connection.robotControl',
      'liveops.connection.camerasSensors',
    ] as const) {
      expect(text, `${key} is missing from the panel`).toContain(i18n.t(key))
    }
    expect(text).toContain(robot.name)
  })

  it("links to the robot's Edge device tab in Fleet", () => {
    render()
    act(() => { trigger().click() })
    const href = panel()!.querySelector('a')!.getAttribute('href')
    expect(href).toBe(`#/site/${useSessionStore.getState().activeSiteId}/fleet/${robot.robot_id}/edge`)
  })
})

describe('the two triggers', () => {
  // The desktop bar has room for a word. The touch strip does not: at 375 px
  // the word plus a dot plus a chevron is about 110 px, and the readings
  // beside it need that width more than a healthy link does.
  it('chip says the state in words, icon says it in a meter', () => {
    render('chip')
    expect(trigger().textContent?.trim()).not.toBe('')

    act(() => root.render(<ConnectionStatus robot={robot} variant="icon" />))
    expect(trigger().textContent?.trim()).toBe('')
    expect(trigger().querySelector('svg'), 'the icon trigger has no meter').not.toBeNull()
    // Still named for a screen reader, and still says the state on hover.
    expect(trigger().getAttribute('aria-label')).toBeTruthy()
    expect(trigger().getAttribute('title')).toBeTruthy()
  })

  it('defaults to the chip, so the desktop bar is unchanged', () => {
    render()
    expect(trigger().className).toContain('rh-btn')
    expect(trigger().textContent?.trim()).not.toBe('')
  })
})
