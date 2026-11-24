// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import type { RobotState } from '@/types'
import { PostureButtons } from './PostureButtons'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/**
 * ⚠️ Every fixture below sets a REAL `sdk_state`. The mock fleet's default is
 * `MOTION_BALANCE_STAND`, which is deliberately not an SDK state name, so a
 * test leaning on the fixture's default would only ever exercise the
 * "unrecognised, show all three" branch and prove nothing about the rest.
 */
const quad = (over: Partial<RobotState> = {}): RobotState =>
  ({ ...initialRobots[1], robot_type: 'quad', posture: 'upright', ...over })

let container: HTMLDivElement
let root: Root

function render(robot: RobotState) {
  act(() => root.render(<PostureButtons robot={robot} onSetState={() => {}} />))
}

/** The posture buttons, in render order, by their visible label. */
const labels = () =>
  [...container.querySelectorAll('button')].map((b) => b.textContent?.trim() ?? '')

const button = (label: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('PostureButtons', () => {
  it('draws Stand alone for a quad lying down', () => {
    render(quad({ sdk_state: 'ready' }))
    expect(labels()).toEqual(['Stand'])
  })

  it('draws Stand alone for a quad sitting', () => {
    render(quad({ sdk_state: 'stand_down' }))
    expect(labels()).toEqual(['Stand'])
  })

  it('draws Sit and Safe stop, and no Stand, for a standing quad', () => {
    render(quad({ sdk_state: 'balance_stand' }))
    expect(labels()).toEqual(['Sit', 'Safe stop'])
    expect(button('Stand')).toBeUndefined()
  })

  it('draws Sit and Safe stop for a walking quad', () => {
    render(quad({ sdk_state: 'walk' }))
    expect(labels()).toEqual(['Sit', 'Safe stop'])
  })

  // Exactly once: the recovery action is the whole set now, not a fourth
  // button appended beside the three.
  it('draws Get Up alone, once, for a fallen quad', () => {
    render(quad({ sdk_state: 'ready', posture: 'fallen' }))
    expect(labels()).toEqual(['Get Up'])
  })

  // Review Focus #1: a state table this build has not caught up with must
  // leave every control on screen.
  it('draws all three for an unrecognised sdk_state', () => {
    render(quad({ sdk_state: 'no_such_state' }))
    expect(labels()).toEqual(['Stand', 'Sit', 'Safe stop'])
  })

  it('draws the mock fleet default, which is an unrecognised state, as all three', () => {
    render(quad())
    expect(labels()).toEqual(['Stand', 'Sit', 'Safe stop'])
  })

  // Refused is not hidden: the button stays, disabled, carrying its reason.
  it('still draws an applicable control that commandPolicy refuses', () => {
    render(quad({ sdk_state: 'ready', battery: { percent: 3, est_runtime_min: 4, charging: false } }))
    expect(labels()).toEqual(['Stand'])
    const stand = button('Stand')!
    expect(stand.getAttribute('aria-disabled')).toBe('true')
    expect(stand.getAttribute('title')).toContain('Battery critical')
  })

  it('leaves an applicable control enabled when nothing refuses it', () => {
    render(quad({ sdk_state: 'ready' }))
    expect(button('Stand')!.getAttribute('aria-disabled')).toBe('false')
  })

  it('hides nothing for a bridge that is offline — every applicable control is still drawn', () => {
    const offline = quad({
      sdk_state: 'balance_stand',
      connectivity: { ...initialRobots[1].connectivity, bridge_state: 'offline' },
    })
    render(offline)
    expect(labels()).toEqual(['Sit', 'Safe stop'])
    expect(button('Sit')!.getAttribute('aria-disabled')).toBe('true')
  })
})
