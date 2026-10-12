import { useRef, useState } from 'react'
import {
  Battery, Camera, Clock, Compass, Cpu, Footprints, Gauge, HardDrive,
  Layers, Lightbulb, MapPin, Mic, Power, Radio, RotateCw, ShieldAlert, ShieldCheck, Waves, Wifi, X,
} from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { EstimatedBadge } from '@/components/common/EstimatedBadge'
import { StaleBadge } from '@/components/common/StaleBadge'
import { stateVisualFor } from '@/liveops/stateDisplay'
import { batteryLevelColor, formatBatteryPercent } from '@/liveops/batteryDisplay'
import { getFleetReadiness } from '@/liveops/fleetReadiness'
import { useSessionStore } from '@/store/useSessionStore'
import { hashForSiteWorkspace } from '@/app/routes'
import { mockDiagnostics } from '@/mocks/mockDiagnostics'
import type { EdgeBridge, FleetRobotDetail, RobotState, SensorHealthState } from '@/types'
import { ReadinessBadge } from './ReadinessBadge'
import { DeviceSection } from './DeviceSection'
import { StatTile } from './StatTile'
import { MaintenancePanel } from './MaintenancePanel'
import { DiagnosticsPanel } from './diagnostics/DiagnosticsPanel'

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (sec < 60) return `${sec}s ago`
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`
  return `${Math.round(sec / 86400)}d ago`
}

const SENSOR_STATE_COLOR: Record<SensorHealthState, string> = {
  ok: color.green, degraded: color.amber, fault: color.red, unsupported: color.t3,
}
const SENSOR_STATE_LABEL: Record<SensorHealthState, string> = {
  ok: 'OK', degraded: 'Degraded', fault: 'Fault', unsupported: 'N/A',
}
const SENSOR_ICON = { rgb_camera: Camera, depth_camera: Camera, imu: Waves, motor: Cpu, led: Lightbulb, voice: Mic } as const

/**
 * Wide, grid-based device dashboard (docs/05-ui-ux.md §10.2) — restyled per
 * operator feedback to read like a device-maintenance panel (icon+value+label
 * tiles per device) rather than a scrolling article of stacked text rows.
 */
export function DeviceDetailDrawer({
  robot, detail, bridge, onClose,
}: {
  robot: RobotState
  detail?: FleetRobotDetail
  bridge?: EdgeBridge
  onClose: () => void
}) {
  const sites = useSessionStore((s) => s.sites)
  const siteName = sites.find((s) => s.id === robot.site_id)?.name ?? robot.site_id
  // Stay inside the site the operator is already in.
  const activeSiteId = useSessionStore((s) => s.activeSiteId) ?? robot.site_id
  const readiness = getFleetReadiness(robot)
  const robotStateVisual = stateVisualFor(robot.abstract_state, robot.sdk_state)
  const bridgeSectionRef = useRef<HTMLDivElement>(null)
  const [drawerTab, setDrawerTab] = useState<'overview' | 'diagnostics'>('overview')
  const diagnostics = mockDiagnostics[robot.robot_id]

  const heading = Math.round(robot.position.heading_deg)

  return (
    <>
      {/* Scoped to FleetWorkspace's own box (position: relative), not the
          viewport — a fixed/inset:0 backdrop would cover the persistent
          WorkspaceSidebar too, blocking workspace navigation and the Alerts
          button while the drawer is open. */}
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: color.scrim, zIndex: 1000 }} />
      <div style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(860px, 92vw)', zIndex: 1001,
        background: color.bg, borderLeft: `1px solid ${color.border}`,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: `${space[4]}px ${space[5]}px`, borderBottom: `1px solid ${color.border}`, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2] }}>
            <span style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.t1 }}>Device Detail</span>
            <span style={{ fontSize: font.size.sm, color: color.t3 }}>
              Site: <span style={{ color: color.accent }}>{siteName}</span>
            </span>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'transparent', border: 'none', color: color.t3, cursor: 'pointer', padding: 4 }}>
            <X size={18} />
          </button>
        </div>

        {/* Always shown -- Movement/Balance diagnostics dispatch real
            commands against `robot` alone and don't depend on mock hardware-
            diagnostics data existing for this robot_id (see
            DiagnosticsPanel.tsx's tabsFor). Previously gated behind
            `diagnostics` truthiness, which hid this entire tab bar (and the
            real Movement/Balance controls with it) for any robot without a
            mockDiagnostics entry -- e.g. the real dev robot. */}
        <div style={{ display: 'flex', gap: space[1], padding: `${space[2]}px ${space[5]}px 0`, borderBottom: `1px solid ${color.border}`, flexShrink: 0 }}>
          {(['overview', 'diagnostics'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setDrawerTab(t)}
              style={{
                padding: '8px 14px', borderRadius: `${radius.sm}px ${radius.sm}px 0 0`, fontSize: font.size.sm,
                fontFamily: font.family, textTransform: 'capitalize',
                background: drawerTab === t ? color.surface : 'transparent',
                border: `1px solid ${drawerTab === t ? color.border : 'transparent'}`,
                borderBottom: drawerTab === t ? `1px solid ${color.surface}` : '1px solid transparent',
                marginBottom: -1,
                color: drawerTab === t ? color.t1 : color.t3, fontWeight: drawerTab === t ? font.weight.semibold : font.weight.regular,
                cursor: 'pointer',
              }}
            >
              {t}
            </button>
          ))}
        </div>

        {drawerTab === 'diagnostics' ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: space[5] }}>
            <DiagnosticsPanel diagnostics={diagnostics} robot={robot} />
          </div>
        ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: space[5], display: 'flex', flexDirection: 'column', gap: space[4] }}>
          <DeviceSection
            title={robot.name}
            image="./rover.png"
            statusColor={robotStateVisual.color}
            statusLabel={robotStateVisual.label}
            badge={<ReadinessBadge readiness={readiness} />}
            identityLines={[
              { label: 'ID', value: robot.robot_id },
              ...(detail ? [{ label: 'Serial', value: detail.serial }] : []),
            ]}
            linkedRows={[
              ...(bridge ? [{
                label: 'Assigned Bridge', value: bridge.name,
                onClick: () => bridgeSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
              }] : []),
              // `#/data` matched no route, so this chevroned row ejected the
              // operator out of the site entirely and onto the org placeholder,
              // mid-investigation. docs/audit/2026-08-12-ui-ux-audit.md A-33.
              {
                label: 'Sessions in Data', value: '',
                onClick: () => { window.location.hash = hashForSiteWorkspace(activeSiteId, 'Data') },
              },
            ]}
          >
            <StatTile icon={Battery} value={formatBatteryPercent(robot.battery.percent)} label="Battery" valueColor={batteryLevelColor(robot.battery.percent)} />
            <StatTile icon={Gauge} value={`${robot.speed_mps.toFixed(1)} m/s`} label="Speed" />
            <StatTile icon={Compass} value={`${heading}°`} label="Heading" />
            <StatTile icon={Footprints} value={robot.gait.replace('_', ' ')} label="Gait" />

            <StatTile icon={Clock} value={`${Math.round(robot.battery.est_runtime_min)}m`} label="Est. Runtime" />
            {detail && <StatTile icon={RotateCw} value={detail.battery_cycles} label="Battery Cycles" />}
            {detail && (
              <StatTile
                icon={ShieldCheck} value={detail.bms_state} label="BMS State"
                valueColor={detail.bms_state === 'nominal' ? color.green : detail.bms_state === 'warning' ? color.amber : color.red}
              />
            )}
            <StatTile icon={MapPin} value={`${robot.position.x_m.toFixed(1)}, ${robot.position.y_m.toFixed(1)}`} label="Position (m)" />

            {detail && <StatTile icon={HardDrive} value={detail.firmware_version} label="Firmware" />}
            {detail && <StatTile icon={Layers} value={detail.sdk_version} label="SDK Version" />}
            <StatTile icon={Radio} value={timeAgo(robot.updated_at)} label="Last Telemetry" />
            <StatTile
              icon={robot.obstacle_avoidance ? ShieldCheck : ShieldAlert}
              value={robot.obstacle_avoidance ? 'On' : 'Off'}
              label="Obstacle Avoid."
              valueColor={robot.obstacle_avoidance ? color.green : color.amber}
            />

            {detail?.sensors.map((s) => (
              <StatTile
                key={s.sensor}
                icon={SENSOR_ICON[s.sensor]}
                value={SENSOR_STATE_LABEL[s.state]}
                label={s.label}
                valueColor={SENSOR_STATE_COLOR[s.state]}
              />
            ))}
          </DeviceSection>

          <div style={{ display: 'flex', gap: space[2], padding: `0 ${space[1]}px` }}>
            <EstimatedBadge quality={robot.position.quality} />
            {robot.position.freshness !== 'live' && <StaleBadge freshness={robot.position.freshness} updatedAt={robot.position.updated_at} />}
          </div>

          {bridge && (
            <div ref={bridgeSectionRef}>
              <DeviceSection
                title={bridge.name}
                icon={<Cpu size={40} color={color.t3} strokeWidth={1.3} />}
                statusColor={bridge.cloud_connection === 'connected' ? color.green : bridge.cloud_connection === 'reconnecting' ? color.amber : color.red}
                statusLabel={bridge.cloud_connection === 'connected' ? 'Online' : bridge.cloud_connection === 'reconnecting' ? 'Reconnecting' : 'Offline'}
                identityLines={[
                  { label: 'IP', value: bridge.ip_address },
                  { label: 'OS', value: bridge.host_os },
                ]}
                linkedRows={[{ label: 'Assigned Robot', value: robot.name }]}
              >
                <StatTile icon={Wifi} value={bridge.cloud_connection === 'connected' ? 'Connected' : bridge.cloud_connection} label="Cloud Uplink" valueColor={bridge.cloud_connection === 'connected' ? color.green : color.red} />
                <StatTile icon={Radio} value={timeAgo(bridge.last_heartbeat)} label="Last Heartbeat" />
                <StatTile icon={Waves} value={bridge.dds_status === 'connected' ? 'Connected' : 'Unavailable'} label="DDS" valueColor={bridge.dds_status === 'connected' ? color.green : color.red} />
                <StatTile icon={Layers} value={bridge.grpc_status === 'connected' ? 'Connected' : bridge.grpc_status} label="gRPC" valueColor={bridge.grpc_status === 'connected' ? color.green : bridge.grpc_status === 'degraded' ? color.amber : color.red} />
                <StatTile icon={HardDrive} value={bridge.software_version} label="Software Ver." />
                <StatTile icon={Power} value={timeAgo(bridge.last_restart_at)} label="Last Restart" />
              </DeviceSection>
            </div>
          )}

          <div style={{ background: color.surface, border: `1px solid ${color.border}`, borderRadius: radius.md, padding: space[4] }}>
            <div style={{
              fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.t3,
              letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: space[3],
            }}>
              Maintenance
            </div>
            <MaintenancePanel log={detail?.maintenance_log ?? []} maintenanceFlagged={robot.maintenance_flagged} />
          </div>
        </div>
        )}
      </div>
    </>
  )
}
