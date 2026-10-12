import type { RobotState } from '@/types'
import { TelemetryCard } from './TelemetryPanel'

/** Telemetry floating over a view's top-left corner. Kept as a thin wrapper so
 * views that overlay telemetry (Dual cam) share TelemetryCard's content with
 * the rest of LiveOps — previously this was a separate cluster of glass chips
 * that drifted from the other views' readouts. */
export function TelemetryOverlay({ robot }: { robot: RobotState }) {
  return <TelemetryCard robot={robot} style={{ position: 'absolute', top: 12, left: 12, zIndex: 900 }} />
}
