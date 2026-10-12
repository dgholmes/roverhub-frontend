import { RobotTypeBadge } from '@/components/common/RobotTypeBadge'
import { REACHABILITY_LABELS_SHORT, reachabilityOf } from '@/lib/connectivityHealth'
import { color, font, radius, space } from '@/design-system/tokens'
import { batteryLevelColor, formatBatteryPercent } from '@/liveops/batteryDisplay'
import { stateVisualFor } from '@/liveops/stateDisplay'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'

/** Left-rail robot list — selecting a robot here stays in sync with
 * RobotSelector in the TopBar (shared selectedRobotId in useSessionStore). */
export function RobotList() {
  const robots = useLiveOpsStore((s) => s.robots)
  const selectedRobotId = useSessionStore((s) => s.selectedRobotId)
  const setSelectedRobot = useSessionStore((s) => s.setSelectedRobot)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {robots.map((r) => {
        const isSelected = r.robot_id === selectedRobotId
        const v = stateVisualFor(r.abstract_state, r.sdk_state)
        // Three distinct situations, previously collapsed into two. A healthy
        // bridge reporting an unreachable robot means "the robot is switched
        // off", not "the edge is broken" -- and the state we hold for it is
        // last-known, so labelling it "Standing" asserts something untrue.
        const reachability = reachabilityOf(r)
        const online = reachability === 'online'
        return (
          <button
            key={r.robot_id}
            onClick={() => setSelectedRobot(r.robot_id)}
            aria-current={isSelected ? 'true' : undefined}
            style={{
              display: 'flex', alignItems: 'center', gap: space[2] + 2,
              padding: `${space[2]}px ${space[2]}px`, borderRadius: radius.sm + 1,
              background: isSelected ? color.selected : 'transparent',
              border: 'none', fontFamily: font.family,
              cursor: 'pointer', textAlign: 'left', width: '100%',
            }}
          >
            <span style={{
              width: 7, height: 7, borderRadius: radius.full, flexShrink: 0,
              background: online ? v.color : color.t3,
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {r.name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                <span style={{
                  fontSize: font.size.sm, color: online ? v.color : color.amber,
                  whiteSpace: 'nowrap',
                }}>
                  {online ? v.label : REACHABILITY_LABELS_SHORT[reachability]}
                </span>
                {/* Variant matters when picking a robot: the control surface
                    differs between point-foot and wheel-foot units. */}
                <RobotTypeBadge robotType={r.robot_type} size="sm" />
              </div>
            </div>
            {/* Battery in the primary robot picker was 10px in the lowest-
                contrast token, and — unlike FleetTable — was not colour-coded
                at all, so a robot at 8% looked identical to one at 98%.
                docs/audit/2026-08-12-ui-ux-audit.md A-19. */}
            <div style={{
              fontSize: font.size.md, fontWeight: font.weight.semibold,
              color: batteryLevelColor(r.battery.percent), flexShrink: 0,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {formatBatteryPercent(r.battery.percent)}
            </div>
          </button>
        )
      })}
    </div>
  )
}
