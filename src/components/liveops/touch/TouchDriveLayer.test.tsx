// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import { currentOperatorId } from '@/lib/realtime/operator'
import { DRIVE_INPUT_POLL_MS } from '@/lib/teleop'
import { initialRobots } from '@/mocks/mockRobots'
import { useDriveSpeedStore } from '@/store/useDriveSpeedStore'
import type { RobotState } from '@/types'
import { stickTravel } from './Joystick'
import { AUTO_RELEASE_SECONDS } from './touchDriveIntent'

/**
 * The touch drive layer, driven end to end: real `Joystick`s, the real shared
 * `useDriveLoop`, real fake timers, and `driveRobot` spied at the store seam —
 * the pattern `hero/ManualControlOverlay.test.tsx` established with a per-file
 * `jsdom` pragma. The maths has its own node tests (`touchDriveIntent.test.ts`,
 * `joystickMath.test.ts`); what is pinned here is the **wiring**, because the
 * failures that matter are all wiring failures:
 *
 * - **Losing control must stop the robot** (plan Review Focus 2). A mission or
 *   another operator takes `control_owner`, the layer unmounts under the
 *   operator's thumb, and the robot must be commanded to stop rather than left
 *   driving until the bridge's 2 s watchdog notices. Two paths have to be real
 *   for that: `useDriveLoop`'s cleanup, and `Joystick`'s unmount release.
 * - **The deadman's breadth.** A finger resting on a centred stick is an
 *   operator who is still there, and so is a tap on a drive-strip control.
 * - **`touch-action: none`**, or the page scrolls or pinch-zooms out from
 *   under a drive and the browser cancels the touch mid-command.
 */

const live = vi.hoisted(() => {
  const drives: number[][] = []
  const looks: { pitchDeg: number; yawDeg: number }[] = []
  const commands: { type: string; params?: Record<string, unknown> }[] = []
  let accept = true
  const actions = {
    driveRobot: (_id: string, vx: number, vy: number, vyaw: number, ratio?: number) => {
      drives.push([vx, vy, vyaw, ratio ?? NaN])
      return accept
    },
    lookRobot: (_id: string, target: { pitchDeg: number; yawDeg: number }) => {
      looks.push(target)
      return true
    },
    dispatchCommand: (_id: string, type: string, _label: string, params?: Record<string, unknown>) => {
      commands.push({ type, params })
    },
    activeCommands: [] as unknown[],
  }
  return { drives, looks, commands, actions, setAccept: (v: boolean) => { accept = v } }
})
vi.mock('@/store/useLiveOpsStore', () => ({
  useLiveOpsStore: (select: (s: typeof live.actions) => unknown) => select(live.actions),
}))

import { TouchDriveLayer } from './TouchDriveLayer'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

/** A 120 px pad at the viewport origin. jsdom measures everything as zero, and
 * a stick with no travel reports every touch as centred — which would make
 * every drive assertion below pass for the wrong reason. */
const PAD = 120
const CENTRE = PAD / 2
const TRAVEL = stickTravel(PAD)

const robotOf = (owner: string | null): RobotState => ({
  ...initialRobots[1],
  robot_id: 'rover-pi',
  control_owner: owner,
})

let container: HTMLDivElement
let root: Root

const render = (robot: RobotState) =>
  act(() => root.render(<TouchDriveLayer robot={robot} orientation="landscape" big />))

const stick = (which: 'move' | 'turn'): HTMLElement => {
  const el = container.querySelector<HTMLElement>(`[data-touch-stick="${which}"] [role="group"]`)
  if (!el) throw new Error(`no ${which} stick rendered`)
  return el
}

/** A pointer event on a stick, `dx`/`dy` px from its centre (y down). jsdom has
 * no `PointerEvent`, so this is a MouseEvent of the right type carrying a
 * `pointerId`, which is all React's synthetic layer and the stick read. */
function pointer(el: HTMLElement, type: string, dx = 0, dy = 0, pointerId = 1) {
  const e = new MouseEvent(type, {
    bubbles: true, cancelable: true,
    clientX: CENTRE + dx, clientY: CENTRE + dy,
  })
  Object.defineProperty(e, 'pointerId', { value: pointerId })
  act(() => { el.dispatchEvent(e) })
}

const poll = (ms = DRIVE_INPUT_POLL_MS) => act(() => { vi.advanceTimersByTime(ms) })
const lastDrive = () => live.drives[live.drives.length - 1]

beforeEach(() => {
  vi.useFakeTimers()
  live.drives.length = 0
  live.looks.length = 0
  live.commands.length = 0
  live.setAccept(true)
  useDriveSpeedStore.setState({ speeds: {} })
  // Every element measures as the pad. Only the sticks ask.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, right: PAD, bottom: PAD, width: PAD, height: PAD, x: 0, y: 0,
    toJSON: () => ({}),
  } as DOMRect)
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('the layer mounts on control ownership alone', () => {
  it('renders nothing when nobody holds control', () => {
    render(robotOf(null))
    expect(container.querySelector('[data-touch-drive]')).toBeNull()
  })

  it('renders nothing when a mission run holds control', () => {
    // `mission:<run_id>` is control held by a program, not a person: driving
    // then would fight the run, and the deadman's RELEASE_CONTROL would be
    // refused (REJECTED_MISSION_HOLDS_CONTROL).
    render(robotOf('mission:run-7'))
    expect(container.querySelector('[data-touch-drive]')).toBeNull()
  })

  it('renders nothing when a tapped walk holds control', () => {
    render(robotOf('nav:goal-3'))
    expect(container.querySelector('[data-touch-drive]')).toBeNull()
  })

  it('renders nothing when another operator holds control', () => {
    render(robotOf('someone-else'))
    expect(container.querySelector('[data-touch-drive]')).toBeNull()
  })

  it('renders the two sticks when this operator holds control', () => {
    render(robotOf(currentOperatorId()))
    expect(container.querySelector('[data-touch-drive]')).not.toBeNull()
    expect(stick('move')).toBeTruthy()
    expect(stick('turn')).toBeTruthy()
  })
})

describe('the sticks drive through the shared loop', () => {
  beforeEach(() => render(robotOf(currentOperatorId())))

  it('a finger down on a centred stick reads as live input and asks for nothing', () => {
    pointer(stick('move'), 'pointerdown')
    poll()
    expect(lastDrive()).toEqual([0, 0, 0, 60])
  })

  it('pushing the left stick up drives forward at full stick, carrying the speed %', () => {
    act(() => useDriveSpeedStore.getState().setTier('rover-pi', 'slow'))
    pointer(stick('move'), 'pointerdown')
    pointer(stick('move'), 'pointermove', 0, -TRAVEL)
    poll()
    expect(lastDrive()).toEqual([0.64, 0, 0, 30])
  })

  it('pushing the right stick left turns left', () => {
    pointer(stick('turn'), 'pointerdown')
    pointer(stick('turn'), 'pointermove', -TRAVEL, 0)
    poll()
    expect(lastDrive()).toEqual([0, 0, 1.04, 60])
  })

  it('letting go stops the robot', () => {
    pointer(stick('move'), 'pointerdown')
    pointer(stick('move'), 'pointermove', 0, -TRAVEL)
    poll()
    expect(lastDrive()).toEqual([0.64, 0, 0, 60])
    pointer(stick('move'), 'pointerup', 0, -TRAVEL)
    poll()
    expect(lastDrive()).toEqual([0, 0, 0, 60])
  })

  it('a system gesture that cancels the touch stops the robot', () => {
    pointer(stick('move'), 'pointerdown')
    pointer(stick('move'), 'pointermove', 0, -TRAVEL)
    poll()
    pointer(stick('move'), 'pointercancel', 0, -TRAVEL)
    poll()
    expect(lastDrive()).toEqual([0, 0, 0, 60])
  })
})

describe('losing control stops the robot', () => {
  it('a mission taking control unmounts the layer and commands a stop', () => {
    // Plan Review Focus 2, with a thumb still on the stick: the layer must not
    // keep publishing, and must not merely stop publishing either.
    render(robotOf(currentOperatorId()))
    pointer(stick('move'), 'pointerdown')
    pointer(stick('move'), 'pointermove', 0, -TRAVEL)
    poll()
    expect(lastDrive()).toEqual([0.64, 0, 0, 60])

    render(robotOf('mission:run-7'))
    expect(container.querySelector('[data-touch-drive]')).toBeNull()
    expect(lastDrive()).toEqual([0, 0, 0, 60])

    // And nothing more goes out: the surface is gone, so its interval is too.
    const sent = live.drives.length
    poll(5000)
    expect(live.drives.length).toBe(sent)
  })

  it('the stop carries the chosen speed %, as every DRIVE does', () => {
    useDriveSpeedStore.getState().setTier('rover-pi', 'slow')
    render(robotOf(currentOperatorId()))
    pointer(stick('move'), 'pointerdown')
    pointer(stick('move'), 'pointermove', 0, -TRAVEL)
    poll()
    render(robotOf(null))
    expect(lastDrive()).toEqual([0, 0, 0, 30])
  })
})

describe('the deadman', () => {
  it('releases control after AUTO_RELEASE_SECONDS of no input', () => {
    render(robotOf(currentOperatorId()))
    poll(AUTO_RELEASE_SECONDS * 1000)
    expect(live.commands.map((c) => c.type)).toContain('RELEASE_CONTROL')
  })

  it('a finger resting on a centred stick holds control open', () => {
    render(robotOf(currentOperatorId()))
    pointer(stick('move'), 'pointerdown')
    poll((AUTO_RELEASE_SECONDS - 1) * 1000)
    poll((AUTO_RELEASE_SECONDS - 1) * 1000)
    expect(live.commands.map((c) => c.type)).not.toContain('RELEASE_CONTROL')
  })

  it('shows the countdown', () => {
    render(robotOf(currentOperatorId()))
    const ring = container.querySelector('[data-touch-deadman]')
    expect(ring).not.toBeNull()
    expect(ring!.textContent).toContain(String(AUTO_RELEASE_SECONDS))
  })
})

describe('the drive strip', () => {
  beforeEach(() => render(robotOf(currentOperatorId())))

  it('carries speed, gait, obstacle avoidance and Look', () => {
    const strip = container.querySelector('[data-touch-drive-strip]')
    expect(strip).not.toBeNull()
    expect(strip!.querySelector('[data-strip-control="speed"]')).not.toBeNull()
    expect(strip!.querySelector('[data-strip-control="gait"]')).not.toBeNull()
    expect(strip!.querySelector('[data-strip-control="avoidance"]')).not.toBeNull()
    expect(strip!.querySelector('[data-strip-control="look"]')).not.toBeNull()
  })

  it('a tap on it feeds the deadman', () => {
    const look = container.querySelector<HTMLElement>('[data-strip-control="look"] button')!
    poll((AUTO_RELEASE_SECONDS - 2) * 1000)
    pointer(look, 'pointerdown')
    poll((AUTO_RELEASE_SECONDS - 2) * 1000)
    expect(live.commands.map((c) => c.type)).not.toContain('RELEASE_CONTROL')
  })

  it('while Look is lit the right stick looks and the robot does not turn', () => {
    const look = container.querySelector<HTMLElement>('[data-strip-control="look"] button')!
    act(() => { look.click() })
    pointer(stick('turn'), 'pointerdown')
    pointer(stick('turn'), 'pointermove', TRAVEL, 0)
    poll(400)
    expect(live.looks.length).toBeGreaterThan(0)
    expect(live.looks[live.looks.length - 1].yawDeg).toBeGreaterThan(0)
    for (const d of live.drives) expect([d[0], d[1], d[2]]).toEqual([0, 0, 0])
  })
})

describe('the page cannot move under a drive', () => {
  it('the layer sets touch-action: none', () => {
    render(robotOf(currentOperatorId()))
    const layer = container.querySelector<HTMLElement>('[data-touch-drive]')!
    expect(layer.style.touchAction).toBe('none')
  })
})
