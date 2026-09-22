import { useState } from 'react'
import { Armchair, LifeBuoy, PersonStanding, PowerOff } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { color, font, radius } from '@/design-system/tokens'
import { getCommandAvailability } from '@/liveops/commandPolicy'
import { contextualRecoveryActionFor, postureActionsFor, type PostureAction } from '@/liveops/postureModel'
import type { RobotState } from '@/types'
import { ActionButton } from '../mission/ActionButton'

/**
 * Posture control — Stand / Sit / Passive, wired through the existing SET_STATE
 * command (shared/schemas/commands.py is the source of truth for the command
 * surface; `params: {state: <name>}`).
 *
 * Targets come from `postureActionsFor(robot.robot_type)` rather than a local
 * ternary, so the per-type FSM facts live in one place
 * (shared/schemas/robot_capabilities.py and its TS mirror). Stand is
 * `balance_stand` on quad and `wheel_loco` on wheel; Sit and Passive are
 * `stand_down` and `passive` on both.
 *
 * ⚠️ Stand previously dispatched `ready` for wheel robots, because
 * docs/03-sdk-integration.md §7.2 described `ready` as "controller active,
 * wheels down". The vendored SDK says 缓慢趴下（安全停止） — a slow lie-down used
 * as a safe stop. So the Stand button was telling wheel robots to lie down,
 * which in turn made Sit appear to do nothing (the robot was already down).
 * Do not reintroduce `ready` here; it is a warm-up/safe-stop step only.
 *
 * Passive de-energises the motors, so it gets a confirm dialog — the robot
 * drops rather than lowering itself if it isn't already sitting. Same pattern
 * as MovementDiagnosticsSection's Change Mode confirmation.
 *
 * Always rendered regardless of mission state (per dispatch: "always visible"),
 * same as the mission-action button row in CurrentTaskBar — availability
 * (enabled vs. disabled-with-reason) is still governed by commandPolicy.
 *
 * Get Up appears here only while the bridge reports posture 'fallen'. It is
 * deliberately NOT in QuickActionsMenu: that popover holds novelty gestures,
 * and the action you need after a fall must not sit beside Dance and Backflip.
 * The permanent counterpart lives in Fleet > Diagnostics > Movement for when
 * detection is unavailable (no IMU) or misses.
 */
const ICONS = {
  Stand: PersonStanding,
  Sit: Armchair,
  Passive: PowerOff,
} as const

export function PostureButtons({
  robot, onSetState,
}: {
  robot: RobotState
  onSetState: (state: string, label: string) => void
}) {
  const availability = getCommandAvailability(robot, 'SET_STATE')
  const [pending, setPending] = useState<PostureAction | null>(null)
  const actions = postureActionsFor(robot.robot_type)
  const recoveryAction = contextualRecoveryActionFor(robot)

  return (
    <>
      {actions.map((action) => (
        <ActionButton
          key={action.label}
          icon={ICONS[action.label as keyof typeof ICONS] ?? PersonStanding}
          label={action.label}
          availability={availability}
          onClick={() => {
            if (action.requiresConfirmation) setPending(action)
            else onSetState(action.state, action.label)
          }}
        />
      ))}

      {recoveryAction && (
        <ActionButton
          icon={LifeBuoy}
          label={recoveryAction.label}
          availability={availability}
          onClick={() => onSetState(recoveryAction.state, recoveryAction.label)}
        />
      )}

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent style={{ background: color.elevated, border: `1px solid ${color.border}`, color: color.t1 }}>
          <DialogHeader>
            <DialogTitle style={{ color: color.red }}>Confirm {pending?.label}</DialogTitle>
            <DialogDescription style={{ color: color.t2 }}>
              {pending?.confirmation}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              onClick={() => {
                if (pending) onSetState(pending.state, pending.label)
                setPending(null)
              }}
              style={{
                padding: '8px 16px', borderRadius: radius.md, background: color.red, border: 'none',
                color: '#fff', fontWeight: font.weight.bold, cursor: 'pointer', fontFamily: font.family,
              }}
            >
              Confirm {pending?.label}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
