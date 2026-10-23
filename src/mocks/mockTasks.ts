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
 * wire contract puts them: on a task. Tue/Thu 06:10 on Atlas overlaps the
 * weekday 06:00 perimeter patrol, so a calendar built from these has a clash
 * to show.
 */
export const mockTaskLibrary: MissionTask[] = [
  {
    task_id: 'task-perimeter-weekdays', mission_id: 'mission-perimeter-north-01', site_id: 'site-north-yard',
    robot_id: 'zaezae-x1-001',
    schedule: { schedule_id: 'sch-perimeter', recurrence: 'weekly', start_at: `${weekOf}T06:00`, timezone: 'Asia/Seoul', days_of_week: [0, 1, 2, 3, 4], window_minutes: null, until: null, skip_dates: [] },
    dispatch_rule: { ...DEFAULT_DISPATCH_RULE }, status: 'enabled', max_duration_min: null,
    created_by: 'MinJae Joo', created_at: stamp, updated_at: stamp, version: 1,
  },
  {
    task_id: 'task-tanks-tue-thu', mission_id: 'mission-inspection-tanks-01', site_id: 'site-north-yard',
    robot_id: 'zaezae-x1-001',
    schedule: { schedule_id: 'sch-tanks', recurrence: 'weekly', start_at: `${weekOf}T06:10`, timezone: 'Asia/Seoul', days_of_week: [1, 3], window_minutes: null, until: null, skip_dates: [] },
    dispatch_rule: { ...DEFAULT_DISPATCH_RULE }, status: 'enabled', max_duration_min: null,
    created_by: 'MinJae Joo', created_at: stamp, updated_at: stamp, version: 1,
  },
]
