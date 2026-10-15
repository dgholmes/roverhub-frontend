import type { MissionLibraryEntry, RobotState, RunDetail, RunEvent, RunSummary } from '@/types'
import { mockMissionLibrary } from './mockMissionLibrary'

const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString()
const H = 3_600_000
const M = 60_000

interface SampleRun { summary: RunSummary; files: { path: string; size_bytes: number }[]; events: RunEvent[] }

function build(mission: MissionLibraryEntry, robot: RobotState | undefined, startAgo: number, result: RunSummary['result'], withDetection: boolean): SampleRun {
  const run_id = `sample-${mission.mission_id}-${Math.round(startAgo / H)}h`
  const robot_id = robot?.robot_id ?? mission.robot_id ?? 'zaezae-x1-001'
  const events: RunEvent[] = []
  const files: SampleRun['files'] = [{ path: 'video/run_front.mp4', size_bytes: 180_000_000 }]
  const push = (offsetMin: number, e: Partial<RunEvent> & Pick<RunEvent, 'kind'>) =>
    events.push({ run_id, seq: events.length, at: iso(startAgo - offsetMin * M), waypoint_id: null, task_index: null, actor: null, media: null, position: null, detection: null, message: null, ...e })
  push(0, { kind: 'run_started', actor: 'schedule' })
  mission.waypoints.forEach((wp, i) => {
    const n = String(i + 1).padStart(2, '0')
    const slug = wp.label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const pos = { x_m: wp.x_m, y_m: wp.y_m, z_m: 0, heading_deg: 0, provider: 'dead_reckoning' as const, quality: 'estimated' as const, accuracy_m: null, freshness: 'live' as const, updated_at: iso(startAgo - (i * 3 + 1) * M) }
    push(i * 3 + 1, { kind: 'arrived', waypoint_id: wp.waypoint_id, position: pos })
    wp.actions.forEach((a, k) => {
      if (a.type === 'snapshot') {
        const path = `photos/${n}_${slug}_front_${String(i * 3 + 1).padStart(2, '0')}0000.jpg`
        files.push({ path, size_bytes: 41_000 })
        push(i * 3 + 1, { kind: 'task_done', waypoint_id: wp.waypoint_id, task_index: k, media: path, position: pos })
      }
    })
  })
  if (withDetection) {
    const path = 'detections/000700_person_0.91.jpg'
    files.push({ path, size_bytes: 38_000 })
    push(7, { kind: 'detection', media: path, detection: { label: 'person', confidence: 0.91, bbox: [0.4, 0.3, 0.12, 0.4], camera: 'front', model: 'sample' } })
  }
  push(5, { kind: 'announcement_played', actor: 'MinJae Joo', media: 'audio/000500_announcement.wav', message: 'This area is monitored' })
  files.push({ path: 'audio/000500_announcement.wav', size_bytes: 96_000 })
  const end = mission.waypoints.length * 3 + 2
  push(end, { kind: 'run_ended', message: result })
  const count = (p: string) => files.filter((f) => f.path.startsWith(p)).length
  return {
    summary: {
      run_id, mission_id: mission.mission_id, mission, robot_id, site_id: 'site-north-yard',
      started_at: iso(startAgo), ended_at: iso(startAgo - end * M), result, started_by: 'schedule',
      end_reason: result === 'aborted' ? 'E-Stop' : null, bucket_copied_at: result === 'completed' ? iso(startAgo - (end + 2) * M) : null,
      photo_count: count('photos/'), video_count: count('video/'), detection_count: count('detections/'),
    },
    files, events,
  }
}

/** Sample runs for the Data › Missions tab on mock data. Marked `sample` by
 * the provider; nothing here came from a robot. */
export function mockRuns(robots: RobotState[]): SampleRun[] {
  const [a, b] = mockMissionLibrary
  const atlas = robots.find((r) => r.robot_id === 'zaezae-x1-001')
  return [
    build(a, atlas, 2 * H, 'completed', true),
    build(b, atlas, 26 * H, 'completed', false),
    build(a, atlas, 50 * H, 'aborted', false),
  ]
}

export type { SampleRun }
export const sampleRunDetail = (s: SampleRun): RunDetail => ({ run: s.summary, files: s.files, event_count: s.events.length })
