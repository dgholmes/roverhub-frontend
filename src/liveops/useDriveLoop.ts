import { useEffect, useRef } from 'react'
import { DRIVE_INPUT_POLL_MS } from '@/lib/teleop'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { createDriveLoop, type DriveTick } from './driveLoop'

/**
 * Runs `createDriveLoop` on the `DRIVE_INPUT_POLL_MS` poll, for whichever
 * shell is driving -- the desktop overlay's keyboard and mouse, or the touch
 * shell's sticks. Both publish DRIVE through the same core, so neither can
 * drift into its own cadence.
 *
 * Polling fast is free: a tick only SENDS when the operator's velocity
 * actually changes, plus a slow keepalive while driving continues. It used to
 * re-issue a bounded burst every 250 ms, which cost the robot a settle per
 * burst and half its achievable speed -- see `@/lib/teleop`.
 *
 * `buildTick` is read through a ref, so it may close over whatever the shell's
 * render produced without restarting the interval. It is called once per poll
 * and may have side effects the shell owns -- the desktop overlay drains its
 * accumulated mouse movement in it.
 *
 * `onActive` fires on every tick that reports live operator input. The deadman
 * is the CALLER's, and it is deliberately not derived from the setpoint:
 * W and S held together, or a mouse nudge too small to quantise, are hands-on
 * input that commands no velocity at all. `DriveTick.active` is the only
 * honest answer to "is someone still there".
 *
 * Leaving -- `enabled` going false, or unmount -- commands a stop, because a
 * drive surface that no longer exists must not leave the robot moving.
 */
export function useDriveLoop(
  robotId: string,
  buildTick: () => DriveTick,
  onActive: () => void,
  enabled: boolean = true,
): void {
  const driveRobot = useLiveOpsStore((s) => s.driveRobot)

  const buildTickRef = useRef(buildTick)
  buildTickRef.current = buildTick
  const onActiveRef = useRef(onActive)
  onActiveRef.current = onActive

  useEffect(() => {
    if (!enabled) return
    const core = createDriveLoop({
      send: (vx, vy, vyaw, ratio) => driveRobot(robotId, vx, vy, vyaw, ratio),
    })
    const t = setInterval(() => {
      const tick = buildTickRef.current()
      core.tick(tick)
      if (tick.active) onActiveRef.current()
    }, DRIVE_INPUT_POLL_MS)
    return () => {
      clearInterval(t)
      core.stop()
    }
  }, [robotId, driveRobot, enabled])
}
