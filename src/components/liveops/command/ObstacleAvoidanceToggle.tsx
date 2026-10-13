import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { DisabledReasonButton } from '@/components/common/DisabledReason'
import { CommandFace, commandButtonStyle } from '../mission/ActionButton'
import { getCommandAvailability } from '@/liveops/commandPolicy'
import type { RobotState } from '@/types'

/**
 * Obstacle avoidance toggle — wired through the existing
 * SET_OBSTACLE_AVOIDANCE command (`params: {enabled: boolean}`). Previously
 * only reachable inside ManualControlOverlay (gated on abstract_state ===
 * 'MANUAL'/'ASSISTED'), which made it practically unreachable: nothing in
 * the real pipeline transitions a robot into MANUAL/ASSISTED as a side
 * effect of TAKE_CONTROL (abstract_state is derived purely from the SDK's
 * own reported gait state), so the toggle could never be opened from a
 * Standing robot. Added directly to the command panel instead, always
 * visible, matching commandPolicy.ts's now-ungated availability for this
 * command (a general safety setting, not manual-control-only).
 */
export function ObstacleAvoidanceToggle({
  robot, onToggle,
}: {
  robot: RobotState
  onToggle: (enabled: boolean) => void
}) {
  const { t } = useTranslation()
  const availability = getCommandAvailability(robot, 'SET_OBSTACLE_AVOIDANCE')
  const enabled = robot.obstacle_avoidance

  return (
    <DisabledReasonButton
      enabled={availability.enabled}
      reason={availability.reason}
      onClick={() => onToggle(!enabled)}
      aria-pressed={enabled}
      title={enabled ? t('command.avoidance.onTitle') : t('command.avoidance.offTitle')}
      style={commandButtonStyle(enabled ? 'green' : 'default')}
    >
      <CommandFace icon={enabled ? ShieldCheck : ShieldAlert} label={enabled ? t('command.avoidance.on') : t('command.avoidance.off')} />
    </DisabledReasonButton>
  )
}
