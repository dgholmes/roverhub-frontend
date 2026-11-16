import { parseLidarMountStatus } from '@/sensors/lidarMount'
import type { LidarMountStatus } from '@/types/sensors'

export type LidarMountListener = (status: LidarMountStatus) => void

/**
 * The latest LidarMountStatus per robot and who wants them, shared by both
 * providers so they behave alike. The topic is retained, so a subscriber is
 * handed every robot's current status at once, then each new one.
 */
export class LidarMountFeed {
  private latest = new Map<string, LidarMountStatus>()
  private listeners = new Set<LidarMountListener>()

  subscribe(listener: LidarMountListener): () => void {
    this.listeners.add(listener)
    for (const s of this.latest.values()) listener(s)
    return () => { this.listeners.delete(listener) }
  }

  /** A raw payload off sensors/lidar_mount. Malformed ones are dropped. */
  handleRaw(raw: unknown): void {
    const status = parseLidarMountStatus(raw)
    if (status) this.publish(status)
  }

  publish(status: LidarMountStatus): void {
    this.latest.set(status.robot_id, status)
    this.listeners.forEach((l) => l(status))
  }

  get(robotId: string): LidarMountStatus | null {
    return this.latest.get(robotId) ?? null
  }

  clear(): void {
    this.listeners.clear()
  }
}
