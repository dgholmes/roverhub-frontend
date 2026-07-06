import type { RobotConnectivity } from '@/types'
import { LinkStatusRow } from './LinkStatusRow'

/** Cloud uplink from the edge bridge — the robot itself has no direct WAN link
 * in this architecture (CLAUDE.md network topology: edge initiates to cloud). */
export function NetworkStatus({ connectivity }: { connectivity: RobotConnectivity }) {
  const status = connectivity.edge_to_cloud
  return (
    <LinkStatusRow
      label="Cloud Link"
      value={status === 'connected' ? 'Connected' : status === 'reconnecting' ? 'Reconnecting' : 'Offline'}
      quality={status === 'connected' ? 'good' : status === 'reconnecting' ? 'degraded' : 'bad'}
    />
  )
}
