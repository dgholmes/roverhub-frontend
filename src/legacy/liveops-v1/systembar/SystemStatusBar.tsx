import { Bell, ScrollText, Settings } from 'lucide-react'
import { color, font, layout, radius, space } from '@/design-system/tokens'
import type { RobotState } from '@/legacy/liveops-v1/types'

function StatusItem({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.t3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', display: 'inline-block', background: ok ? color.accent : color.red }} />
        <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: ok ? color.t2 : color.red }}>{value}</span>
      </div>
    </div>
  )
}

function healthLevel(robot: RobotState): { label: string; color: string } {
  if (robot.abstract_state === 'E_STOP' || robot.abstract_state === 'FAULT') {
    return { label: 'Attention Required', color: color.red }
  }
  const c = robot.connectivity
  if (c.bridge_state !== 'connected' || c.grpc !== 'connected' || c.dds !== 'connected' || c.edge_to_cloud !== 'connected') {
    return { label: 'Degraded', color: color.amber }
  }
  return { label: 'All Systems Nominal', color: color.accent }
}

/**
 * Restored original bottom system bar. Status items are limited to fields
 * this app actually tracks — the original's "LiDAR" and "Thermal" slots are
 * dropped since neither exists in the robot model, and showing "Thermal:
 * Active" here would directly contradict the Thermal-disabled-in-MVP badge
 * shown one screen up in CameraModeTabs.
 */
export function SystemStatusBar({
  robot, unackedAlerts, logsOpen, onToggleLogs,
}: {
  robot: RobotState
  unackedAlerts: number
  logsOpen: boolean
  onToggleLogs: () => void
}) {
  const health = healthLevel(robot)
  const ddsOk = robot.connectivity.dds === 'connected'
  const bridgeOk = robot.connectivity.bridge_state === 'connected'

  return (
    <footer style={{
      height: layout.bottomBarHeight, flexShrink: 0, background: color.surface,
      borderTop: `1px solid ${color.border}`, display: 'flex', alignItems: 'center', padding: `0 ${space[5]}px`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], minWidth: 200 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block', background: health.color, boxShadow: `0 0 6px ${health.color}80` }} />
        <div>
          <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1 }}>System Health</div>
          <div style={{ fontSize: font.size.xs, color: health.color, fontWeight: font.weight.medium }}>{health.label}</div>
        </div>
      </div>

      <div style={{ width: 1, height: 28, background: color.border, marginRight: space[6] }} />

      <div style={{ display: 'flex', gap: space[6] + 4, flex: 1 }}>
        <StatusItem label="Motors" value="OK" ok />
        <StatusItem label="Sensors" value="OK" ok />
        <StatusItem label="Cameras" value={ddsOk ? 'OK' : 'Offline'} ok={ddsOk} />
        <StatusItem label="Obstacle Avoid." value={robot.obstacle_avoidance ? 'On' : 'Off'} ok={robot.obstacle_avoidance} />
        <StatusItem label="Bridge" value={bridgeOk ? 'Online' : 'Offline'} ok={bridgeOk} />
      </div>

      <div style={{ display: 'flex', gap: space[1], alignItems: 'center' }}>
        <button
          onClick={onToggleLogs}
          style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: radius.sm,
            background: logsOpen ? color.cardHover : 'transparent',
            border: `1px solid ${logsOpen ? color.borderLt : color.border}`,
            color: logsOpen ? color.t1 : color.t2, fontSize: font.size.sm, fontWeight: font.weight.medium,
            cursor: 'pointer', fontFamily: font.family,
          }}
        >
          <ScrollText size={12} strokeWidth={1.5} />
          Logs
        </button>

        <button
          title="Alerts"
          style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: radius.sm,
            background: 'transparent', border: `1px solid ${color.border}`,
            color: color.t2, fontSize: font.size.sm, fontWeight: font.weight.medium,
            cursor: 'default', fontFamily: font.family, position: 'relative',
          }}
        >
          <Bell size={12} strokeWidth={1.5} />
          Alerts
          {unackedAlerts > 0 && (
            <span style={{
              width: 16, height: 16, borderRadius: '50%', background: color.accent, color: color.accentText,
              fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {unackedAlerts}
            </span>
          )}
        </button>

        <button
          onClick={() => { window.location.hash = '#/systems' }}
          title="Go to Systems workspace"
          style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: radius.sm,
            background: 'transparent', border: `1px solid ${color.border}`,
            color: color.t2, fontSize: font.size.sm, fontWeight: font.weight.medium,
            cursor: 'pointer', fontFamily: font.family,
          }}
        >
          <Settings size={12} strokeWidth={1.5} />
          Settings
        </button>
      </div>
    </footer>
  )
}
