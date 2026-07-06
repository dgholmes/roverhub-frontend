import { color, glass, radius, space } from '@/design-system/tokens'
import { EstimatedBadge } from '@/legacy/liveops-v1/common/EstimatedBadge'
import { Pill } from '@/legacy/liveops-v1/common/Pill'
import { StatePill } from '@/legacy/liveops-v1/common/StatePill'
import { batteryLevelColor } from '@/legacy/liveops-v1/rail/BatteryStatus'
import { compassLabel } from '@/legacy/liveops-v1/liveops/waypointGeometry'
import type { RobotState } from '@/legacy/liveops-v1/types'

/**
 * Live vitals HUD — the ground-robot equivalent of a drone feed's battery/
 * speed/heading overlay. Distinct from the left rail's link-status rows
 * (docs/05-ui-ux.md §1.4 — no duplicated content across regions; that detail
 * lives in the rail, not repeated here). Stays on top regardless of whether
 * the camera feed or the map is the hero view, so state is always the
 * topmost visual element (§18.1). All position values still carry
 * `estimated` regardless of space (§18.4).
 *
 * Wrapped in one unifying card (matching CockpitStatusOverlay's framing)
 * rather than a loose StatePill + individually-glassy pills — the same data
 * read as visually incomplete without a frame tying it together.
 */
export function TelemetryOverlay({ robot }: { robot: RobotState }) {
  const heading = Math.round(robot.position.heading_deg)

  return (
    <div style={{
      position: 'absolute', top: 12, left: 12, zIndex: 900, width: 240,
      ...glass.overlay, borderRadius: radius.md, padding: space[3],
      display: 'flex', flexDirection: 'column', gap: space[3],
    }}>
      <StatePill state={robot.abstract_state} />
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Pill
          label="Battery"
          value={`${robot.battery.percent}%`}
          dot={batteryLevelColor(robot.battery.percent)}
        />
        <Pill label="Speed" value={`${robot.speed_mps.toFixed(1)} m/s`} />
        <Pill label="Heading" value={`${heading}° ${compassLabel(heading)}`} />
        <Pill label="Gait" value={robot.gait.replace('_', ' ')} dot={color.accent} />
        <Pill
          label="Obstacle Avoid."
          value={robot.obstacle_avoidance ? 'On' : 'Off'}
          dot={robot.obstacle_avoidance ? color.green : color.amber}
        />
        <div style={{ ...glass.overlay, borderRadius: 6, padding: '5px 10px', display: 'flex', alignItems: 'center' }}>
          <EstimatedBadge compact />
        </div>
      </div>
    </div>
  )
}
