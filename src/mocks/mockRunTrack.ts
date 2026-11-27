import type { MissionRun, RunTrack, RunTrackMarker, RunTrackSource, TraceCell, TraceLeg, TracePlan } from '@/types'

/**
 * A made-up run log for a sample run, so the run page's figure, lanes and legs
 * table can be seen in mock mode. Shaped exactly as GET /runs/{id}/track
 * answers; nothing here came from a robot.
 *
 * - `trace`: a 5 Hz walk through the mission's waypoints (or a loop, for a
 *   mission with none), with an AMCL gap, a tight-controller stretch, a stuck
 *   marker, a take-over and the front camera's video.
 * - `history`: the backend's 5 s samples for a run older than run logs.
 * - `none`: no samples at all.
 */
export function mockRunTrack(run: Pick<MissionRun, 'run_id' | 'started_at' | 'ended_at' | 'mission'>, source: RunTrackSource): RunTrack {
  const duration_s = run.ended_at ? (Date.parse(run.ended_at) - Date.parse(run.started_at)) / 1000 : 120
  const base: RunTrack = {
    source, trace_version: source === 'trace' ? 1 : null, started_at: run.started_at, duration_s,
    columns: {}, plans: [], legs: [], log: [], markers: [], video: {},
    map: run.mission.map_id ? { map_id: run.mission.map_id, floor_index: 0 } : null,
  }
  if (source === 'none') return base

  // Where the walk goes: the start, then each waypoint; a loop without any.
  const wps = run.mission.waypoints
  const stops: [number, number][] = wps.length
    ? [[0, 0], ...wps.map((w) => [w.x_m, w.y_m] as [number, number])]
    : Array.from({ length: 7 }, (_, i) => [4 + 2 * Math.cos((i / 6) * 2 * Math.PI), -4 + 2 * Math.sin((i / 6) * 2 * Math.PI)] as [number, number])
  // Arrivals as the sample events place them: waypoint i at (3i + 1) minutes.
  const arriveAt = wps.length ? wps.map((_, i) => (i * 3 + 1) * 60) : stops.slice(1).map((_, i) => ((i + 1) / (stops.length - 1)) * duration_s * 0.9)
  const legStart = (i: number) => (i === 0 ? 0 : arriveAt[i - 1] + (wps.length ? 20 : 0))

  const hz = source === 'trace' ? 5 : 0.2
  const n = Math.floor(duration_s * hz) + 1
  const cols: Record<string, TraceCell[]> = {}
  const put = (k: string, v: TraceCell) => { (cols[k] ??= []).push(v) }
  const gap: [number, number] = [arriveAt[1] ? arriveAt[0] + 50 : -1, arriveAt[1] ? arriveAt[0] + 60 : -1]
  const tight: [number, number] = arriveAt[2] ? [arriveAt[1] + 40, arriveAt[1] + 75] : [-1, -1]
  const takeOver: [number, number] = arriveAt[3] ? [arriveAt[2] + 60, arriveAt[2] + 80] : [-1, -1]

  for (let k = 0; k < n; k++) {
    const t = +(k / hz).toFixed(2)
    // The leg this moment belongs to, and how far along it.
    let leg = arriveAt.findIndex((a) => t < a)
    let x: number, y: number, yaw: number, v = 0
    if (leg < 0) {
      leg = arriveAt.length - 1
      ;[x, y] = stops[stops.length - 1]
      const [px, py] = stops[stops.length - 2]
      yaw = Math.atan2(y - py, x - px)
    } else {
      const [ax, ay] = stops[leg]
      const [bx, by] = stops[leg + 1]
      const t0 = legStart(leg)
      const f = Math.max(0, Math.min(1, (t - t0) / (arriveAt[leg] - t0)))
      const wobble = 0.4 * Math.sin(f * Math.PI) * Math.sin(f * 9)
      const len = Math.hypot(bx - ax, by - ay) || 1
      x = ax + (bx - ax) * f - ((by - ay) / len) * wobble
      y = ay + (by - ay) * f + ((bx - ax) / len) * wobble
      yaw = Math.atan2(by - ay, bx - ax) + 0.3 * Math.cos(f * 9) * Math.sin(f * Math.PI)
      v = t >= t0 && f < 1 ? len / (arriveAt[leg] - t0) : 0
    }
    const lost = t >= gap[0] && t < gap[1]
    const held = t >= takeOver[0] && t < takeOver[1]
    put('t', t)
    put('x', lost ? null : +x.toFixed(3))
    put('y', lost ? null : +y.toFixed(3))
    put('yaw', lost ? null : +yaw.toFixed(3))
    put('meas_vx', +(v * (0.92 + 0.06 * Math.sin(t))).toFixed(3))
    put('state', held ? 'MANUAL' : 'AUTO_MISSION')
    put('control_owner', held ? 'MinJae Joo' : `mission:${run.run_id}`)
    if (source !== 'trace') continue
    put('at', new Date(Date.parse(run.started_at) + t * 1000).toISOString())
    put('cov_xy', lost ? null : 0.02)
    const asking = v > 0 && !held
    put('ask_vx', asking ? +(v * 1.15).toFixed(3) : null)
    put('ask_vy', asking ? 0 : null)
    put('ask_wz', asking ? +(0.3 * Math.sin(t / 40)).toFixed(3) : null)
    put('sent_vx', asking ? +Math.min(v * 1.15, 0.35).toFixed(3) : null)
    put('sent_vy', asking ? 0 : null)
    put('sent_wz', asking ? +(0.25 * Math.sin(t / 40)).toFixed(3) : null)
    put('meas_vy', 0)
    put('meas_wz', +(0.25 * Math.sin(t / 40) * (v > 0 ? 1 : 0)).toFixed(3))
    put('controller', asking ? (t >= tight[0] && t < tight[1] ? 'FollowPathTight' : 'FollowPath') : null)
    put('goal_id', asking ? leg + 1 : 0)
    put('goal_state', asking ? 'executing' : (v > 0 ? 'canceled' : 'succeeded'))
    put('estop', 0)
    put('fwd_dropped', asking && k % 173 === 0 ? 2 : 0)
  }
  base.columns = cols
  if (source !== 'trace') return base

  const plans: TracePlan[] = []
  const legs: TraceLeg[] = []
  const markers: RunTrackMarker[] = []
  arriveAt.forEach((a, i) => {
    const [ax, ay] = stops[i]
    const [bx, by] = stops[i + 1]
    const t0 = legStart(i)
    const bend = (s: number) => Array.from({ length: 9 }, (_, j) => {
      const f = j / 8
      return [+(ax + (bx - ax) * f + s * Math.sin(f * Math.PI)).toFixed(2), +(ay + (by - ay) * f).toFixed(2)] as [number, number]
    })
    plans.push({ t: t0 + 0.4, goal_id: String(i + 1), failed: false, points: bend(0.6) })
    if (i === 1) plans.push({ t: t0 + 45, goal_id: String(i + 1), failed: false, points: bend(-0.3) })
    const straight = Math.hypot(bx - ax, by - ay)
    legs.push({
      t_start: t0, t_end: a, goal_id: String(i + 1), waypoint_id: wps[i]?.waypoint_id ?? null, outcome: 'succeeded',
      duration_s: a - t0, walked_m: +(straight * 1.08).toFixed(2), first_plan_m: +(straight * 1.04).toFixed(2), straight_m: +straight.toFixed(2),
      heading_change_deg_per_m: 12.5, turn_in_place_s: i === 2 ? 6.2 : 1.1, tight_s: i === 2 ? tight[1] - tight[0] : 0,
      plans: i === 1 ? 2 : 1, route_changes: i === 1 ? 1 : 0, line: `walk score goal=${i + 1}`,
    })
  })
  if (gap[0] >= 0) markers.push({ t: gap[0] + 5, kind: 'stuck', label: 'no progress' })
  if (tight[0] >= 0) markers.push({ t: tight[0], kind: 'controller', label: 'FollowPathTight' }, { t: tight[1], kind: 'controller', label: 'FollowPath' })
  if (takeOver[0] >= 0) markers.push({ t: takeOver[0], kind: 'take_over', label: 'MinJae Joo' }, { t: takeOver[1], kind: 'control_back', label: '' })
  base.plans = plans
  base.legs = legs
  base.markers = markers.sort((p, q) => p.t - q.t)
  base.log = [
    { t: 0.4, level: 'INFO', logger: 'robot_bridge.nav_supervisor', message: 'goal 1 accepted' },
    ...(gap[0] >= 0 ? [{ t: gap[0] + 5, level: 'WARNING', logger: 'robot_bridge.nav_supervisor', message: 'nav stopped: no progress' }] : []),
  ]
  base.video = { front: { path: 'video/run_front.mp4', offset_s: 1.4 } }
  return base
}
