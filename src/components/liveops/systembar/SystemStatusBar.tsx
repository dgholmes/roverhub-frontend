import { ScrollText, Settings } from 'lucide-react'
import { color, font, layout, radius, space } from '@/design-system/tokens'
import { hashForSiteWorkspace } from '@/app/routes'
import { useSessionStore } from '@/store/useSessionStore'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import type { LinkPhase, TelemetryFreshness } from '@/lib/realtime/linkHealth'
import type { RobotState } from '@/types'

/** `neutral` exists because not every "not OK" is a fault. Obstacle avoidance
 * being off is an operator's deliberate choice, and rendering it in the same
 * red as a dead bridge trains people to ignore red.
 * docs/audit/2026-08-12-ui-ux-audit.md A-52. */
type Tone = 'ok' | 'neutral' | 'warn' | 'bad'

const TONE_COLOR: Record<Tone, string> = {
  ok: color.accent, neutral: color.t2, warn: color.amber, bad: color.red,
}

function StatusItem({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  const c = TONE_COLOR[tone]
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <span style={{ fontSize: font.size.xs, fontWeight: font.weight.bold, color: color.t3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
        {label}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', display: 'inline-block', background: c }} />
        <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: tone === 'ok' ? color.t2 : c }}>{value}</span>
      </div>
    </div>
  )
}

/** The browser's own link to the live data service — the one connection no
 * per-robot indicator can report, because when it drops there is no robot data
 * arriving to report anything with. Everything else in this bar describes the
 * selected robot; this describes whether any of it is current. */
function cloudLink(phase: LinkPhase, freshness: TelemetryFreshness): { value: string; tone: Tone } {
  if (phase === 'offline') return { value: 'Disconnected', tone: 'bad' }
  if (phase === 'reconnecting') return { value: 'Reconnecting', tone: 'warn' }
  if (phase === 'connecting') return { value: 'Connecting', tone: 'warn' }
  // Amber, not red: with the socket up, absent data is almost always caused by
  // something downstream that has its own indicator — a bridge that has stopped
  // publishing already shows "Bridge: Offline" in red beside this. Two reds for
  // one fault is how a status bar stops being read.
  if (freshness === 'lost') return { value: 'No data', tone: 'warn' }
  if (freshness === 'delayed') return { value: 'Delayed', tone: 'warn' }
  return { value: 'OK', tone: 'ok' }
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
 * shown one screen up in CameraModeTabs. "Motors"/"Sensors" are dropped too
 * (LIVEOPS_AUDIT_TRACKER.md 1.3) — they were hardcoded "OK" literals with no
 * backing field, which would keep reading "OK" through a real fault.
 */
export function SystemStatusBar({
  robot, logsOpen, onToggleLogs,
}: {
  robot: RobotState
  logsOpen: boolean
  onToggleLogs: () => void
}) {
  const activeSiteId = useSessionStore((s) => s.activeSiteId)
  const linkPhase = useLiveOpsStore((s) => s.linkPhase)
  const freshness = useLiveOpsStore((s) => s.telemetryFreshness)
  const health = healthLevel(robot)
  const link = cloudLink(linkPhase, freshness)
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
          {/* The value now outranks its own caption. "Attention Required" — the
              single most important aggregate string in the console — was
              rendered at 10px *underneath* an 11px label, an inverted
              hierarchy. docs/audit/2026-08-12-ui-ux-audit.md A-19. */}
          <div style={{ fontSize: font.size.xs, color: color.t3, fontWeight: font.weight.medium }}>System Health</div>
          <div style={{ fontSize: font.size.xl, color: health.color, fontWeight: font.weight.semibold, lineHeight: 1.2 }}>{health.label}</div>
        </div>
      </div>

      <div style={{ width: 1, height: 28, background: color.border, marginRight: space[6] }} />

      <div style={{ display: 'flex', gap: space[6] + 4, flex: 1 }}>
        <StatusItem label="Cloud Link" value={link.value} tone={link.tone} />
        <StatusItem label="Cameras" value={ddsOk ? 'OK' : 'Offline'} tone={ddsOk ? 'ok' : 'bad'} />
        <StatusItem label="Obstacle Avoid." value={robot.obstacle_avoidance ? 'On' : 'Off'} tone={robot.obstacle_avoidance ? 'ok' : 'neutral'} />
        <StatusItem label="Bridge" value={bridgeOk ? 'Online' : 'Offline'} tone={bridgeOk ? 'ok' : 'bad'} />
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
          onClick={() => { window.location.hash = hashForSiteWorkspace(activeSiteId, 'Systems') }}
          title="Go to Systems workspace"
          style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: radius.sm,
            background: 'transparent', border: `1px solid ${color.border}`,
            color: color.t2, fontSize: font.size.sm, fontWeight: font.weight.medium,
            cursor: 'pointer', fontFamily: font.family,
          }}
        >
          {/* Labelled for where it actually goes. It read "Settings" while
              navigating to the Systems workspace, so the label, the
              destination and that page's own title were three different
              things. docs/audit/2026-08-12-ui-ux-audit.md A-33. */}
          <Settings size={12} strokeWidth={1.5} />
          Systems
        </button>
      </div>
    </footer>
  )
}
