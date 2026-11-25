import {
  DRIVE_SPEED_RATIO,
  DRIVE_STOP,
  keepaliveDue,
  setpointChanged,
  type DriveSetpoint,
} from '@/lib/teleop'
import { steeringChangeHeld, steeringOnlyChange } from '@/components/liveops/hero/manualControlMath'

/**
 * What one poll of an input surface produced. The shell's input adapter builds
 * it; the loop decides whether it is worth sending.
 */
export interface DriveTick {
  /**
   * m/s and rad/s in the robot's body frame, ALREADY capped by the caller's
   * speed tier -- and already quantised, if that input class quantises its yaw.
   *
   * The loop deliberately does not normalise or rescale. Desktop quantises yaw
   * only while the mouse is steering, and the step is in rad/s, so a core that
   * capped afterwards would either quantise keyboard yaw that is not quantised
   * today or quantise at the wrong scale -- a silent change to how a real robot
   * turns under an operator's hand. Capping and quantising stay in each shell's
   * adapter, where the input's own semantics live.
   */
  setpoint: DriveSetpoint
  /** `driveRobot`'s fifth argument: the robot's own speed %. */
  ratio: number
  /**
   * Any live operator input, velocity or not. The caller owns the deadman and
   * decides what counts: desktop counts held keys, mouse yaw past its dead zone
   * and look-around (which commands no velocity at all); touch counts a finger
   * down on either stick, deflected or centred.
   *
   * An inactive tick stops the robot.
   */
  active: boolean
  /**
   * Set while this input class steers continuously -- desktop's mouse yaw, and
   * nothing else. It arms the steering throttle; the loop still decides whether
   * THIS tick is a steering-only change and whether one went out too recently,
   * because only the loop knows what was last sent and when.
   *
   * Every change of setpoint makes the bridge cancel the robot's velocity
   * sequence and start another, and each restart costs a settle, so unthrottled
   * mouse wobble turned worse than Q/E (operator, 2026-10-30). A stop or a
   * change of walking speed is never held back.
   */
  holdSteering?: boolean
  /**
   * Something else is driving the robot (the supervised sideways sweep), so
   * this loop sends nothing: no stop and no keepalive may cut across that
   * driver's setpoints. It ends with a stop, so the loop resumes from
   * "stopped". Set `active` too if the stand-down counts for the deadman.
   */
  standDown?: boolean
}

export interface DriveLoopCore {
  tick(t: DriveTick): void
  /** One explicit zero-velocity DRIVE, and forget what was last sent. */
  stop(): void
}

/**
 * The manual-drive loop, lifted out of `ManualControlOverlay` so the desktop
 * overlay and the touch shell publish DRIVE identically -- and so it can be
 * tested without a renderer, under this repo's `environment: 'node'` harness.
 *
 * It is deliberately NOT a re-issue cadence. The browser sends a setpoint when
 * the operator's velocity actually changes, plus a slow keepalive while driving
 * continues; the edge bridge holds one long velocity sequence, because only it
 * can cancel one. Re-issuing a burst on a tick cost the robot a settle per
 * burst and half its achievable speed, measured on hardware -- see
 * `lib/teleop.ts` for the numbers.
 *
 * The keepalive is a liveness signal, not motion: the bridge brakes if
 * setpoints stop arriving, so a dropped uplink cannot leave the robot driving
 * for an absent operator.
 *
 * `send` is the store's `driveRobot` with the robot id already bound, and its
 * boolean is load-bearing -- see the record-on-success rule in `tick`.
 */
export function createDriveLoop(opts: {
  send: (vx: number, vy: number, vyaw: number, ratio: number) => boolean
  now?: () => number
}): DriveLoopCore {
  const { send } = opts
  const now = opts.now ?? Date.now

  let lastSent: DriveSetpoint | null = null
  let lastSentAt = 0
  let lastSentRatio: number | null = null
  /** The newest tier seen, sent or not, so `stop()` carries the current speed
   * %: the bridge sets the robot's speed % from every DRIVE, stops included. */
  let currentRatio = DRIVE_SPEED_RATIO

  return {
    tick(t: DriveTick): void {
      currentRatio = t.ratio
      if (t.standDown) {
        lastSent = DRIVE_STOP
        lastSentAt = now()
        lastSentRatio = t.ratio
        return
      }
      const next = t.active ? t.setpoint : DRIVE_STOP

      // Once stopped, go quiet: an idle robot needs no keepalive, and the
      // watchdog only guards a drive that is actually held.
      const idle = !t.active && (lastSent === null || setpointChanged(lastSent, DRIVE_STOP) === false)
      const at = now()
      const steerHeld = t.holdSteering === true
        && steeringOnlyChange(lastSent, next)
        && steeringChangeHeld(lastSentAt, at)
      // Held keys send the same velocities at any speed, so a new speed % while
      // driving is a changed setpoint of its own: it goes out at once, not at
      // the next keepalive.
      const speedChanged = t.active && t.ratio !== lastSentRatio
      const due = (setpointChanged(lastSent, next) && !steerHeld) || speedChanged
        || (!idle && keepaliveDue(lastSentAt, at))

      // Only what actually went out counts as sent. A move the policy refused
      // used to be recorded anyway, so it was not retried until the next
      // keepalive a second later -- which could be refused the same way.
      if (due && send(next.vx, next.vy, next.vyaw, t.ratio)) {
        lastSent = next
        lastSentAt = at
        lastSentRatio = t.ratio
      }
    },

    stop(): void {
      // Unconditional: a stop must never be conditional on what the loop
      // believes it last sent, because that belief can be wrong (a refused
      // send, a bridge restart) and the cost of a redundant stop is nothing.
      send(0, 0, 0, currentRatio)
      lastSent = null
      lastSentAt = 0
      lastSentRatio = null
    },
  }
}
