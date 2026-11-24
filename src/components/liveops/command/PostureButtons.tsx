import { useState } from 'react'
import { Armchair, LifeBuoy, OctagonPause, PersonStanding } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { color } from '@/design-system/tokens'
import { Button } from '@/components/kit'
import { getCommandAvailability } from '@/liveops/commandPolicy'
import type { RobotRunView } from '@/liveops/robotRun'
import { applicablePostureActions } from '@/liveops/postureContext'
import { type PostureAction } from '@/liveops/postureModel'
import type { RobotState } from '@/types'
import { ActionButton } from '../mission/ActionButton'

/**
 * Posture control — Stand / Sit / Safe stop, wired through the existing SET_STATE
 * command (shared/schemas/commands.py is the source of truth for the command
 * surface; `params: {state: <name>}`).
 *
 * The set is **contextual**: `applicablePostureActions(robot)` returns only the
 * actions that can apply to the robot right now — Stand alone while it is
 * down, Sit and Safe stop while it is up, Get up alone while it has fallen.
 * Stand and Sit are mutually exclusive by construction, which is what lets the
 * deck give them one slot: the row's width does not change when the robot
 * stands up (design 2026-11-24 §6.4).
 *
 * ⚠️ An **unrecognised `sdk_state` draws all three**, deliberately. A state
 * this build does not know is exactly when the operator needs Stand, Sit and
 * Safe stop, so a missing entry in a state table degrades to "offer the
 * controls", never to "remove them" — the same mistake in the bridge's
 * `ACTIVE_MOTION_SDK_STATES` presented as "the robot is faulty and most of my
 * controls are gone".
 *
 * Hiding a control means *it cannot apply*. It never means *refused right
 * now*: that case stays `getCommandAvailability`'s, which draws the button
 * disabled with its reason. A robot low on battery still shows Stand, greyed,
 * saying why — so nothing is hidden for a recoverable reason.
 *
 * Targets come from `postureActionsFor(robot.robot_type)`, which
 * `postureContext.ts` filters, rather than a local ternary — so the per-type
 * FSM facts live in one place (shared/schemas/robot_capabilities.py and its TS
 * mirror). Stand is `balance_stand` on quad and `wheel_loco` on wheel; Sit and
 * Safe stop are `stand_down` and `ready` on both.
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
 * Availability (enabled vs. disabled-with-reason) is still governed entirely by
 * commandPolicy: every button gets its own `getCommandAvailability` call, and
 * nothing here hides a button because it is disabled.
 *
 * Get Up appears here only while the bridge reports posture 'fallen', and only
 * on robot types whose FSM has a `recovery` state (quad, not wheel) — that is
 * `applicablePostureActions`' `fallen` phase, which returns it as the whole set
 * rather than as a fourth button. It is deliberately NOT in QuickActionsMenu:
 * that popover holds novelty gestures, and the action you need after a fall
 * must not sit beside Dance and Backflip. The permanent counterpart is the Get
 * up button in Fleet's robot header, for when detection is unavailable (no IMU)
 * or misses.
 */
const ICONS: Record<PostureAction['kind'], React.ElementType> = {
  stand: PersonStanding,
  sit: Armchair,
  safeStop: OctagonPause,
  recovery: LifeBuoy,
}

export function PostureButtons({
  robot, run, onSetState,
}: {
  robot: RobotState
  /** The robot's edge mission run, so posture is blocked while it runs. */
  run?: RobotRunView
  onSetState: (state: string, label: string) => void
}) {
  const { t } = useTranslation()
  const [pending, setPending] = useState<PostureAction | null>(null)
  const actions = applicablePostureActions(robot)

  return (
    <>
      {actions.map((action) => (
        <ActionButton
          key={action.kind}
          icon={ICONS[action.kind]}
          label={action.label}
          availability={getCommandAvailability(robot, 'SET_STATE', run, { state: action.state })}
          onClick={() => {
            if (action.requiresConfirmation) setPending(action)
            else onSetState(action.state, action.label)
          }}
        />
      ))}

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
