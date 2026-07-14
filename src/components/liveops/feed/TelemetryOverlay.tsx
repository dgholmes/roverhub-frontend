import { color, font, glass, radius, space } from '@/design-system/tokens'
import { EstimatedBadge } from '@/components/common/EstimatedBadge'
import { StaleBadge } from '@/components/common/StaleBadge'
import { Pill } from '@/components/common/Pill'
import { StatePill } from '@/components/common/StatePill'
import { batteryLevelColor } from '@/components/liveops/rail/BatteryStatus'
import { compassLabel } from '@/liveops/waypointGeometry'
import type { RobotState } from '@/types'

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
        {/* Coordinate readout (docs/05-ui-ux.md §7.1 explicitly requires the
            estimated badge here) — previously the badge floated with nothing
            to attach to (LIVEOPS_AUDIT_TRACKER.md 4.4). */}
        <div style={{ ...glass.overlay, borderRadius: 6, padding: '5px 10px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: font.size['2xs'], color: 'rgba(255,255,255,0.38)', fontWeight: font.weight.medium, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            Position
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1 }}>
              {robot.position.x_m.toFixed(1)}, {robot.position.y_m.toFixed(1)} m
            </span>
            {robot.position.freshness !== 'live'
              ? <StaleBadge freshness={robot.position.freshness} updatedAt={robot.position.updated_at} />
              : <EstimatedBadge compact />}
          </div>
        </div>
      </div>
    </div>
  )
}
