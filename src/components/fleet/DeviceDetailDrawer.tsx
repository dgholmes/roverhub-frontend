import { X } from 'lucide-react'
import { color, font, space } from '@/design-system/tokens'
import { StatePill } from '@/components/common/StatePill'
import { EstimatedBadge } from '@/components/common/EstimatedBadge'
import { StaleBadge } from '@/components/common/StaleBadge'
import { batteryLevelColor } from '@/components/liveops/rail/BatteryStatus'
import { getFleetReadiness } from '@/liveops/fleetReadiness'
import { useSessionStore } from '@/store/useSessionStore'
import type { EdgeBridge, FleetRobotDetail, RobotState } from '@/types'
import { ReadinessBadge } from './ReadinessBadge'
import { SensorHealthPanel } from './SensorHealthPanel'
import { MaintenancePanel } from './MaintenancePanel'

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ padding: `${space[4]}px 0`, borderBottom: `1px solid ${color.border}` }}>
      <div style={{
        fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.t3,
        letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: space[3],
      }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[3], padding: '3px 0' }}>
      <span style={{ fontSize: font.size.sm, color: color.t3 }}>{label}</span>
      <span style={{ fontSize: font.size.sm, color: color.t1, fontWeight: font.weight.medium, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

/**
 * Full-height slide-over opened from a FleetTable row (docs/05-ui-ux.md §10.2).
 * Belongs to Fleet only (docs/05-ui-ux.md §17 component ownership) — LiveOps
 * links here rather than duplicating this detail.
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
  const readiness = getFleetReadiness(robot)

  return (
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, background: 'rgba(8,8,10,0.55)', zIndex: 1000 }}
      />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 420, zIndex: 1001,
        background: color.surface, borderLeft: `1px solid ${color.border}`,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.4)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: `${space[4]}px ${space[5]}px`, borderBottom: `1px solid ${color.border}`, flexShrink: 0,
        }}>
          <div>
            <div style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.t1 }}>{robot.name}</div>
            <div style={{ fontSize: font.size.xs, color: color.t3, fontFamily: 'monospace' }}>{robot.robot_id}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{
            background: 'transparent', border: 'none', color: color.t3, cursor: 'pointer', padding: 4,
          }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: `0 ${space[5]}px` }}>
          <Section label="Identity">
            <Row label="Serial" value={detail?.serial ?? '—'} />
            <Row label="Site" value={siteName} />
            <Row label="Assigned bridge" value={bridge?.name ?? detail?.edge_bridge_id ?? '—'} />
          </Section>

          <Section label="State">
            <div style={{ marginBottom: space[2] }}><StatePill state={robot.abstract_state} /></div>
            <Row label="Last telemetry" value={new Date(robot.updated_at).toLocaleTimeString()} />
            <Row label="Readiness" value={<ReadinessBadge readiness={readiness} />} />
          </Section>

          <Section label="Hardware Status">
            <Row label="Battery" value={<span style={{ color: batteryLevelColor(robot.battery.percent) }}>{robot.battery.percent}% · {Math.round(robot.battery.est_runtime_min)}m runtime</span>} />
            <Row label="Bridge" value={robot.connectivity.bridge_state === 'connected' ? 'Online' : robot.connectivity.bridge_state === 'reconnecting' ? 'Reconnecting' : 'Offline'} />
            <Row label="SDK (gRPC)" value={robot.connectivity.grpc === 'connected' ? 'Connected' : robot.connectivity.grpc === 'degraded' ? 'Degraded' : 'Unavailable'} />
            <Row label="Telemetry (DDS)" value={robot.connectivity.dds === 'connected' ? 'Connected' : 'Unavailable'} />
            {detail && <Row label="Firmware / SDK ver." value={`${detail.firmware_version} / ${detail.sdk_version}`} />}
            {detail && <Row label="Battery cycles / BMS" value={`${detail.battery_cycles} · ${detail.bms_state}`} />}
          </Section>

          <Section label="Position">
            <Row
              label="Coordinates"
              value={`${robot.position.x_m.toFixed(1)}, ${robot.position.y_m.toFixed(1)} m`}
            />
            <div style={{ display: 'flex', gap: space[2], marginTop: space[1] }}>
              <EstimatedBadge />
              {robot.position.freshness !== 'live' && (
                <StaleBadge freshness={robot.position.freshness} updatedAt={robot.position.updated_at} />
              )}
            </div>
          </Section>

          {detail && (
            <Section label="Sensor Health">
              <SensorHealthPanel sensors={detail.sensors} />
            </Section>
          )}

          <Section label="Maintenance">
            <MaintenancePanel log={detail?.maintenance_log ?? []} maintenanceFlagged={robot.maintenance_flagged} />
          </Section>

          <div style={{ padding: `${space[4]}px 0` }}>
            <a
              href="#/data"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: font.size.sm, color: color.accent, fontWeight: font.weight.semibold,
                textDecoration: 'none',
              }}
            >
              View this robot's sessions in Data →
            </a>
          </div>
        </div>
      </div>
    </>
  )
}
