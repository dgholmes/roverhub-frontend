import { ChevronRight } from 'lucide-react'
import { color, font, glass, radius, space } from '@/design-system/tokens'
import { hashForSiteWorkspace } from '@/app/routes'
import { LastKnownBadge } from '@/components/common/LastKnownBadge'
import { Pill } from '@/components/common/Pill'
import { RobotTypeBadge } from '@/components/common/RobotTypeBadge'
import { StatePill } from '@/components/common/StatePill'
import { EstimatedBadge } from '@/components/common/EstimatedBadge'
import { StaleBadge } from '@/components/common/StaleBadge'
import { BatteryStatus } from '@/components/liveops/rail/BatteryStatus'
import { NetworkStatus } from '@/components/liveops/rail/NetworkStatus'
import { BridgeStatus } from '@/components/liveops/rail/BridgeStatus'
import { SdkStatus } from '@/components/liveops/rail/SdkStatus'
import { batteryLevelColor, formatBatteryPercent } from '@/liveops/batteryDisplay'
import { reachabilityOf } from '@/lib/connectivityHealth'
import { compassLabel } from '@/liveops/waypointGeometry'
import { useSessionStore } from '@/store/useSessionStore'
import type { RobotState } from '@/types'

/**
 * Cockpit mode collapses the left rail (docs/05-ui-ux.md §3: "cannot be
 * collapsed in any view mode except Cockpit, where it merges into the map
 * overlay"). This panel carries everything the rail would otherwise show —
 * state, vitals, and link status — as a single floating card on the map.
 */
export function CockpitStatusOverlay({ robot }: { robot: RobotState }) {
  const activeSiteId = useSessionStore((s) => s.activeSiteId)
  const heading = Math.round(robot.position.heading_deg)

  return (
    <div style={{
      position: 'absolute', top: 12, left: 12, zIndex: 900, width: 240,
      ...glass.overlay, borderRadius: radius.md, padding: space[3],
      display: 'flex', flexDirection: 'column', gap: space[3],
    }}>
      {/* Same pairing as TelemetryOverlay: variant beside state, since it's an
          identity fact rather than a live reading. Cockpit mode collapses the
          rail, so this panel is the only place it would otherwise appear. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <StatePill state={robot.abstract_state} sdkState={robot.sdk_state} />
        <RobotTypeBadge robotType={robot.robot_type} />
        <LastKnownBadge reachability={reachabilityOf(robot)} />
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <Pill label="Speed" value={`${robot.speed_mps.toFixed(1)} m/s`} />
        <Pill label="Heading" value={`${heading}° ${compassLabel(heading)}`} />
        <Pill label="Gait" value={robot.gait.replace('_', ' ')} dot={color.accent} />
        <Pill
          label="Battery"
          value={formatBatteryPercent(robot.battery.percent)}
          dot={batteryLevelColor(robot.battery.percent)}
        />
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
              : <EstimatedBadge compact quality={robot.position.quality} />}
          </div>
        </div>
      </div>

      <div style={{ height: 1, background: 'rgba(255,255,255,0.08)' }} />

      <BatteryStatus battery={robot.battery} />
      <NetworkStatus connectivity={robot.connectivity} />
      <BridgeStatus connectivity={robot.connectivity} />
      <SdkStatus connectivity={robot.connectivity} />

      <a
        href={hashForSiteWorkspace(activeSiteId, 'Fleet')}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontSize: font.size.xs, color: color.t2, textDecoration: 'none',
          paddingTop: space[1], borderTop: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        View full device details
        <ChevronRight size={11} strokeWidth={2} />
      </a>
    </div>
  )
}
