import type { PerceptionStatus } from '@/types'

export type PerceptionListener = (status: PerceptionStatus) => void

/** A perception/status payload as it may be stored, or null. Only the shape
 * every reader relies on is checked (a robot_id and a detectors list); the
 * 0.0.31 setting fields are read defensively by liveops/detection.ts, so a
 * status from an older perception, which has none of them, is kept. */
export function parsePerceptionStatus(raw: unknown): PerceptionStatus | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const s = raw as Partial<PerceptionStatus>
  if (typeof s.robot_id !== 'string' || !Array.isArray(s.detectors)) return null
  return raw as PerceptionStatus
}

/**
 * Each robot's latest PerceptionStatus and who wants it, shared by both
 * providers so they behave alike. The topic is retained, so a subscriber is
 * handed its robot's current status at once, then each new one.
 */
export class PerceptionFeed {
  private latest = new Map<string, PerceptionStatus>()
  private listeners = new Map<string, Set<PerceptionListener>>()

  subscribe(robotId: string, listener: PerceptionListener): () => void {
    let set = this.listeners.get(robotId)
    if (!set) this.listeners.set(robotId, (set = new Set()))
    const listeners = set
    listeners.add(listener)
    const now = this.latest.get(robotId)
    if (now) listener(now)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0 && this.listeners.get(robotId) === listeners) this.listeners.delete(robotId)
    }
  }

  /** A raw payload off perception/status. Malformed ones are dropped. */
  handleRaw(raw: unknown): void {
    const status = parsePerceptionStatus(raw)
    if (status) this.publish(status)
  }

  publish(status: PerceptionStatus): void {
    this.latest.set(status.robot_id, status)
    this.listeners.get(status.robot_id)?.forEach((l) => l(status))
  }

  get(robotId: string): PerceptionStatus | undefined {
    return this.latest.get(robotId)
  }

  clear(): void {
    this.listeners.clear()
    this.latest.clear()
  }
}
