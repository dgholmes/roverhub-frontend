import type { RobotConnectivity } from '@/types'
import { LinkStatusRow } from './LinkStatusRow'

/** Shows the SDK/DDS connection health only — never SDK internal state codes
 * (docs/05-ui-ux.md §9.2). Full gRPC/DDS endpoint config belongs to Systems. */
export function SdkStatus({ connectivity }: { connectivity: RobotConnectivity }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <LinkStatusRow
        label="SDK (gRPC)"
        value={connectivity.grpc === 'connected' ? 'Connected' : connectivity.grpc === 'degraded' ? 'Degraded' : 'Unavailable'}
        quality={connectivity.grpc === 'connected' ? 'good' : connectivity.grpc === 'degraded' ? 'degraded' : 'bad'}
      />
      <LinkStatusRow
        label="Telemetry (DDS)"
        value={connectivity.dds === 'connected' ? 'Connected' : 'Unavailable'}
        quality={connectivity.dds === 'connected' ? 'good' : 'bad'}
      />
    </div>
  )
}
