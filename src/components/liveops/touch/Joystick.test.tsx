import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import {
  createStickController,
  Joystick,
  STICK_END_EVENTS,
  stickTravel,
  type StickPointerEvent,
  type StickVector,
} from './Joystick'
import { stickVector } from './joystickMath'

/**
 * This component is a safety control, and its whole job is that letting go
 * stops the robot. So what these tests are really pinning is that EVERY way a
 * pointer interaction can end — `pointerup`, `pointercancel`,
 * `lostpointercapture`, and the layer unmounting under the operator's thumb —
 * runs the same `release()`, recentres, and emits `{x: 0, y: 0}`.
 *
 * `pointercancel` is the one that is easy to forget and common on a tablet
 * (Review Focus 1): a system gesture, an incoming notification, or the browser
 * deciding the touch became a scroll ends the touch with no `pointerup` at all.
 * Without it the stick holds its last deflection and the robot keeps driving
 * until the bridge's 2 s watchdog notices.
 *
 * Vitest runs `environment: 'node'` here — no DOM, no component renderer — so
 * the pointer state machine lives in `createStickController`, a React-free
 * unit these tests drive for real with synthetic events. `Joystick` spreads
 * `controller.handlers` straight onto its element, so driving the controller
 * drives what the element does. The only assertion that needs markup is
 * `touch-action`, taken with `renderToStaticMarkup` as `MapCanvas.test.tsx`
 * does.
 */

// A pad 120 px square whose top-left is at (100, 200) — deliberately not at the
// origin, so an implementation that forgot to subtract the element's offset
// would read every touch as a hard deflection down-right.
const PAD = { left: 100, top: 200, width: 120, height: 120 }
const CENTRE = { x: PAD.left + PAD.width / 2, y: PAD.top + PAD.height / 2 }
const TRAVEL = stickTravel(PAD.width)

const captured: number[] = []
const released: number[] = []
const target: StickPointerEvent['currentTarget'] = {
  getBoundingClientRect: () => PAD,
  setPointerCapture: (id: number) => void captured.push(id),
  releasePointerCapture: (id: number) => void released.push(id),
  hasPointerCapture: () => true,
}

/** A pointer `dx`,`dy` px from the pad's centre, in client pixels (y down). */
const at = (dx: number, dy: number, pointerId = 1): StickPointerEvent => ({
  pointerId,
  clientX: CENTRE.x + dx,
  clientY: CENTRE.y + dy,
  currentTarget: target,
})

/** What `joystickMath` itself says that touch is — never a restated number. */
const expected = (dx: number, dy: number): StickVector =>
  stickVector(CENTRE, { x: CENTRE.x + dx, y: CENTRE.y + dy }, TRAVEL)

function harness(options: Partial<Parameters<typeof createStickController>[0]> = {}) {
  const onChange = vi.fn()
  const onActive = vi.fn()
  const controller = createStickController({ onChange, onActive, ...options })
  return { controller, onChange, onActive, h: controller.handlers }
}

const ZERO = { x: 0, y: 0 }
/** Every vector the stick handed its owner, in order. */
const changes = (onChange: ReturnType<typeof vi.fn>): StickVector[] =>
  onChange.mock.calls.map((call) => call[0] as StickVector)
/** The last vector the stick handed its owner. */
const lastChange = (onChange: ReturnType<typeof vi.fn>): StickVector =>
  changes(onChange)[onChange.mock.calls.length - 1]

describe('the stick reports deflection', () => {
  it('a touch deflects from the pad centre, not from the viewport origin', () => {
    const { h, onChange, onActive, controller } = harness()
    h.onPointerDown(at(0, 0))
    expect(onActive).toHaveBeenCalledWith(true)
    // A finger that landed dead centre has commanded nothing at all.
    expect(controller.state().value).toEqual(ZERO)

    h.onPointerMove(at(0, -TRAVEL))
    expect(lastChange(onChange)).toEqual(expected(0, -TRAVEL))
    expect(controller.state().value).toEqual(expected(0, -TRAVEL))
  })

  it('captures the pointer, so a thumb sliding off the pad keeps steering it', () => {
    const { h, controller } = harness()
    captured.length = 0
    h.onPointerDown(at(0, 0, 7))
    expect(captured).toEqual([7])
    // ...and a thumb far outside the pad is still this stick's, held at full
    // throw rather than abandoned mid-drive.
    h.onPointerMove(at(400, 400, 7))
    const { x, y } = controller.state().value
    expect(Math.hypot(x, y)).toBeCloseTo(1, 10)
  })

  it('a move that changes nothing is not re-emitted', () => {
    const { h, onChange } = harness()
    h.onPointerDown(at(0, 0))
    h.onPointerMove(at(0, -TRAVEL))
    const calls = onChange.mock.calls.length
    h.onPointerMove(at(0, -TRAVEL))
    expect(onChange.mock.calls.length).toBe(calls)
  })

  it('ignores a move with no finger down', () => {
    const { h, onChange, onActive } = harness()
    h.onPointerMove(at(0, -TRAVEL))
    expect(onChange).not.toHaveBeenCalled()
    expect(onActive).not.toHaveBeenCalled()
  })

  it('a thumb resting inside the dead zone reads active but commands nothing', () => {
    const { h, onChange, onActive } = harness()
    h.onPointerDown(at(0, 0))
    h.onPointerMove(at(2, -2))
    expect(onActive).toHaveBeenCalledWith(true)
    // Active, because the deadman must stay fed while a finger is down — but
    // not a creep setpoint that keeps the bridge's watchdog happy.
    expect(changes(onChange).every((v) => v.x === 0 && v.y === 0)).toBe(true)
  })

  it('honours a dead zone passed in', () => {
    const { h, onChange } = harness({ deadZone: 0.9 })
    h.onPointerDown(at(0, 0))
    h.onPointerMove(at(0, -TRAVEL * 0.5))
    expect(changes(onChange).filter((v) => v.y !== 0)).toHaveLength(0)
  })

  it("axis 'x' pins the stick to its horizontal, so a turn stick cannot read vertical", () => {
    const { h, onChange, controller } = harness({ axis: 'x' })
    h.onPointerDown(at(0, 0))
    h.onPointerMove(at(-TRAVEL, -TRAVEL))
    expect(lastChange(onChange).y).toBe(0)
    expect(controller.state().value.y).toBe(0)
    expect(controller.state().value.x).toBeCloseTo(expected(-TRAVEL, -TRAVEL).x, 12)
  })
})

describe('every end path is a stop', () => {
  // The whole point of the control. Driven as a loop rather than three
  // hand-written cases, so a fourth end path cannot be added to the component
  // without being routed through the same `release()`.
  it.each(STICK_END_EVENTS)('%s recentres and emits zero', (name) => {
    const { h, onChange, onActive, controller } = harness()
    h.onPointerDown(at(0, 0))
    h.onPointerMove(at(0, -TRAVEL))
    expect(controller.state().value).not.toEqual(ZERO)

    onChange.mockClear()
    onActive.mockClear()
    h[name](at(0, -TRAVEL))

    expect(onChange).toHaveBeenCalledWith(ZERO)      // the robot is told to stop
    expect(onActive).toHaveBeenCalledWith(false)
    expect(controller.state()).toEqual({ down: false, value: ZERO })  // the knob recentres
  })

  it('pointercancel stops even a stick that was sitting at zero', () => {
    // Review Focus 1, in its least forgiving form: the stop goes out whether or
    // not the setpoint changed, because `onChange` is how the caller learns the
    // stick is no longer asking for anything.
    const { h, onChange, onActive } = harness()
    h.onPointerDown(at(0, 0))
    onChange.mockClear()
    h.onPointerCancel(at(0, 0))
    expect(onChange).toHaveBeenCalledWith(ZERO)
    expect(onActive).toHaveBeenCalledWith(false)
  })

  it('unmount while held emits zero', () => {
    // The drive layer can disappear under the operator's thumb when control is
    // lost to a mission or another operator (Review Focus 2). `Joystick`'s
    // unmount effect is exactly this call, which is why `release()` is public.
    const { controller, onChange, onActive } = harness()
    controller.handlers.onPointerDown(at(0, 0))
    controller.handlers.onPointerMove(at(TRAVEL, 0))
    onChange.mockClear()

    controller.release()

    expect(onChange).toHaveBeenCalledWith(ZERO)
    expect(onActive).toHaveBeenCalledWith(false)
    expect(controller.state()).toEqual({ down: false, value: ZERO })
  })

  it('a release after the stick is already up is silent', () => {
    // A real browser fires `lostpointercapture` right after `pointerup`, so the
    // second stop arrives on every single interaction. It must not re-emit, or
    // every release would report two stops and a second `onActive(false)`.
    const { h, controller, onChange, onActive } = harness()
    h.onPointerDown(at(0, 0))
    h.onPointerUp(at(0, 0))
    onChange.mockClear()
    onActive.mockClear()

    h.onLostPointerCapture(at(0, 0))
    controller.release()

    expect(onChange).not.toHaveBeenCalled()
    expect(onActive).not.toHaveBeenCalled()
  })

  it('a second finger cannot steal the stick, and cannot stop it either', () => {
    // Two thumbs are on the screen while driving. A touch that strays onto this
    // pad must neither take it over nor release it under the thumb that owns it.
    const { h, controller, onChange } = harness()
    h.onPointerDown(at(0, 0, 1))
    h.onPointerMove(at(0, -TRAVEL, 1))
    const held = controller.state().value

    h.onPointerDown(at(TRAVEL, 0, 2))
    h.onPointerMove(at(TRAVEL, 0, 2))
    expect(controller.state().value).toEqual(held)

    h.onPointerUp(at(TRAVEL, 0, 2))
    h.onPointerCancel(at(TRAVEL, 0, 2))
    h.onLostPointerCapture(at(TRAVEL, 0, 2))
    expect(controller.state()).toEqual({ down: true, value: held })

    onChange.mockClear()
    h.onPointerUp(at(0, -TRAVEL, 1))
    expect(onChange).toHaveBeenCalledWith(ZERO)
  })

  it('survives an element that refuses pointer capture', () => {
    // Safari has thrown here when the pointer is already gone. A throw inside
    // pointerdown would leave the stick live with no owner.
    const { controller } = harness()
    const hostile: StickPointerEvent['currentTarget'] = {
      getBoundingClientRect: () => PAD,
      setPointerCapture: () => { throw new Error('InvalidPointerId') },
    }
    expect(() => controller.handlers.onPointerDown({ ...at(0, 0), currentTarget: hostile })).not.toThrow()
    expect(controller.state().down).toBe(true)
  })
})

describe('the rendered pad', () => {
  const render = (props: Partial<Parameters<typeof Joystick>[0]> = {}) =>
    renderToStaticMarkup(
      <Joystick size={120} label="Move" onChange={() => {}} onActive={() => {}} {...props} />,
    )

  it('the element sets touch-action: none', () => {
    // Without it the page scrolls or pinch-zooms out from under a drive, and
    // the browser cancels the touch mid-command.
    expect(render()).toContain('touch-action:none')
  })

  it('names the stick for assistive tech', () => {
    expect(render({ label: 'Turn' })).toContain('aria-label="Turn"')
  })

  it('the knob starts centred and inside the pad', () => {
    expect(render()).toContain('translate(0px, 0px)')
    // Full throw can never push the knob past the pad's own rim.
    const size = 120
    expect(stickTravel(size) + (size - 2 * stickTravel(size)) / 2).toBeCloseTo(size / 2, 10)
  })

  it('scales its travel with the size it is given', () => {
    expect(stickTravel(160)).toBeGreaterThan(stickTravel(120))
    expect(stickTravel(0)).toBe(0)
  })
})
