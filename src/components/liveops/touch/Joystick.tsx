import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { color, font, radius, space } from '@/design-system/tokens'
import { stickVector, STICK_DEAD_ZONE, type Pt, type StickVector } from './joystickMath'

export type { StickVector } from './joystickMath'

/**
 * One thumb stick of the touch console's drive layer (design §7.3).
 *
 * **This is a safety control, and its whole job is that letting go stops the
 * robot.** Releasing a stick is the soft stop an operator reaches for first —
 * before the latched E-Stop — so every way a pointer interaction can end runs
 * the same `release()`, recentres the knob and emits `{x: 0, y: 0}`:
 *
 * - `pointerup` — the ordinary case;
 * - `pointercancel` — a system gesture, an incoming notification, or the
 *   browser deciding the touch became a scroll. There is no `pointerup` at all
 *   in that case, and on a tablet it is not rare;
 * - `lostpointercapture` — capture taken away for any other reason;
 * - **unmount while held** — the drive layer disappears under the operator's
 *   thumb the moment control is lost to a mission or another operator.
 *
 * Miss any one of them and the stick holds its last deflection: the robot keeps
 * driving until the bridge's 2 s `DRIVE_WATCHDOG_TIMEOUT_S` notices, which is
 * the same bug class as the desktop keypad's `onMouseLeave` hole (plan Task 4).
 *
 * ## Shape
 *
 * Vitest runs `environment: 'node'` in this repo — no DOM, no component
 * renderer — so the pointer state machine is `createStickController`, a plain
 * React-free unit the tests drive for real with synthetic events. The
 * component spreads `controller.handlers` straight onto its element and owns
 * nothing but paint, so what the tests drive is what the element does.
 *
 * The vector maths is `joystickMath.ts`; the mapping from a vector to m/s and
 * rad/s is `leftStickAxes` / `rightStickAxes` there, applied by the caller.
 * This component is deliberately ignorant of the robot.
 */

/** Knob diameter as a fraction of the pad. */
const KNOB_RATIO = 0.42

/**
 * How far the knob's centre may travel from the pad's centre, in px — also the
 * radius `stickVector` normalises against, so a thumb at the visible rim is
 * exactly full throw. Travel plus half the knob is half the pad, so the knob
 * never overruns the ring that is drawn around it.
 */
export function stickTravel(size: number): number {
  return Math.max(0, (size - size * KNOB_RATIO) / 2)
}

/** The rectangle of the pad, as `getBoundingClientRect` reports it. */
export interface StickRect {
  left: number
  top: number
  width: number
  height: number
}

/**
 * The slice of a React `PointerEvent` this module reads. Narrowed to exactly
 * this so the state machine can be driven by plain objects under the `node`
 * test environment — a real `React.PointerEvent` is assignable to it.
 */
export interface StickPointerEvent {
  pointerId: number
  clientX: number
  clientY: number
  currentTarget: {
    getBoundingClientRect(): StickRect
    setPointerCapture?(pointerId: number): void
    releasePointerCapture?(pointerId: number): void
    hasPointerCapture?(pointerId: number): boolean
  }
  preventDefault?(): void
}

/**
 * The three events that end an interaction, as handler names. Exported so the
 * test can loop over them: a fourth end path cannot be added to the component
 * without appearing here and being routed through the same `release()`.
 */
export const STICK_END_EVENTS = ['onPointerUp', 'onPointerCancel', 'onLostPointerCapture'] as const

export type StickEndEvent = (typeof STICK_END_EVENTS)[number]

export type StickHandlers = Record<
  'onPointerDown' | 'onPointerMove' | StickEndEvent,
  (e: StickPointerEvent) => void
>

export interface StickControllerOptions {
  /** The stick's deflection changed. Always called with `{x: 0, y: 0}` on release. */
  onChange: (v: StickVector) => void
  /** A finger is down, or is no longer down. Feeds the caller's deadman. */
  onActive: (down: boolean) => void
  /** Defaults to `STICK_DEAD_ZONE` (0.12). */
  deadZone?: number
  /** `'x'` pins both the output and the knob to the horizontal — the turn stick. */
  axis?: 'both' | 'x'
}

export interface StickController {
  /** Spread onto the pad element; also what the tests drive. */
  handlers: StickHandlers
  /**
   * The one stop path, shared by all three end events and by the component's
   * unmount. Idempotent: a browser fires `lostpointercapture` right after
   * `pointerup`, so the second stop arrives on every interaction.
   */
  release: () => void
  /** For paint, and for the tests. */
  state: () => { down: boolean; value: StickVector }
}

const ZERO: StickVector = { x: 0, y: 0 }

function same(a: StickVector, b: StickVector): boolean {
  return a.x === b.x && a.y === b.y
}

export function createStickController(options: StickControllerOptions): StickController {
  /** The pointer that owns the stick. A second finger is ignored entirely. */
  let owner: number | null = null
  let origin: Pt = ZERO
  let travel = 0
  let value: StickVector = ZERO

  const emit = (next: StickVector) => {
    value = next
    options.onChange(next)
  }

  const vectorFor = (e: StickPointerEvent): StickVector => {
    const v = stickVector(
      origin,
      { x: e.clientX, y: e.clientY },
      travel,
      options.deadZone ?? STICK_DEAD_ZONE,
    )
    return options.axis === 'x' ? { x: v.x, y: 0 } : v
  }

  const release = () => {
    if (owner === null) return
    owner = null
    // Always emitted, changed or not: `onChange` is how the caller learns the
    // stick is no longer asking for anything, and a stop that depends on the
    // setpoint having moved is a stop that can be skipped.
    emit(ZERO)
    options.onActive(false)
  }

  /** An end event from a finger that does not own this stick changes nothing. */
  const releaseFor = (e: StickPointerEvent) => {
    if (owner === null || e.pointerId !== owner) return
    release()
  }

  const handlers = {
    onPointerDown(e: StickPointerEvent) {
      if (owner !== null) return // a second finger does not steal the stick
      owner = e.pointerId
      const rect = e.currentTarget.getBoundingClientRect()
      origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
      travel = stickTravel(Math.min(rect.width, rect.height))
      e.preventDefault?.()
      try {
        // Capture, so a thumb that slides off the pad keeps steering this stick
        // rather than silently abandoning it mid-drive. Safari has thrown here
        // when the pointer is already gone; a throw would leave the stick live
        // with no owner, so it is swallowed and the interaction continues.
        e.currentTarget.setPointerCapture?.(e.pointerId)
      } catch {
        /* capture is an optimisation; the end events still stop the stick */
      }
      const next = vectorFor(e)
      if (!same(next, value)) emit(next)
      options.onActive(true)
    },

    onPointerMove(e: StickPointerEvent) {
      if (owner === null || e.pointerId !== owner) return
      const next = vectorFor(e)
      if (!same(next, value)) emit(next)
    },

    onPointerUp: releaseFor,
    onPointerCancel: releaseFor,
    onLostPointerCapture: releaseFor,
  } satisfies StickHandlers

  return {
    handlers,
    release,
    state: () => ({ down: owner !== null, value }),
  }
}

export interface JoystickProps {
  /** Pad diameter in px. The caller sizes it for tablet or phone. */
  size: number
  /** Accessible name — already translated by the caller. */
  label: string
  onChange: (v: StickVector) => void
  onActive: (down: boolean) => void
  /** `'x'` for the turn stick, whose vertical axis means nothing. */
  axis?: 'both' | 'x'
  deadZone?: number
  /** Placement is the layout's job, not the stick's. */
  style?: CSSProperties
}

export function Joystick({
  size,
  label,
  onChange,
  onActive,
  axis = 'both',
  deadZone,
  style,
}: JoystickProps) {
  const [knob, setKnob] = useState<StickVector>(ZERO)
  const [down, setDown] = useState(false)

  // The controller outlives every render, so it reads the current props through
  // a ref rather than closing over the first ones: a stale `onChange` here
  // would publish a drive setpoint to a robot the layer has already moved on
  // from.
  const latest = useRef({ onChange, onActive, axis, deadZone })
  latest.current = { onChange, onActive, axis, deadZone }

  const ref = useRef<StickController | null>(null)
  if (!ref.current) {
    ref.current = createStickController({
      onChange: (v) => {
        setKnob(v)
        latest.current.onChange(v)
      },
      onActive: (isDown) => {
        setDown(isDown)
        latest.current.onActive(isDown)
      },
      get axis() {
        return latest.current.axis
      },
      get deadZone() {
        return latest.current.deadZone
      },
    })
  }
  const controller = ref.current

  // Unmount is an end path like any other: the drive layer vanishes the moment
  // control is lost to a mission or another operator, and it can do that with
  // a thumb still on the stick.
  useEffect(() => () => controller.release(), [controller])

  const travel = stickTravel(size)
  const knobSize = Math.round(size * KNOB_RATIO)

  return (
    <div
      aria-label={label}
      role="group"
      {...controller.handlers}
      style={{
        // Without this the page scrolls or pinch-zooms out from under a drive,
        // and the browser cancels the touch mid-command.
        touchAction: 'none',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTapHighlightColor: 'transparent',
        position: 'relative',
        width: size,
        height: size,
        borderRadius: radius.full,
        // A tint, not an outline — the pad floats over live video and the map.
        background: color.overlay,
        boxShadow: down ? `inset 0 0 0 ${space[1]}px ${color.accentDim}` : 'none',
        transition: 'box-shadow 120ms ease',
        cursor: 'grab',
        flexShrink: 0,
        ...style,
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: knobSize,
          height: knobSize,
          marginLeft: -knobSize / 2,
          marginTop: -knobSize / 2,
          borderRadius: radius.full,
          background: down ? color.accentSolid : color.card,
          // Reflects what the robot is being asked for, so a knob at rest is a
          // robot at rest. No transition while held: the knob must not lag the
          // thumb, and must not animate back to centre after a stop.
          transform: `translate(${knob.x * travel}px, ${knob.y * travel}px)`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          font: `${font.weight.medium} ${font.size['2xs']}px/1 ${font.family}`,
          letterSpacing: font.tracking.widest,
          textTransform: 'uppercase',
          color: down ? color.accentText : color.t3,
        }}
      >
        {label}
      </div>
    </div>
  )
}
