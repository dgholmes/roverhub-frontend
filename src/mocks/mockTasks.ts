import { DEFAULT_DISPATCH_RULE, type MissionTask } from '@/types'

/** Monday of last week, so the sample schedules start in the past. */
const weekOf = (() => {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7)
  return d.toISOString().slice(0, 10)
})()
const stamp = new Date().toISOString()

/**
 * The schedules the sample missions used to carry on themselves, now where the
 * wire contract puts them: on a task. Mock mode turns them into calendar
 * occurrences in mockOccurrences.ts (the server's scheduler does that for real).
 */
export const mockTaskLibrary: MissionTask[] = [
  // A program on the free robot, so Run now can be tried in mock mode; the
  // two below are routes, which cannot run.
  {
    task_id: 'task-lobby-check', mission_id: 'mission-lobby-check-01', site_id: 'site-north-yard',
    name: 'Lobby check', robot_id: 'zaezae-x1-002',
    schedule: { schedule_id: 'sch-lobby', recurrence: 'daily', start_at: `${weekOf}T18:00`, timezone: 'Asia/Seoul', days_of_week: [], window_minutes: null, until: null, skip_dates: [] },
    dispatch_rule: { ...DEFAULT_DISPATCH_RULE }, status: 'enabled', max_duration_min: null,
    created_by: 'MinJae Joo', created_at: stamp, updated_at: stamp, version: 1,
  },
  {
    task_id: 'task-perimeter-weekdays', mission_id: 'mission-perimeter-north-01', site_id: 'site-north-yard',
    name: 'Weekday perimeter', robot_id: 'zaezae-x1-001',
    schedule: { schedule_id: 'sch-perimeter', recurrence: 'weekly', start_at: `${weekOf}T06:00`, timezone: 'Asia/Seoul', days_of_week: [0, 1, 2, 3, 4], window_minutes: null, until: null, skip_dates: [] },
    dispatch_rule: { ...DEFAULT_DISPATCH_RULE }, status: 'enabled', max_duration_min: null,
    created_by: 'MinJae Joo', created_at: stamp, updated_at: stamp, version: 1,
  },
  // Overlaps Weekday perimeter on Atlas every weekday at 06:00, so Schedule's
  // clash warning has something to show in mock mode.
  {
    task_id: 'task-dawn-fence', mission_id: 'mission-perimeter-north-01', site_id: 'site-north-yard',
    name: 'Dawn fence check', robot_id: 'zaezae-x1-001',
    schedule: { schedule_id: 'sch-dawn', recurrence: 'daily', start_at: `${weekOf}T06:00`, timezone: 'Asia/Seoul', days_of_week: [], window_minutes: null, until: null, skip_dates: [] },
    dispatch_rule: { ...DEFAULT_DISPATCH_RULE }, status: 'enabled', max_duration_min: null,
    created_by: 'MinJae Joo', created_at: stamp, updated_at: stamp, version: 1,
  },
  {
    task_id: 'task-tanks-tue-thu', mission_id: 'mission-inspection-tanks-01', site_id: 'site-north-yard',
    name: null, robot_id: 'zaezae-x1-001',
    schedule: { schedule_id: 'sch-tanks', recurrence: 'weekly', start_at: `${weekOf}T06:10`, timezone: 'Asia/Seoul', days_of_week: [1, 3], window_minutes: null, until: null, skip_dates: [] },
    dispatch_rule: { ...DEFAULT_DISPATCH_RULE }, status: 'enabled', max_duration_min: null,
    created_by: 'MinJae Joo', created_at: stamp, updated_at: stamp, version: 1,
  },
]
