import type { NavPathFrame } from '@/types/navPath'
import { parseNavPathFrame, type NavPathSample } from './navPath'

type Listener = (sample: NavPathSample) => void

/**
 * Each robot's latest planned route (`nav/path`, schema 0.0.24) and who wants
 * it. Both providers hold one: the real one feeds it from the broker, the mock
 * from its simulated walk. A new subscriber gets the latest sample at once;
 * whether that sample is still worth drawing (its goal, its map, its age) is
 * currentNavPath's call, not this one's.
 */
export class NavPathFeed {
  private latest = new Map<string, NavPathSample>()
  private listeners = new Map<string, Set<Listener>>()

  subscribe(robotId: string, listener: Listener): () => void {
    let set = this.listeners.get(robotId)
    if (!set) this.listeners.set(robotId, (set = new Set()))
    const listeners = set
    listeners.add(listener)
    const latest = this.latest.get(robotId)
    if (latest) listener(latest)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0 && this.listeners.get(robotId) === listeners) this.listeners.delete(robotId)
    }
  }

  /** A frame, stamped with when this browser received it. */
  push(frame: NavPathFrame, receivedAt = Date.now()): void {
    const sample: NavPathSample = { frame, receivedAt }
    this.latest.set(frame.robot_id, sample)
    this.listeners.get(frame.robot_id)?.forEach((l) => l(sample))
  }

  /** A nav/path payload as it came off the broker; dropped whole when malformed. */
  handlePayload(text: string): void {
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      return
    }
    const frame = parseNavPathFrame(raw)
    if (frame) this.push(frame)
  }

  clear(): void {
    this.latest.clear()
    this.listeners.clear()
  }
}
