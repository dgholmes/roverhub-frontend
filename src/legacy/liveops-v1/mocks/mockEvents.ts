import type { TimelineEvent } from '@/legacy/liveops-v1/types'

let seq = 0
const ago = (min: number) => new Date(Date.now() - min * 60_000).toISOString()

export function seedEvents(): TimelineEvent[] {
  seq = 0
  return [
    { event_id: `evt-${seq++}`, source: 'operator', severity: 'info', message: 'Mission "Perimeter Patrol — North Yard" dispatched', ts: ago(22), waypoint_id: 'wp-1', acknowledged: true },
    { event_id: `evt-${seq++}`, source: 'robot', severity: 'info', message: 'Waypoint "Gate A" reached', ts: ago(19), waypoint_id: 'wp-1', acknowledged: true },
    { event_id: `evt-${seq++}`, source: 'edge', severity: 'info', message: 'Snapshot captured at "North Fence"', ts: ago(14), waypoint_id: 'wp-2', acknowledged: true },
    { event_id: `evt-${seq++}`, source: 'robot', severity: 'warning', message: 'Obstacle detected — speed reduced to 0.8 m/s', ts: ago(9), acknowledged: false },
    { event_id: `evt-${seq++}`, source: 'robot', severity: 'info', message: 'Waypoint "Loading Dock" reached', ts: ago(6), waypoint_id: 'wp-3', acknowledged: true },
    { event_id: `evt-${seq++}`, source: 'edge', severity: 'info', message: 'Approaching "Valve Cluster" — thermal scan queued', ts: ago(1), waypoint_id: 'wp-4', acknowledged: true },
  ]
}

export function nextEventId(): string {
  return `evt-${seq++}`
}
