import { Armchair, PersonStanding } from 'lucide-react'
import { getCommandAvailability } from '@/liveops/commandPolicy'
import type { RobotState } from '@/types'
import { ActionButton } from '../mission/ActionButton'

/**
 * Posture control — Stand / Sit, wired through the existing SET_STATE
 * command (shared/schemas/commands.py is the source of truth for the
 * command surface; `params: {state: <name>}`).
 *
 * `stand_down` ("Sit") is the one posture state genuinely common to both
 * FSMs (docs/03-sdk-integration.md §7.1/§7.2). "Stand" is NOT a shared
 * state name: §7.1's quad table has `balance_stand`, but §7.2's wheel table
 * has no `balance_stand` entry at all — the wheel-mode equivalent is
 * `ready` ("Controller active, wheels down"), matching §7.3's abstract-state
 * mapping (`STAND` -> `"balance_stand" or "ready"`). Dispatching
 * `balance_stand` unconditionally would silently fail on a wheel robot, so
 * "Stand" branches on `robot.robot_type` below — this group still never
 * hides for wheel robots (unlike the quick-action gestures), it just sends
 * a different state name.
 *
 * Always rendered regardless of mission state (per dispatch: "always
 * visible"), same as the mission-action button row in CurrentTaskBar —
 * availability (enabled vs. disabled-with-reason) is still governed by
 * commandPolicy, so it's visible-but-disabled rather than hidden when the
 * command genuinely can't be issued (e.g. E-Stop, FAULT, active mission).
 */
export function PostureButtons({
  robot, onSetState,
}: {
  robot: RobotState
  onSetState: (state: string, label: string) => void
}) {
  const availability = getCommandAvailability(robot, 'SET_STATE')
  const standState = robot.robot_type === 'wheel' ? 'ready' : 'balance_stand'

  return (
    <>
      <ActionButton
        icon={PersonStanding}
        label="Stand"
        availability={availability}
        onClick={() => onSetState(standState, 'Stand')}
      />
      <ActionButton
        icon={Armchair}
        label="Sit"
        availability={availability}
        onClick={() => onSetState('stand_down', 'Sit')}
      />
    </>
  )
}
