import type { RobotConnectivity } from '@/legacy/liveops-v1/types'
import { LinkStatusRow } from './LinkStatusRow'

export function BridgeStatus({ connectivity }: { connectivity: RobotConnectivity }) {
  const status = connectivity.bridge_state
  return (
    <LinkStatusRow
      label="Edge Bridge"
      value={status === 'connected' ? 'Online' : status === 'reconnecting' ? 'Reconnecting' : 'Offline'}
      quality={status === 'connected' ? 'good' : status === 'reconnecting' ? 'degraded' : 'bad'}
      detail={connectivity.bridge_latency_ms != null ? `${connectivity.bridge_latency_ms}ms` : undefined}
    />
  )
}
