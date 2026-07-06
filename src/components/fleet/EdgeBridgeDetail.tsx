import { Cpu } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import type { EdgeBridge } from '@/types'

function timeAgo(iso: string): string {
  const sec = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000))
  if (sec < 60) return `${sec}s ago`
  if (sec < 3600) return `${Math.round(sec / 60)}m ago`
  if (sec < 86400) return `${Math.round(sec / 3600)}h ago`
  return `${Math.round(sec / 86400)}d ago`
}

const linkColor = (ok: boolean) => (ok ? color.green : color.red)

/** Per-bridge detail (docs/05-ui-ux.md §10.4). */
export function EdgeBridgeDetail({ bridges, robotNameById }: { bridges: EdgeBridge[]; robotNameById: Record<string, string> }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: space[3], padding: space[5] }}>
      {bridges.map((bridge) => (
        <div key={bridge.bridge_id} style={{
          background: color.surface, border: `1px solid ${color.border}`, borderRadius: radius.md, padding: space[4],
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: space[2], marginBottom: space[3] }}>
            <Cpu size={16} color={color.t2} strokeWidth={1.8} />
            <span style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.t1 }}>{bridge.name}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: font.size.sm }}>
            <Row label="Host OS" value={bridge.host_os} />
            <Row label="IP address" value={bridge.ip_address} mono />
            <Row
              label="Cloud connection"
              value={bridge.cloud_connection === 'connected' ? 'Connected' : bridge.cloud_connection === 'reconnecting' ? 'Reconnecting' : 'Offline'}
              color={linkColor(bridge.cloud_connection === 'connected')}
            />
            <Row label="Last heartbeat" value={timeAgo(bridge.last_heartbeat)} />
            <Row
              label="DDS"
              value={bridge.dds_status === 'connected' ? 'Connected' : 'Unavailable'}
              color={linkColor(bridge.dds_status === 'connected')}
            />
            <Row
              label="gRPC"
              value={bridge.grpc_status === 'connected' ? 'Connected' : bridge.grpc_status === 'degraded' ? 'Degraded' : 'Unavailable'}
              color={linkColor(bridge.grpc_status === 'connected')}
            />
            <Row label="Assigned robot" value={bridge.assigned_robot_id ? (robotNameById[bridge.assigned_robot_id] ?? bridge.assigned_robot_id) : '—'} />
            <Row label="Software version" value={bridge.software_version} mono />
            <Row label="Last restart" value={timeAgo(bridge.last_restart_at)} />
          </div>
        </div>
      ))}
    </div>
  )
}

function Row({ label, value, color: c, mono }: { label: string; value: string; color?: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: space[2] }}>
      <span style={{ color: color.t3 }}>{label}</span>
      <span style={{ color: c ?? color.t1, fontFamily: mono ? 'monospace' : undefined }}>{value}</span>
    </div>
  )
}
