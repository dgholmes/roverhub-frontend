/** One stored snapshot, as roverhub-backend's GET /snapshots lists it
 * (control/snapshots.py on feature/snapshot-library). The bridge uploads only
 * the JPEG today, so `camera`, `captured_at` and `position` are null until the
 * edge sends them; `received_at` is the backend's clock. */
export interface SnapshotRecord {
  snapshot_id: string
  robot_id: string
  site_id: string | null
  camera: string | null
  captured_at: string | null
  received_at: string
  size_bytes: number
  position: { x_m: number; y_m: number } | null
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
