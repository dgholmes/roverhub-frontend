import { describe, expect, it } from 'vitest'
import { DEFAULT_DISPATCH_RULE, type MissionLibraryEntry, type MissionTask, type RobotState, type TaskOccurrence } from '@/types'
import { formActions, runNowBlock, taskRows, timingOf, withMissionIssue, withTiming } from './taskRun'

const mission = (over: Partial<MissionLibraryEntry> = {}): MissionLibraryEntry => ({
  mission_id: 'm1', name: 'Lights check', type: 'patrol', kind: 'program', version: 1, creator: 'x', updated_at: '', map_id: 'map',
  site_id: 'site-a', waypoints: [], segments: [], program_state: '{"blocks":{}}', ...over,
})

const task = (over: Partial<MissionTask> = {}): MissionTask => ({
  task_id: 't1', mission_id: 'm1', site_id: 'site-a', name: null, robot_id: 'r1',
  schedule: { schedule_id: 's1', recurrence: 'weekly', start_at: '2026-10-26T09:00', timezone: 'Asia/Seoul', days_of_week: [0, 1, 2, 3, 4], window_minutes: null, until: null, skip_dates: [] },
  dispatch_rule: { ...DEFAULT_DISPATCH_RULE }, status: 'enabled', max_duration_min: null,
  created_by: 'op', created_at: '2026-10-23T00:00:00Z', updated_at: '2026-10-23T00:00:00Z', version: 1, ...over,
})

const occ = (id: string, task_id: string, due_at: string, status: TaskOccurrence['status'] = 'scheduled'): TaskOccurrence => ({
  occurrence_id: id, task_id, mission_id: 'm1', site_id: 'site-a', robot_id: 'r1', due_at, status, run_id: null, skip_reason: null, message: null,
})

describe('runNowBlock', () => {
  it('lets a saved, enabled program task with a robot run', () => {
    expect(runNowBlock(task(), mission())).toBeNull()
  })

  it('says why not, most fundamental reason first', () => {
    expect(runNowBlock(task(), undefined)).toBe('missionMissing')
    expect(runNowBlock(task({ status: 'paused', robot_id: null }), route())).toBe('paused')
    expect(runNowBlock(task({ status: 'paused', robot_id: null }), mission())).toBe('paused')
    expect(runNowBlock(task({ robot_id: null }), mission())).toBe('noRobot')
    expect(runNowBlock(task(), mission({ program_state: undefined }))).toBe('noProgram')
  })
})

describe('timing', () => {
  const now = new Date('2026-10-26T00:00:00Z')

  it('reads a task with no schedule as run-now only', () => {
    expect(timingOf(task({ schedule: null }))).toBe('now')
    expect(timingOf(task())).toBe('weekly')
  })

  it('keeps the time and days when the repeat changes', () => {
    const daily = withTiming(task(), 'daily', 'Asia/Seoul', now)
    expect(daily.schedule).toMatchObject({ recurrence: 'daily', start_at: '2026-10-26T09:00', days_of_week: [0, 1, 2, 3, 4] })
  })

  it('drops the schedule for run-now, and gives one back when a repeat is picked', () => {
    const manual = withTiming(task(), 'now', 'Asia/Seoul', now)
    expect(manual.schedule).toBeNull()
    expect(withTiming(manual, 'once', 'Asia/Seoul', now).schedule).toMatchObject({ recurrence: 'once', timezone: 'Asia/Seoul' })
  })
})

// --- Routes (schema 0.0.16): the backend compiles one into walk-to-point legs.

const route = (over: Partial<MissionLibraryEntry> = {}): MissionLibraryEntry => mission({
  kind: 'route', program_state: undefined, map_id: 'map-a',
  waypoints: [
    { waypoint_id: 'w1', label: 'Gate A', x_m: 0, y_m: 0, z_m: null, heading_deg: null, tolerance_m: 0.5, actions: [], status: 'pending' },
    { waypoint_id: 'w2', label: 'Gate B', x_m: 5, y_m: 0, z_m: null, heading_deg: null, tolerance_m: 0.5, actions: [], status: 'pending' },
  ],
  validation: { status: 'valid', issues: [] },
  ...over,
})
const activeMap = { map_id: 'map-a', status: 'active' as const }

describe('runNowBlock for a route', () => {
  it('runs a valid route on its own active map, on a quad', () => {
    expect(runNowBlock(task(), route(), { siteMap: activeMap, robotType: 'quad' })).toBeNull()
  })

  it("needs the route's map to be the site's active map", () => {
    expect(runNowBlock(task(), route(), { siteMap: { map_id: 'map-a', status: 'draft' }, robotType: 'quad' })).toBe('mapNotActive')
    expect(runNowBlock(task(), route(), { siteMap: { map_id: 'map-b', status: 'active' }, robotType: 'quad' })).toBe('mapNotActive')
    expect(runNowBlock(task(), route(), { siteMap: null, robotType: 'quad' })).toBe('mapNotActive')
    // Not told which map is active: not offered.
    expect(runNowBlock(task(), route())).toBe('mapNotActive')
  })

  it('needs a route the backend can compile: no errors, some waypoints', () => {
    const invalid = route({ validation: { status: 'invalid', issues: [{ severity: 'error', code: 'actionNotRunnable', message: 'x', waypoint_id: 'w1' }] } })
    expect(runNowBlock(task(), invalid, { siteMap: activeMap, robotType: 'quad' })).toBe('routeNotRunnable')
    expect(runNowBlock(task(), route({ waypoints: [] }), { siteMap: activeMap, robotType: 'quad' })).toBe('routeNotRunnable')
    // Warnings do not stop it.
    const warned = route({ validation: { status: 'warnings', issues: [{ severity: 'warning', code: 'nearNoGo', message: 'x', waypoint_id: 'w1' }] } })
    expect(runNowBlock(task(), warned, { siteMap: activeMap, robotType: 'quad' })).toBeNull()
  })

  it('is refused on a wheel robot', () => {
    expect(runNowBlock(task(), route(), { siteMap: activeMap, robotType: 'wheel' })).toBe('wheelRobot')
  })

  it('never asks a route for a program', () => {
    expect(runNowBlock(task(), route({ program_state: undefined }), { siteMap: activeMap, robotType: 'quad' })).not.toBe('noProgram')
  })

  it('flows through taskRows with the site map and the robot', () => {
    const robots = [{ robot_id: 'r1', name: 'Rover 1', robot_type: 'quad' } as RobotState]
    const now = Date.parse('2026-10-26T00:00:00Z')
    expect(taskRows([task()], [route()], robots, [], now, 'Asia/Seoul', activeMap)[0].runNow).toBeNull()
    expect(taskRows([task()], [route()], robots, [], now, 'Asia/Seoul', { map_id: 'map-a', status: 'draft' })[0].runNow).toBe('mapNotActive')
  })
})

describe('the form', () => {
  it('will not save a task with no mission', () => {
    const issues = withMissionIssue([], undefined, 'Pick a mission')
    expect(issues).toEqual([expect.objectContaining({ severity: 'error', code: 'noMission', message: 'Pick a mission' })])
    expect(withMissionIssue([], mission(), 'Pick a mission')).toEqual([])
  })

  it('offers save-and-run only where Run now could run the task', () => {
    expect(formActions(task(), mission()).saveAndRun).toBe(true)
    expect(formActions(task(), route()).saveAndRun).toBe(false)
    expect(formActions(task(), route(), { siteMap: activeMap, robotType: 'quad' }).saveAndRun).toBe(true)
    expect(formActions(task({ robot_id: null }), mission()).saveAndRun).toBe(false)
  })
})

describe('taskRows', () => {
  const robots = [{ robot_id: 'r1', name: 'Rover 1' } as RobotState]
  const now = Date.parse('2026-10-26T00:00:00Z')

  it('names a task by its own name, else its mission', () => {
    const rows = taskRows([task({ task_id: 'a', name: 'Morning check' }), task({ task_id: 'b' })], [mission()], robots, [], now, 'Asia/Seoul')
    expect(rows.map((r) => r.title)).toEqual(['Lights check', 'Morning check'])
    expect(rows[0].robot?.name).toBe('Rover 1')
  })

  it('keeps a task whose mission is gone, unnamed and unable to run', () => {
    const [row] = taskRows([task({ mission_id: 'gone' })], [mission()], robots, [], now, 'Asia/Seoul')
    expect(row.title).toBeNull()
    expect(row.runNow).toBe('missionMissing')
  })

  it('lists enabled tasks by soonest next run, then paused ones, and hides archived', () => {
    const rows = taskRows(
      [task({ task_id: 'late' }), task({ task_id: 'paused', status: 'paused' }), task({ task_id: 'soon' }), task({ task_id: 'old', status: 'archived' })],
      [mission()], robots,
      [occ('o-late', 'late', '2026-10-27T00:00:00Z'), occ('o-soon', 'soon', '2026-10-26T03:00:00Z'), occ('o-paused', 'paused', '2026-10-26T01:00:00Z')],
      now, 'Asia/Seoul',
    )
    expect(rows.map((r) => r.task.task_id)).toEqual(['soon', 'late', 'paused'])
    expect(rows[0].nextRun).toEqual({ occurrenceId: 'o-soon', date: '2026-10-26', time: '12:00' })
    // A paused task promises no next run.
    expect(rows[2].nextRun).toBeNull()
  })

  it('shows how the last run came out', () => {
    const [row] = taskRows([task()], [mission()], robots, [occ('o1', 't1', '2026-10-25T00:00:00Z', 'skipped')], now, 'Asia/Seoul')
    expect(row.lastResult).toMatchObject({ occurrenceId: 'o1', date: '2026-10-25', time: '09:00' })
  })
})
