import { KeyValue, Badge, Button } from '@/components/kit'
import { bridgeLiveness, formatAge } from '@/fleet/bridgeHealth'
import type { RobotState } from '@/types'
import { LinkBadge, Muted, Note, Section, SectionGrid } from './parts'

const LIVENESS_BADGE = {
  live: <Badge tone="green" dot>Live</Badge>,
  late: <Badge tone="amber" dot>Late</Badge>,
  silent: <Badge tone="red" dot>Silent</Badge>,
  unknown: <Badge dot>No heartbeat yet</Badge>,
} as const

/** The three hops between this console and the robot, and the bridge that
 * carries them. Full bridge detail lives on the Edge bridges tab. */
export function LinksTab({ robot, onOpenBridge }: { robot: RobotState; onOpenBridge: () => void }) {
  const c = robot.connectivity
  const b = robot.bridge
  const liveness = bridgeLiveness(b?.last_heartbeat_at)
  return (
    <SectionGrid>
      <Section title="Connection path">
        <KeyValue rows={[
          { label: 'Bridge to cloud', value: <LinkBadge ok={c.edge_to_cloud === 'connected'} /> },
          { label: 'Robot control (gRPC)', value: <LinkBadge ok={c.grpc === 'connected'} badLabel={c.grpc === 'degraded' ? 'Slow' : 'Down'} /> },
          { label: 'Robot telemetry (DDS)', value: <LinkBadge ok={c.dds === 'connected'} badLabel="Off" /> },
          { label: 'Round trip', value: c.bridge_latency_ms === null ? <Muted>Not measured</Muted> : `${c.bridge_latency_ms} ms` },
        ]} />
        <Note>DDS only runs over the robot's Ethernet cable. Off is normal on a bridge without low-level telemetry.</Note>
      </Section>
      <Section
        title="Edge bridge"
        aside={b && <Button size="sm" variant="ghost" onClick={onOpenBridge}>Open bridge</Button>}
      >
        {b ? (
          <KeyValue rows={[
            { label: 'Bridge', value: b.bridge_id },
            { label: 'Heartbeat', value: LIVENESS_BADGE[liveness] },
            { label: 'Last heard', value: formatAge(b.last_heartbeat_at) },
          ]} />
        ) : (
          <Muted>This robot's bridge hasn't registered yet.</Muted>
        )}
      </Section>
    </SectionGrid>
  )
}
