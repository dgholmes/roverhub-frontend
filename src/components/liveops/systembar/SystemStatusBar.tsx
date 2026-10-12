import { ScrollText, Settings } from 'lucide-react'
import { color, font, space } from '@/design-system/tokens'
import { Button } from '@/components/kit'
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
  ok: color.green, neutral: color.t3, warn: color.amber, bad: color.red,
}

/** One inline "label value" pair. Healthy values are plain text with a green
 * dot; only a problem colours the value itself, so the eye lands on it. */
function StatusItem({ label, value, tone }: { label: string; value: string; tone: Tone }) {
  const c = TONE_COLOR[tone]
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', display: 'inline-block', background: c, flexShrink: 0 }} />
      <span style={{ fontSize: font.size.sm, color: color.t3 }}>{label}</span>
      <span style={{ fontSize: font.size.sm, fontWeight: font.weight.medium, color: tone === 'ok' || tone === 'neutral' ? color.t1 : c }}>{value}</span>
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
    return { label: 'Attention required', color: color.red }
  }
  const c = robot.connectivity
  if (c.bridge_state !== 'connected' || c.grpc !== 'connected' || c.dds !== 'connected' || c.edge_to_cloud !== 'connected') {
    return { label: 'Degraded', color: color.amber }
  }
  // Every link the bar can see is connected. Says exactly that, rather than
  // claiming "all systems nominal" for checks this bar does not make.
  return { label: 'All links connected', color: color.green }
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
      height: 36, flexShrink: 0, background: color.surface,
      borderTop: `1px solid ${color.border}`, display: 'flex', alignItems: 'center',
      gap: space[4], padding: `0 ${space[2]}px 0 ${space[4]}px`, overflow: 'hidden',
    }}>
      {/* The aggregate outranks the individual links: it is the one string an
          operator glances at. docs/audit/2026-08-12-ui-ux-audit.md A-19. */}
      <div role="status" aria-label={`System health: ${health.label}`} style={{ display: 'flex', alignItems: 'center', gap: space[2], flexShrink: 0 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', display: 'inline-block', background: health.color }} />
        <span style={{ fontSize: font.size.md, color: health.color === color.green ? color.t1 : health.color, fontWeight: font.weight.semibold }}>{health.label}</span>
      </div>

      <div className="rh-divider-v" style={{ margin: '10px 0' }} />

      <div style={{ display: 'flex', gap: space[5], flex: 1, minWidth: 0, overflow: 'hidden' }}>
        <StatusItem label="Cloud link" value={link.value} tone={link.tone} />
        <StatusItem label="Cameras" value={ddsOk ? 'OK' : 'Offline'} tone={ddsOk ? 'ok' : 'bad'} />
        <StatusItem label="Obstacle avoidance" value={robot.obstacle_avoidance ? 'On' : 'Off'} tone={robot.obstacle_avoidance ? 'ok' : 'neutral'} />
        <StatusItem label="Bridge" value={bridgeOk ? 'Online' : 'Offline'} tone={bridgeOk ? 'ok' : 'bad'} />
      </div>

      <div style={{ display: 'flex', gap: 2, alignItems: 'center', flexShrink: 0 }}>
        <Button size="sm" variant="ghost" icon={ScrollText} active={logsOpen} onClick={onToggleLogs}>
          Logs
        </Button>
        {/* Labelled for where it actually goes. It read "Settings" while
            navigating to the Systems workspace, so the label, the destination
            and that page's own title were three different things.
            docs/audit/2026-08-12-ui-ux-audit.md A-33. */}
        <Button
          size="sm" variant="ghost" icon={Settings} title="Go to Systems workspace"
          onClick={() => { window.location.hash = hashForSiteWorkspace(activeSiteId, 'Systems') }}
        >
          Systems
        </Button>
      </div>
    </footer>
  )
}
