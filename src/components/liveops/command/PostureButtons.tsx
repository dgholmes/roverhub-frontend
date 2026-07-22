import { Armchair, PersonStanding } from 'lucide-react'
import { getCommandAvailability } from '@/liveops/commandPolicy'
import type { RobotState } from '@/types'
import { ActionButton } from '../mission/ActionButton'

/**
 * Posture control — Stand / Sit, wired through the existing SET_STATE
 * command (shared/schemas/commands.py is the source of truth for the
 * command surface; `params: {state: <name>}`). `balance_stand` and
 * `stand_down` are the two posture states common to both the quad and
 * wheel SDK FSMs (docs/03-sdk-integration.md §7.1/§7.2), so — unlike the
 * quick-action gestures — this group is never hidden for wheel robots.
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

  return (
    <>
      <ActionButton
        icon={PersonStanding}
        label="Stand"
        availability={availability}
        onClick={() => onSetState('balance_stand', 'Stand')}
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
