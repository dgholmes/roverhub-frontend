import { useState } from 'react'
import { Armchair, LifeBuoy, OctagonPause, PersonStanding } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { color } from '@/design-system/tokens'
import { Button } from '@/components/kit'
import { getCommandAvailability } from '@/liveops/commandPolicy'
import { contextualRecoveryActionFor, postureActionsFor, type PostureAction } from '@/liveops/postureModel'
import type { RobotState } from '@/types'
import { ActionButton } from '../mission/ActionButton'

/**
 * Posture control — Stand / Sit / Safe stop, wired through the existing SET_STATE
 * command (shared/schemas/commands.py is the source of truth for the command
 * surface; `params: {state: <name>}`).
 *
 * Targets come from `postureActionsFor(robot.robot_type)` rather than a local
 * ternary, so the per-type FSM facts live in one place
 * (shared/schemas/robot_capabilities.py and its TS mirror). Stand is
 * `balance_stand` on quad and `wheel_loco` on wheel; Sit and Safe stop are
 * `stand_down` and `ready` on both.
 *
 * ⚠️ Stand previously dispatched `ready` for wheel robots, because
 * docs/03-sdk-integration.md §7.2 described `ready` as "controller active,
 * wheels down". The vendored SDK says 缓慢趴下（安全停止） — a slow lie-down used
 * as a safe stop. So the Stand button was telling wheel robots to lie down,
 * which in turn made Sit appear to do nothing (the robot was already down).
 * Do not reintroduce `ready` here; it is a warm-up/safe-stop step only.
 *
 * ⚠️ There is no Passive button any more. `passive` is the robots' E-Stop
 * state on their current firmware: once there, no SDK command brings them
 * back, only the handheld remote (2026-10-26). The bridge refuses it, and E-Stop
 * is the one control that may send the robot there. The confirm dialog below
 * stays for any future action that sets `requiresConfirmation`.
 *
 * Always rendered regardless of mission state (per dispatch: "always visible"),
 * same as the mission-action button row in CurrentTaskBar — availability
 * (enabled vs. disabled-with-reason) is still governed by commandPolicy.
 *
 * Get Up appears here only while the bridge reports posture 'fallen', and only
 * on robot types whose FSM has a `recovery` state (quad, not wheel). It is
 * deliberately NOT in QuickActionsMenu: that popover holds novelty gestures,
 * and the action you need after a fall must not sit beside Dance and Backflip.
 * The permanent counterpart is the Get up button in Fleet's robot header, for when
 * detection is unavailable (no IMU) or misses.
 */
const ICONS: Record<PostureAction['kind'], React.ElementType> = {
  stand: PersonStanding,
  sit: Armchair,
  safeStop: OctagonPause,
  recovery: LifeBuoy,
}

export function PostureButtons({
  robot, onSetState,
}: {
  robot: RobotState
  onSetState: (state: string, label: string) => void
}) {
  const { t } = useTranslation()
  const availability = getCommandAvailability(robot, 'SET_STATE')
  const [pending, setPending] = useState<PostureAction | null>(null)
  const actions = postureActionsFor(robot.robot_type)
  const recoveryAction = contextualRecoveryActionFor(robot)

  return (
    <>
      {actions.map((action) => (
        <ActionButton
          key={action.kind}
          icon={ICONS[action.kind]}
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
          icon={ICONS.recovery}
          label={recoveryAction.label}
          availability={availability}
          onClick={() => onSetState(recoveryAction.state, recoveryAction.label)}
        />
      )}

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent style={{ background: color.elevated, border: `1px solid ${color.border}`, color: color.t1 }}>
          <DialogHeader>
            <DialogTitle>{t('command.posture.confirmTitle', { action: pending?.label ?? '' })}</DialogTitle>
            <DialogDescription style={{ color: color.t2 }}>
              {pending?.confirmation}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter style={{ gap: 8 }}>
            <Button onClick={() => setPending(null)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (pending) onSetState(pending.state, pending.label)
                setPending(null)
              }}
            >
              {pending?.label}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
