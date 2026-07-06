import { color, glass, radius, space } from '@/design-system/tokens'
import { Pill } from '@/legacy/liveops-v1/common/Pill'
import { StatePill } from '@/legacy/liveops-v1/common/StatePill'
import { EstimatedBadge } from '@/legacy/liveops-v1/common/EstimatedBadge'
import { BatteryStatus } from '@/legacy/liveops-v1/rail/BatteryStatus'
import { NetworkStatus } from '@/legacy/liveops-v1/rail/NetworkStatus'
import { BridgeStatus } from '@/legacy/liveops-v1/rail/BridgeStatus'
import { SdkStatus } from '@/legacy/liveops-v1/rail/SdkStatus'
import { batteryLevelColor } from '@/legacy/liveops-v1/rail/BatteryStatus'
import { compassLabel } from '@/legacy/liveops-v1/liveops/waypointGeometry'
import type { RobotState } from '@/legacy/liveops-v1/types'

/**
 * Cockpit mode collapses the left rail (docs/05-ui-ux.md §3: "cannot be
 * collapsed in any view mode except Cockpit, where it merges into the map
 * overlay"). This panel carries everything the rail would otherwise show —
 * state, vitals, and link status — as a single floating card on the map.
 */
export function CockpitStatusOverlay({ robot }: { robot: RobotState }) {
  const heading = Math.round(robot.position.heading_deg)

  return (
    <div style={{
      position: 'absolute', top: 12, left: 12, zIndex: 900, width: 240,
      ...glass.overlay, borderRadius: radius.md, padding: space[3],
      display: 'flex', flexDirection: 'column', gap: space[3],
    }}>
      <StatePill state={robot.abstract_state} />

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Pill label="Speed" value={`${robot.speed_mps.toFixed(1)} m/s`} />
        <Pill label="Heading" value={`${heading}° ${compassLabel(heading)}`} />
        <Pill label="Gait" value={robot.gait.replace('_', ' ')} dot={color.accent} />
        <Pill
          label="Battery"
          value={`${robot.battery.percent}%`}
          dot={batteryLevelColor(robot.battery.percent)}
        />
        <div style={{ ...glass.overlay, borderRadius: 6, padding: '5px 10px', display: 'flex', alignItems: 'center' }}>
          <EstimatedBadge compact />
        </div>
      </div>

      <div style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />

      <BatteryStatus battery={robot.battery} />
      <NetworkStatus connectivity={robot.connectivity} />
      <BridgeStatus connectivity={robot.connectivity} />
      <SdkStatus connectivity={robot.connectivity} />
    </div>
  )
}
