import { useCallback, useEffect, useRef, useState } from 'react'
import { DRIVE_INPUT_POLL_MS } from '@/lib/teleop'
import { operatorHoldsControl } from '@/liveops/controlOwner'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import type { RobotState } from '@/types'
import {
  STRAFE_SWEEP_RESEND_MS,
  STRAFE_SWEEP_SPEED_RATIO,
  strafeSweepAt,
  type StrafeSide,
} from './strafeSweep'

export type StrafeSweepStopReason =
  /** The Stop button, or a drive key, Space or the look button pressed mid-sweep. */
  | 'operator'
  /** This operator no longer holds control (released, auto-released, taken). */
  | 'lostControl'
  | 'estop'
  /** driveRobot refused a move (the DRIVE policy: bridge offline, fault…). */
  | 'refused'
  /** The console lost the window (blur, hidden tab, navigating away). */
  | 'focusLost'

export type StrafeSweepState =
  | { phase: 'idle' }
  | {
      phase: 'running'
      stepIndex: number
      kind: 'hold' | 'rest'
      side: StrafeSide
      stick: number
      /** Of the current step, rounded up to a tenth. */
      secondsLeft: number
      startedAt: number
    }
  | { phase: 'done'; startedAt: number; endedAt: number }
  | { phase: 'stopped'; reason: StrafeSweepStopReason; startedAt: number; endedAt: number }

export interface StrafeSweep {
  state: StrafeSweepState
  /** Starts the sweep, if this operator holds control and the robot is not
   * E-Stopped. The first move goes out at once. */
  start: () => void
  /** Stops at once: sends the zero and ends as `stopped`. No-op when not running. */
  stop: (reason?: StrafeSweepStopReason) => void
  /** Back to idle from done or stopped. */
  reset: () => void
  /** Read at call time, for event handlers registered once. */
  isRunning: () => boolean
}

interface Run {
  robotId: string
  timer: ReturnType<typeof setInterval>
  startedAt: number
  lastIndex: number
  lastSentAt: number
  shownTenths: number
}

type Robot = Pick<RobotState, 'robot_id' | 'control_owner' | 'abstract_state'>

/** Why the sweep must not run on this robot now, if it must not. */
function blocker(r: Robot): StrafeSweepStopReason | null {
  if (r.abstract_state === 'E_STOP') return 'estop'
  if (!operatorHoldsControl(r)) return 'lostControl'
  return null
}

/**
 * Runs the strafe sweep (strafeSweep.ts) on `robot` through the store's
 * `driveRobot`: vx = 0, vyaw = 0, the step's vy, speed % 80. A hold sends its
 * setpoint on entry and again every STRAFE_SWEEP_RESEND_MS (the bridge's
 * watchdog brakes if setpoints stop); a rest, and the end, send one stop.
 *
 * It stops at once, sending the zero, on: stop(), unmount or a change of
 * robot, this operator no longer holding control (control_owner, the same
 * check that mounts ManualControlOverlay), the robot reporting E_STOP, or
 * driveRobot refusing a move.
 */
export function useStrafeSweep(robot: Robot): StrafeSweep {
  const driveRobot = useLiveOpsStore((s) => s.driveRobot)
  const driveRef = useRef(driveRobot)
  driveRef.current = driveRobot
  const robotRef = useRef(robot)
  robotRef.current = robot
  const runRef = useRef<Run | null>(null)
  const [state, setState] = useState<StrafeSweepState>({ phase: 'idle' })

  /** Ends the run, if any, and sends the zero. Returns the run that ended. */
  const halt = useCallback((): Run | null => {
    const run = runRef.current
    if (!run) return null
    clearInterval(run.timer)
    runRef.current = null
    // A stop is never refused by the store.
    driveRef.current(run.robotId, 0, 0, 0, STRAFE_SWEEP_SPEED_RATIO)
    return run
  }, [])

  const stop = useCallback((reason: StrafeSweepStopReason = 'operator') => {
    const run = halt()
    if (run) setState({ phase: 'stopped', reason, startedAt: run.startedAt, endedAt: Date.now() })
  }, [halt])

  const tick = useCallback(() => {
    const run = runRef.current
    if (!run) return
    const blocked = blocker(robotRef.current)
    if (blocked) { stop(blocked); return }
    const now = Date.now()
    const at = strafeSweepAt(now - run.startedAt)
    if (at.done) {
      halt()
      setState({ phase: 'done', startedAt: run.startedAt, endedAt: now })
      return
    }
    const { step } = at
    const entered = step.index !== run.lastIndex
    run.lastIndex = step.index
    if (step.kind === 'hold') {
      if (entered || now - run.lastSentAt >= STRAFE_SWEEP_RESEND_MS) {
        if (!driveRef.current(run.robotId, 0, step.vy, 0, STRAFE_SWEEP_SPEED_RATIO)) {
          stop('refused')
          return
        }
        run.lastSentAt = now
      }
    } else if (entered) {
      driveRef.current(run.robotId, 0, 0, 0, STRAFE_SWEEP_SPEED_RATIO)
      run.lastSentAt = now
    }
    const tenths = Math.ceil(at.remainingMs / 100)
    if (entered || tenths !== run.shownTenths) {
      run.shownTenths = tenths
      setState({
        phase: 'running', stepIndex: step.index, kind: step.kind, side: step.side,
        stick: step.stick, secondsLeft: tenths / 10, startedAt: run.startedAt,
      })
    }
  }, [halt, stop])

  const start = useCallback(() => {
    if (runRef.current) return
    const r = robotRef.current
    if (blocker(r)) return
    runRef.current = {
      robotId: r.robot_id,
      timer: setInterval(tick, DRIVE_INPUT_POLL_MS),
      startedAt: Date.now(),
      lastIndex: -1,
      lastSentAt: 0,
      shownTenths: -1,
    }
    tick()
  }, [tick])

  const reset = useCallback(() => {
    if (!runRef.current) setState({ phase: 'idle' })
  }, [])

  const isRunning = useCallback(() => runRef.current !== null, [])

  // Losing control or an E-Stop stops it on the render that shows it, not
  // only on the next tick.
  useEffect(() => {
    if (!runRef.current) return
    const blocked = blocker(robot)
    if (blocked) stop(blocked)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [robot.control_owner, robot.abstract_state, stop])

  // Unmounting, or the panel switching robot, stops the sweep.
  useEffect(() => () => {
    if (halt()) setState({ phase: 'idle' })
  }, [robot.robot_id, halt])

  return { state, start, stop, reset, isRunning }
}
