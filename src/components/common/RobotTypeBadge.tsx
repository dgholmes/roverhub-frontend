import { color, font, radius } from '@/design-system/tokens'
import { robotTypeLabel } from '@/lib/robotCapabilities'
import type { RobotType } from '@/types'

/**
 * Which physical variant a robot is — point-foot (quad) or wheel-foot
 * (miniQuadW). Worth showing wherever an operator picks or monitors a robot,
 * because the two have materially different control surfaces: wheel robots have
 * no balance/pose commands, a single gait, and their own canned motions.
 *
 * Read-only. Robot type is fixed hardware, reported by the SDK's
 * `get_robot_type()` with no setter RPC.
 *
 * Deliberately neutral in colour rather than semantic (green/amber/red): the
 * variant isn't a health signal, and colouring it would compete with the
 * StatePill and battery readouts it sits beside.
 */
export function RobotTypeBadge({ robotType, size = 'md' }: { robotType: RobotType | undefined; size?: 'sm' | 'md' }) {
  const compact = size === 'sm'
  return (
    <span
      title="Physical variant — fixed hardware, not a software setting"
      style={{
        display: 'inline-flex', alignItems: 'center', flexShrink: 0,
        height: compact ? 18 : 22, padding: compact ? '0 5px' : '0 7px',
        borderRadius: radius.xs + 1,
        background: color.hover,
        border: `1px solid ${color.border}`,
        color: color.t2,
        fontSize: compact ? font.size['2xs'] : font.size.xs,
        fontWeight: font.weight.medium,
        fontFamily: font.family,
        whiteSpace: 'nowrap',
      }}
    >
      {robotTypeLabel(robotType)}
    </span>
  )
}
