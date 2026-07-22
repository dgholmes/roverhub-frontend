import { ShieldAlert, ShieldCheck } from 'lucide-react'
import { color, font, layout, radius } from '@/design-system/tokens'
import { DisabledReasonButton } from '@/components/common/DisabledReason'
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
  const availability = getCommandAvailability(robot, 'SET_OBSTACLE_AVOIDANCE')
  const enabled = robot.obstacle_avoidance

  return (
    <DisabledReasonButton
      enabled={availability.enabled}
      reason={availability.reason}
      onClick={() => onToggle(!enabled)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 4, height: layout.actionBtnHeight, minWidth: 64, padding: '0 14px',
        background: color.card, border: `1px solid ${enabled ? color.greenBorder : color.border}`,
        borderRadius: radius.md, color: enabled ? color.green : color.t2, fontFamily: font.family, flexShrink: 0,
      }}
    >
      {enabled ? <ShieldCheck size={16} strokeWidth={1.6} /> : <ShieldAlert size={16} strokeWidth={1.6} />}
      <span style={{ fontSize: font.size.xs, fontWeight: font.weight.semibold, whiteSpace: 'nowrap' }}>
        Obstacle Avoid.
      </span>
    </DisabledReasonButton>
  )
}
