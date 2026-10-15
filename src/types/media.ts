import type { PositionProviderKind, PositionQuality } from './robotState'

/** One stored snapshot, as roverhub-backend's GET /snapshots lists it.
 * Bridges on 0.0.9 send `camera`, `captured_at` (when the frame arrived off
 * DDS) and `position`; older ones send only the JPEG, leaving them null.
 * `received_at` is the backend's clock. */
export interface SnapshotRecord {
  snapshot_id: string
  robot_id: string
  site_id: string | null
  camera: string | null
  captured_at: string | null
  received_at: string
  size_bytes: number
  /** The robot's dead-reckoned position at capture, with its quality. A
   * `lost` quality means x/y are a placeholder, not a place; use
   * hasUsablePosition before plotting. */
  position: { x_m: number; y_m: number; quality?: PositionQuality; provider?: PositionProviderKind } | null
  /** Absolute URL of the image, ready for an <img>. */
  image_url: string
}

export interface SnapshotQuery {
  site_id?: string
  robot_id?: string
  /** ISO time, inclusive. */
  since?: string
  limit?: number
  offset?: number
}

export interface SnapshotPage {
  items: SnapshotRecord[]
  total: number
  next_offset: number | null
  /** True when the items are mock examples, not stored captures. */
  sample: boolean
}
