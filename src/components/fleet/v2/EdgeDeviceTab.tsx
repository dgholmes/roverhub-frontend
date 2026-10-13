import { useEffect, useState } from 'react'
import { Copy, Check, Router, TerminalSquare } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge, Button, KeyValue } from '@/components/kit'
import { edgeVideoBaseUrlFor } from '@/lib/edgeVideo'
import { EXPECTED_SCHEMA_VERSION } from '@/lib/schemaVersion'
import { robotTypeLabel } from '@/lib/robotCapabilities'
import {
  bridgeLiveness, deviceHostFromUrl, formatAge, HEARTBEAT_INTERVAL_S, schemaMatch,
  type BridgeLiveness,
} from '@/fleet/bridgeHealth'
import type { RobotState } from '@/types'
import { BridgeUpdateBadge, EmptyState, LinkBadge, Muted, Note, Section, SectionGrid } from './parts'

/** Edge devices log in as this user on every deployment so far (Jetson and
 * Pi both). Shown only as a starting point for the copied SSH command. */
const EDGE_SSH_USER = 'rover'

const LIVENESS: Record<BridgeLiveness, { tone: 'green' | 'amber' | 'red' | 'neutral'; label: string }> = {
  live: { tone: 'green', label: 'Live' },
  late: { tone: 'amber', label: 'Late' },
  silent: { tone: 'red', label: 'Silent' },
  unknown: { tone: 'neutral', label: 'No heartbeat yet' },
}

/** Re-render every second so heartbeat ages count up between messages. */
function useNow(): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  return now
}

function CopyLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: space[2], padding: `${space[1]}px ${space[1]}px ${space[1]}px ${space[3]}px`,
      borderRadius: radius.sm, background: color.card, border: `1px solid ${color.border}`,
    }}>
      <code style={{ flex: 1, minWidth: 0, fontSize: font.size.sm, color: color.t1, overflowX: 'auto', whiteSpace: 'nowrap' }}>{text}</code>
      <Button
        size="sm" variant="ghost" icon={copied ? Check : Copy}
        onClick={() => {
          void navigator.clipboard?.writeText(text).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }).catch(() => {})
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
    </div>
  )
}

/**
 * The edge device (bridge) that links this robot to the cloud. Each robot has
 * exactly one, so it lives in the robot's inspector rather than a separate
 * Fleet tab. Built only from what the bridge actually reports — its retained
 * registration and 5 s heartbeat; host facts it does not send yet are listed
 * as such rather than filled in.
 */
export function EdgeDeviceTab({ robot }: { robot: RobotState }) {
  const now = useNow()
  const b = robot.bridge
  if (!b) {
    return (
      <EmptyState title="This robot's edge device hasn't checked in" icon={Router}>
        A bridge appears here once it registers with the cloud. If one is running, check that it can reach
        the MQTT broker.
      </EmptyState>
    )
  }
  const liveness = bridgeLiveness(b.last_heartbeat_at, now)
  const lv = LIVENESS[liveness]
  const schema = schemaMatch(b.schema_version)
  const videoUrl = edgeVideoBaseUrlFor(robot.robot_id)
  const host = deviceHostFromUrl(videoUrl)
  const c = robot.connectivity
  // Links are only as current as the last heartbeat; once it goes silent they
  // are history, not state.
  const stale = liveness === 'silent' || liveness === 'unknown'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
        <span style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.t1 }}>{b.bridge_id}</span>
        <Badge tone={lv.tone} dot>{lv.label}</Badge>
        <span style={{ fontSize: font.size.sm, color: color.t3 }}>last heard {formatAge(b.last_heartbeat_at, now)}</span>
      </div>
    <SectionGrid>
      <Section title="Health" aside={stale && <Badge tone="amber">Last known</Badge>}>
        <KeyValue rows={[
          { label: 'Heartbeat', value: <Badge tone={lv.tone} dot>{lv.label}</Badge> },
          { label: 'Last heard', value: formatAge(b.last_heartbeat_at, now) },
          { label: 'Expected every', value: `${HEARTBEAT_INTERVAL_S} s` },
          { label: 'Cloud (MQTT)', value: <LinkBadge ok={c.edge_to_cloud === 'connected'} /> },
          { label: 'Robot control (gRPC)', value: <LinkBadge ok={c.grpc === 'connected'} badLabel={c.grpc === 'degraded' ? 'Slow' : 'Down'} /> },
          { label: 'Robot telemetry (DDS)', value: <LinkBadge ok={c.dds === 'connected'} badLabel="Off" /> },
          { label: 'Round trip', value: c.bridge_latency_ms === null ? <Muted>Not measured</Muted> : `${c.bridge_latency_ms} ms` },
          { label: 'Mission running', value: b.mission_active ? 'Yes' : 'No' },
        ]} />
        <Note>DDS only runs over the robot's Ethernet cable. Off is normal on a bridge without low-level telemetry.</Note>
      </Section>

      <Section title="Identity">
        <KeyValue rows={[
          { label: 'Bridge ID', value: b.bridge_id },
          { label: 'Robot', value: `${robot.name}` },
          { label: 'Robot ID', value: robot.robot_id },
          { label: 'Robot type', value: robotTypeLabel(robot.robot_type) },
          { label: 'Site', value: robot.site_id },
          {
            label: 'Wire contract',
            value: schema === 'match'
              ? <Badge tone="green">{b.schema_version}</Badge>
              : schema === 'mismatch'
                ? <Badge tone="amber" title={`This console expects ${EXPECTED_SCHEMA_VERSION}`}>{b.schema_version} · console expects {EXPECTED_SCHEMA_VERSION}</Badge>
                : <Muted>Not announced</Muted>,
          },
        ]} />
        {schema === 'mismatch' && (
          <Note>Version skew shows up as missing fields rather than errors. Update the bridge and its shared schemas together.</Note>
        )}
      </Section>

      <Section title="What it provides">
        <KeyValue rows={[
          { label: 'Low-level telemetry', value: c.dds === 'connected' ? 'On' : <Muted>Off</Muted> },
          { label: 'Battery reading', value: robot.battery.percent === null ? <Muted>None</Muted> : 'Yes (DDS)' },
          { label: 'Camera relay', value: videoUrl ? 'Configured' : <Muted>Not configured</Muted> },
          { label: 'Motions reported', value: robot.available_motions.length || <Muted>None</Muted> },
        ]} />
        {robot.available_motions.length > 0 && (
          <details style={{ marginTop: space[3] }}>
            <summary style={{ cursor: 'pointer', fontSize: font.size.sm, color: color.t2 }}>Show motions</summary>
            <p style={{ margin: `${space[2]}px 0 0`, fontSize: font.size.sm, color: color.t2, lineHeight: 1.6 }}>
              {robot.available_motions.join(', ')}
            </p>
          </details>
        )}
      </Section>

      <Section title="Device" aside={<BridgeUpdateBadge />}>
        <KeyValue rows={[
          { label: 'Hostname', value: <Muted>Not reported</Muted> },
          { label: 'Operating system', value: <Muted>Not reported</Muted> },
          { label: 'Bridge version', value: <Muted>Not reported</Muted> },
          { label: 'Up since', value: <Muted>Not reported</Muted> },
          { label: 'CPU, memory, temperature', value: <Muted>Not reported</Muted> },
          { label: 'Disk free', value: <Muted>Not reported</Muted> },
        ]} />
        <Note>Our bridge can send all of these. It needs a small addition to its registration message.</Note>
      </Section>

      <Section title="For developers" span>
        <div style={{ display: 'grid', gap: space[3], gridTemplateColumns: 'repeat(auto-fill, minmax(min(320px, 100%), 1fr))' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
            <KeyValue rows={[
              { label: 'Device address', value: host ?? <Muted>Unknown</Muted> },
              { label: 'Camera relay', value: videoUrl ?? <Muted>Not configured</Muted> },
            ]} />
            {host ? (
              <>
                <span style={{ fontSize: font.size.sm, color: color.t3 }}>SSH from a machine on the same network</span>
                <CopyLine text={`ssh ${EDGE_SSH_USER}@${host}`} />
                <CopyLine text={`ssh ${EDGE_SSH_USER}@${host} 'journalctl -u roverhub-bridge -n 200 --no-pager'`} />
              </>
            ) : (
              <Note>The address comes from VITE_EDGE_VIDEO_BASE_URLS. LAN addresses are DHCP and move, so check it if SSH is refused.</Note>
            )}
          </div>
          <div style={{
            display: 'flex', gap: space[3], alignItems: 'flex-start', padding: space[3],
            borderRadius: radius.md, border: `1px dashed ${color.borderLt}`,
          }}>
            <TerminalSquare size={18} strokeWidth={1.5} color={color.t3} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1 }}>Browser terminal</div>
              <p style={{ margin: `${space[1]}px 0 0`, fontSize: font.size.sm, color: color.t2, lineHeight: 1.5 }}>
                Not decided yet. RoverHub has no sign-in, so a terminal here would give a shell on the
                device to anyone who can open this page.
              </p>
            </div>
          </div>
        </div>
        <details style={{ marginTop: space[3] }}>
          <summary style={{ cursor: 'pointer', fontSize: font.size.sm, color: color.t2 }}>Latest messages from this bridge</summary>
          <pre style={{
            margin: `${space[2]}px 0 0`, padding: space[3], borderRadius: radius.sm, background: color.card,
            border: `1px solid ${color.border}`, fontSize: font.size.xs, color: color.t2, overflowX: 'auto',
          }}>
            {JSON.stringify({ register: b.raw_registration ?? null, heartbeat: b.raw_heartbeat ?? null }, null, 2)}
          </pre>
        </details>
      </Section>
    </SectionGrid>
    </div>
  )
}
