import { CloudOff } from 'lucide-react'
import { color, font, radius } from '@/design-system/tokens'
import { reachabilityLabel, type RobotReachability } from '@/lib/connectivityHealth'
import i18n from '@/i18n'

/**
 * Marks a state readout as last-known rather than current.
 *
 * When the robot is powered off the edge bridge stays healthy and keeps
 * republishing its last successful snapshot, so `abstract_state` freezes at
 * whatever the robot was doing when it went away. Rendering that bare — a
 * confident green "Standing" for a robot sitting switched off in the corner —
 * is worse than showing nothing, because it reads as live.
 *
 * Deliberately amber rather than red: the robot being off is usually intended,
 * and red is reserved for FAULT and E-Stop, which are conditions to act on.
 */
export function LastKnownBadge({ reachability }: { reachability: RobotReachability }) {
  if (reachability === 'online') return null
  return (
    <span
      title={i18n.t('misc.lastKnownTitle', { reason: reachabilityLabel(reachability) })}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
        height: 22, padding: '0 7px', borderRadius: radius.xs + 1,
        background: color.amberBg,
        border: `1px solid ${color.amberBorder}`,
        color: color.amber,
        fontSize: font.size.xs,
        fontWeight: font.weight.semibold,
        fontFamily: font.family,
        whiteSpace: 'nowrap',
      }}
    >
      <CloudOff size={12} strokeWidth={2} />
      {reachabilityLabel(reachability)}
    </span>
  )
}
