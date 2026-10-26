import { describe, expect, it } from 'vitest'
import { RESOURCES } from '@/i18n'
import {
  DEFAULT_DISPATCH_RULE,
  type DispatchRule, type MissionEstimates, type MissionLibraryEntry, type MissionTask, type OccurrenceStatus, type TaskOccurrence,
} from '@/types'
import { ApiError } from '@/lib/realtime/apiError'
import {
  canSaveTask, defaultRunRobot, libraryWindow, removeAction, ruleBadgeKey, saveState, savedMission, dispatchRuleViews, libraryRow, missionRobotType, newTask, resolveConflict, robotCellText, scheduleCellText,
  taskConflict, taskIsDirty, taskIssues, taskScheduleLine, tasksOf, UNENFORCED_RULES,
} from './taskPanel'

const LOCALES = { en: RESOURCES.en.translation, ko: RESOURCES.ko.translation }
function lookup(tree: object, key: string): unknown {
  return key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], tree)
}

const estimates = (over: Partial<MissionEstimates> = {}): MissionEstimates =>
  ({ length_m: 10, duration_s: 600, energy_wh: null, duration_bounded: true, ...over })

const mission = (over: Partial<MissionLibraryEntry> = {}): MissionLibraryEntry => ({
  mission_id: 'm1', name: 'M', type: 'patrol', kind: 'route', version: 1, creator: 'x', updated_at: '', map_id: 'map',
  site_id: 'site-a', waypoints: [], segments: [], estimates: estimates(), ...over,
})

const task = (over: Partial<MissionTask> = {}): MissionTask => ({
  task_id: 't1', mission_id: 'm1', site_id: 'site-a', name: null, robot_id: 'r1',
  schedule: { schedule_id: 's1', recurrence: 'weekly', start_at: '2026-10-26T06:00', timezone: 'Asia/Seoul', days_of_week: [0, 1, 2, 3, 4], window_minutes: null, until: null, skip_dates: [] },
  dispatch_rule: { ...DEFAULT_DISPATCH_RULE }, status: 'enabled', max_duration_min: null,
  created_by: 'op', created_at: '2026-10-23T00:00:00Z', updated_at: '2026-10-23T00:00:00Z', version: 1, ...over,
})

const NOW = new Date('2026-10-23T20:00:00Z') // already Saturday 2026-10-24 in Seoul

describe('taskScheduleLine', () => {
  it("summarises a task's schedule in one line", () => {
    expect(taskScheduleLine(task())).toBe('Weekdays 06:00')
    const base = task().schedule!
    expect(taskScheduleLine(task({ schedule: { ...base, recurrence: 'daily', start_at: '2026-10-26T22:00' } }))).toBe('Daily 22:00')
    expect(taskScheduleLine(task({ schedule: { ...base, recurrence: 'once', start_at: '2026-10-26T10:00' } }))).toBe('Once, 2026-10-26 10:00')
  })

  it('says a task with no schedule is run by hand, rather than showing nothing', () => {
    expect(taskScheduleLine(task({ schedule: null }))).toBe('Manual only')
  })

  it('says when the schedule stops', () => {
    const s = task().schedule!
    expect(taskScheduleLine(task({ schedule: { ...s, until: '2026-12-31' } }))).toBe('Weekdays 06:00 · until 2026-12-31')
  })
})

describe('newTask', () => {
  const made = newTask({ mission: mission(), siteId: 'ignored', timezone: 'Asia/Seoul', creator: 'op', now: NOW })

  it('defaults to the site timezone and weekdays', () => {
    expect(made.schedule).toMatchObject({ recurrence: 'weekly', timezone: 'Asia/Seoul', days_of_week: [0, 1, 2, 3, 4] })
  })

  it("starts today in the site's calendar, not UTC's", () => {
    // 20:00Z on the 23rd is already the 24th in Seoul.
    expect(made.schedule!.start_at).toBe('2026-10-24T06:00')
  })

  it('belongs to the mission and its site, with no robot, enabled, at version 1', () => {
    expect(made).toMatchObject({ mission_id: 'm1', site_id: 'site-a', robot_id: null, status: 'enabled', version: 1, created_by: 'op', max_duration_min: null })
  })

  it('uses the given site when the mission carries none', () => {
    expect(newTask({ mission: mission({ site_id: undefined }), siteId: 'site-b', timezone: 'UTC', creator: 'op', now: NOW }).site_id).toBe('site-b')
  })

  it('takes the cautious dispatch rule, as a copy no other task shares', () => {
    expect(made.dispatch_rule).toEqual(DEFAULT_DISPATCH_RULE)
    expect(made.dispatch_rule).not.toBe(DEFAULT_DISPATCH_RULE)
  })

  it('gives two tasks made at different moments different ids', () => {
    const later = newTask({ mission: mission(), siteId: 's', timezone: 'UTC', creator: 'op', now: new Date(NOW.getTime() + 1) })
    expect(later.task_id).not.toBe(made.task_id)
    expect(made.task_id).toMatch(/^task-/)
  })
})

describe('dispatch rules', () => {
  const views = dispatchRuleViews(DEFAULT_DISPATCH_RULE)
  const byKey = (k: keyof DispatchRule) => views.find((v) => v.key === k)!

  it('lists all six rules, once each', () => {
    expect(views.map((v) => v.key).sort()).toEqual(Object.keys(DEFAULT_DISPATCH_RULE).sort())
  })

  it('marks five of six unenforceable, each with its own reason', () => {
    const unenforced = views.filter((v) => v.status === 'not_enforced')
    expect(unenforced.map((v) => v.key).sort()).toEqual([
      'block_if_maintenance_flagged', 'max_wind_kph', 'require_approval', 'require_network', 'require_safety_checklist',
    ])
    expect([...UNENFORCED_RULES].sort()).toEqual(unenforced.map((v) => v.key).sort())
    for (const v of unenforced) expect(v.editable).toBe(false)
    // No two rules share a reason: a reason that fits all of them explains none.
    expect(new Set(unenforced.map((v) => v.reasonKey)).size).toBe(5)
  })

  it('does not mark min_battery_pct unenforceable: it has no reading, which is a different thing', () => {
    expect(byKey('min_battery_pct').status).toBe('no_reading')
    expect(byKey('min_battery_pct').editable).toBe(true)
    expect(UNENFORCED_RULES).not.toContain('min_battery_pct')
  })

  it('says min_battery_pct has no reading rather than implying a battery gate', () => {
    const text = lookup(LOCALES.en, byKey('min_battery_pct').reasonKey) as string
    expect(text).toMatch(/no battery reading/i)
    // It must never read as a working gate, nor as a claim about the charge.
    expect(text).not.toMatch(/battery (is|was) (low|flat|empty)|below the minimum|enforced/i)
    expect(text).toMatch(/not a (working )?battery (check|gate)/i)
  })

  it('warns only when a minimum above zero would make the task skip every time', () => {
    const warn = (v: number | null) => dispatchRuleViews({ ...DEFAULT_DISPATCH_RULE, min_battery_pct: v }).find((x) => x.key === 'min_battery_pct')!.warningKey
    expect(warn(null)).toBeNull()
    // 0 is the project's explicit "no gate" and the scheduler treats it so.
    expect(warn(0)).toBeNull()
    expect(warn(30)).not.toBeNull()
  })

  it('says require_network is subsumed, not merely off', () => {
    const text = lookup(LOCALES.en, byKey('require_network').reasonKey) as string
    expect(text).toMatch(/unreachable/i)
    expect(text).toMatch(/whatever|regardless|always/i)
  })

  it('gives every reason and warning real copy in both languages', () => {
    const withWarning = dispatchRuleViews({ ...DEFAULT_DISPATCH_RULE, min_battery_pct: 30 })
    for (const [code, tree] of Object.entries(LOCALES)) {
      for (const v of withWarning) {
        for (const key of [v.reasonKey, v.warningKey].filter((k): k is string => k !== null)) {
          expect({ code, key, text: typeof lookup(tree, key) }).toEqual({ code, key, text: 'string' })
        }
      }
    }
    expect(withWarning.find((v) => v.key === 'min_battery_pct')!.warningKey).not.toBeNull()
  })

  it('gives no unenforced rule a warning of its own', () => {
    for (const v of views.filter((x) => x.status === 'not_enforced')) expect(v.warningKey).toBeNull()
  })
})

describe('the duration cap', () => {
  const issueCodes = (t: MissionTask, m: MissionLibraryEntry) => taskIssues(t, { draft: m, saved: savedMission(m) }).map((i) => i.code)

  it('requires a max duration when the mission is an unbounded program', () => {
    const unbounded = mission({ kind: 'program', estimates: estimates({ duration_bounded: false }) })
    expect(issueCodes(task({ max_duration_min: null }), unbounded)).toContain('needsDurationCap')
    expect(canSaveTask(taskIssues(task({ max_duration_min: null }), { draft: unbounded, saved: savedMission(unbounded) }))).toBe(false)
  })

  it('lets an unbounded program save once it has a cap', () => {
    const unbounded = mission({ kind: 'program', estimates: estimates({ duration_bounded: false }) })
    const issues = taskIssues(task({ max_duration_min: 45 }), { draft: unbounded, saved: savedMission(unbounded) })
    expect(issues.map((i) => i.code)).not.toContain('needsDurationCap')
    expect(canSaveTask(issues)).toBe(true)
  })

  it('does not ask a bounded mission for one', () => {
    expect(issueCodes(task(), mission())).not.toContain('needsDurationCap')
  })

  it('rejects a cap that is not a positive whole number of minutes', () => {
    for (const bad of [0, -5, 2.5, Number.NaN]) {
      expect(issueCodes(task({ max_duration_min: bad }), mission())).toContain('badDurationCap')
    }
    expect(issueCodes(task({ max_duration_min: 1 }), mission())).not.toContain('badDurationCap')
  })

  it('does not count a zero cap as satisfying the requirement', () => {
    const unbounded = mission({ kind: 'program', estimates: estimates({ duration_bounded: false }) })
    expect(canSaveTask(taskIssues(task({ max_duration_min: 0 }), { draft: unbounded, saved: savedMission(unbounded) }))).toBe(false)
  })

  it('will not guess for a program whose duration has not been worked out', () => {
    expect(issueCodes(task(), mission({ kind: 'program', estimates: undefined }))).toContain('needsDurationCap')
    expect(issueCodes(task(), mission({ kind: 'route', estimates: undefined }))).not.toContain('needsDurationCap')
  })
})

describe('which estimate the cap check reads', () => {
  const unbounded = mission({ kind: 'program', estimates: estimates({ duration_bounded: false }) })
  const bounded = mission({ kind: 'program', estimates: estimates({ duration_bounded: true }) })
  const codes = (draft: MissionLibraryEntry, stored: MissionLibraryEntry | null) =>
    taskIssues(task({ max_duration_min: null }), { draft, saved: stored ? savedMission(stored) : null }).map((i) => i.code)

  it('reads the saved mission, which is what the scheduler reads, not the draft', () => {
    // The draft is bounded but the server holds an unbounded one: it will skip this task, so demand the cap.
    expect(codes(bounded, unbounded)).toContain('needsDurationCap')
    // The draft is unbounded but the server holds a bounded one: the server would not ask for a cap.
    expect(codes(unbounded, bounded)).not.toContain('needsDurationCap')
  })

  it('will not guess when the saved mission is not known: a program needs a cap, a route does not', () => {
    expect(codes(bounded, null)).toContain('needsDurationCap')
    expect(codes(mission({ kind: 'route' }), null)).not.toContain('needsDurationCap')
  })

})

describe('the other task checks', () => {
  const codes = (t: MissionTask, extra: Partial<Parameters<typeof taskIssues>[1]> = {}) =>
    taskIssues(t, { draft: mission(), saved: savedMission(mission()), ...extra }).map((i) => i.code)

  it('is quiet for a sound task', () => {
    expect(taskIssues(task(), { draft: mission(), saved: savedMission(mission()) })).toEqual([])
  })

  it('warns that a task with no robot is skipped every time, since the scheduler skips an unset robot', () => {
    const issues = taskIssues(task({ robot_id: null }), { draft: mission(), saved: savedMission(mission()) })
    expect(issues.map((i) => [i.code, i.severity])).toEqual([['noRobot', 'warning']])
    expect(issues[0].message).toMatch(/skipped/i)
  })

  it('treats an unavailable robot as a warning, never an error: the task may run later', () => {
    const issues = taskIssues(task(), { draft: mission(), saved: savedMission(mission()), robotStatus: 'onMission' })
    expect(issues.find((i) => i.code === 'robotNotAvailable')?.severity).toBe('warning')
    expect(canSaveTask(issues)).toBe(true)
    expect(codes(task(), { robotStatus: 'available' })).toEqual([])
    expect(codes(task({ robot_id: null }), { robotStatus: 'offline' })).toEqual(['noRobot'])
  })

  it('refuses a weekly schedule with no days', () => {
    const s = task().schedule!
    const issues = taskIssues(task({ schedule: { ...s, days_of_week: [] } }), { draft: mission(), saved: savedMission(mission()) })
    expect(issues.map((i) => i.code)).toEqual(['weeklyNoDays'])
    expect(canSaveTask(issues)).toBe(false)
  })

  describe('a timed announcement against the schedule window', () => {
    const at = (time: string) => mission({ announcements: [{ announcement_id: 'x', clip_id: 'c', text: null, volume: 100, at: time, repeat_every_min: null, until: null }] })
    const sched = (over: object) => task({ schedule: { ...task().schedule!, recurrence: 'daily', start_at: '2026-10-12T06:00', ...over } })

    it('warns when it falls before the schedule starts', () => {
      expect(codes(sched({ window_minutes: 60 }), { draft: at('05:30') })).toContain('timedOutsideWindow')
    })

    it('with no window set, the estimated duration (at least 15 min) is the window', () => {
      const m = (time: string) => ({ draft: at(time) })
      expect(codes(sched({ window_minutes: null }), m('05:50'))).toContain('timedOutsideWindow')
      expect(codes(sched({ window_minutes: null }), m('06:10'))).not.toContain('timedOutsideWindow')
      expect(codes(sched({ window_minutes: null }), m('06:20'))).toContain('timedOutsideWindow')
    })

    it('wraps a window across midnight', () => {
      const s = sched({ start_at: '2026-10-12T23:30', window_minutes: 60 })
      expect(codes(s, { draft: at('00:15') })).not.toContain('timedOutsideWindow')
      expect(codes(s, { draft: at('23:45') })).not.toContain('timedOutsideWindow')
      expect(codes(s, { draft: at('00:45') })).toContain('timedOutsideWindow')
      expect(codes(s, { draft: at('23:00') })).toContain('timedOutsideWindow')
    })

    it('has nothing to compare against for a task with no schedule', () => {
      expect(codes(task({ schedule: null }), { draft: at('03:00') })).toEqual([])
    })
  })
})

describe('resolving a stale save', () => {
  const mine = task({ max_duration_min: 30, version: 1 })
  const stored = task({ max_duration_min: 90, version: 4 })

  it("takes the server's version wholesale, when asked", () => {
    expect(resolveConflict(mine, stored, 'theirs')).toEqual(stored)
  })

  it('keeps my edits but adopts the stored version, so the next save is not stale again', () => {
    expect(resolveConflict(mine, stored, 'mine')).toEqual({ ...mine, version: 4 })
  })

  it('reads a 409 with a stored task as a stale write, and no other error as one', () => {
    expect(taskConflict(new ApiError(409, stored, 'x'))).toEqual({ kind: 'stale', stored })
    expect(taskConflict(new ApiError(409, { detail: 'task is paused' }, 'x'))).toEqual({ kind: 'refused', detail: 'task is paused' })
    expect(taskConflict(new Error('boom'))).toBeNull()
  })

  it('does not take a 409 body that is not a task for a stored one', () => {
    expect(taskConflict(new ApiError(409, { version: 4 }, 'x'))).toEqual({ kind: 'refused', detail: null })
  })
})

describe('taskIsDirty', () => {
  it('is dirty when nothing has been saved yet', () => {
    expect(taskIsDirty(task(), null)).toBe(true)
  })

  it('is clean when the draft is what was saved', () => {
    expect(taskIsDirty(task(), task())).toBe(false)
  })

  it('sees an edit anywhere in the task, including inside the schedule and the rules', () => {
    expect(taskIsDirty(task({ robot_id: 'r2' }), task())).toBe(true)
    expect(taskIsDirty(task({ schedule: { ...task().schedule!, days_of_week: [0] } }), task())).toBe(true)
    expect(taskIsDirty(task({ dispatch_rule: { ...DEFAULT_DISPATCH_RULE, min_battery_pct: 30 } }), task())).toBe(true)
    expect(taskIsDirty(task({ max_duration_min: 10 }), task())).toBe(true)
  })

  it('does not count the server stamping updated_at as an edit', () => {
    expect(taskIsDirty(task({ updated_at: '2026-10-24T00:00:00Z' }), task())).toBe(false)
  })

  it('stays dirty after keeping my edits over a newer version', () => {
    const stored = task({ max_duration_min: 90, version: 4 })
    const mine = resolveConflict(task({ max_duration_min: 30 }), stored, 'mine')
    expect(taskIsDirty(mine, stored)).toBe(true)
  })
})

describe('what a mission knows about its robots, from its tasks', () => {
  const robots = [{ robot_id: 'q1', robot_type: 'quad' }, { robot_id: 'q2', robot_type: 'quad' }, { robot_id: 'w1', robot_type: 'wheel' }] as never

  it("keeps only the mission's own tasks, and not archived ones", () => {
    const all = [task({ task_id: 'a' }), task({ task_id: 'b', mission_id: 'other' }), task({ task_id: 'c', status: 'archived' }), task({ task_id: 'd', status: 'paused' })]
    expect(tasksOf(all, 'm1').map((t) => t.task_id)).toEqual(['a', 'd'])
  })

  it('knows the robot type when every named robot is the same type', () => {
    expect(missionRobotType([task({ robot_id: 'q1' }), task({ robot_id: 'q2' })], robots)).toBe('quad')
    expect(missionRobotType([task({ robot_id: 'q1' }), task({ robot_id: null })], robots)).toBe('quad')
  })

  it('does not guess when robots differ, are unnamed, or are unknown', () => {
    expect(missionRobotType([task({ robot_id: 'q1' }), task({ robot_id: 'w1' })], robots)).toBeNull()
    expect(missionRobotType([task({ robot_id: null })], robots)).toBeNull()
    expect(missionRobotType([], robots)).toBeNull()
    expect(missionRobotType([task({ robot_id: 'ghost' })], robots)).toBeNull()
  })

  it('offers a default robot to run a program on only when there is exactly one', () => {
    expect(defaultRunRobot([task({ robot_id: 'q1' }), task({ robot_id: 'q1' }), task({ robot_id: null })])).toBe('q1')
    expect(defaultRunRobot([task({ robot_id: 'q1' }), task({ robot_id: 'q2' })])).toBeUndefined()
    expect(defaultRunRobot([])).toBeUndefined()
  })
})

describe('libraryRow', () => {
  const NOW_MS = Date.parse('2026-10-23T12:00:00Z')
  const occ = (id: string, due_at: string, status: OccurrenceStatus, over: Partial<TaskOccurrence> = {}): TaskOccurrence => ({
    occurrence_id: id, task_id: 't1', mission_id: 'm1', site_id: 'site-a', robot_id: 'r1', due_at, status,
    run_id: null, skip_reason: null, message: null, ...over,
  })
  const row = (tasks: MissionTask[], occurrences: TaskOccurrence[], tz = 'Asia/Seoul') =>
    libraryRow('m1', tasks, occurrences, NOW_MS, tz)

  it('has nothing to say for a mission with no tasks', () => {
    expect(row([], [])).toEqual({ robot: { kind: 'none' }, schedule: { kind: 'none' }, nextRun: null, lastResult: null })
  })

  it('reads the robot and schedule off a single task', () => {
    const r = row([task()], [])
    expect(r.robot).toEqual({ kind: 'one', robotId: 'r1' })
    expect(r.schedule).toEqual({ kind: 'one', line: 'Weekdays 06:00' })
  })

  it('says a single task with no robot has none set, not that any robot will do', () => {
    expect(row([task({ robot_id: null })], []).robot).toEqual({ kind: 'unset' })
  })

  it('says a manual-only task is manual', () => {
    expect(row([task({ schedule: null })], []).schedule).toEqual({ kind: 'manual' })
  })

  it('summarises several tasks as a count rather than picking one', () => {
    const r = row([task({ task_id: 'a' }), task({ task_id: 'b', robot_id: 'r2' })], [])
    expect(r.robot).toEqual({ kind: 'varies', unset: 0 })
    expect(r.schedule).toEqual({ kind: 'many', count: 2 })
  })

  it('does not hide a task with no robot inside "Varies"', () => {
    const r = row([task({ task_id: 'a' }), task({ task_id: 'b', robot_id: null }), task({ task_id: 'c', robot_id: null })], [])
    expect(r.robot).toEqual({ kind: 'varies', unset: 2 })
    expect(row([task({ task_id: 'a' }), task({ task_id: 'b', robot_id: null })], []).robot).toEqual({ kind: 'varies', unset: 1 })
  })

  it('ignores archived tasks entirely', () => {
    expect(row([task({ status: 'archived' })], []).schedule).toEqual({ kind: 'none' })
  })

  it('takes the next run as the soonest scheduled occurrence still ahead, in site time', () => {
    const r = row([task()], [
      occ('late', '2026-10-27T21:00:00Z', 'scheduled'),
      occ('soon', '2026-10-25T21:00:00Z', 'scheduled'),
      occ('past', '2026-10-22T21:00:00Z', 'scheduled'),
    ])
    expect(r.nextRun).toEqual({ occurrenceId: 'soon', date: '2026-10-26', time: '06:00' })
  })

  it('does not call a run that was skipped, or one already past, the next run', () => {
    expect(row([task()], [occ('x', '2026-10-25T21:00:00Z', 'skipped', { skip_reason: 'no_executor' })]).nextRun).toBeNull()
    expect(row([task()], [occ('x', '2026-10-22T21:00:00Z', 'scheduled')]).nextRun).toBeNull()
  })

  it("leaves another mission's and a paused task's runs out of the next run", () => {
    const paused = task({ task_id: 'p', status: 'paused' })
    expect(row([paused], [occ('x', '2026-10-25T21:00:00Z', 'scheduled', { task_id: 'p' })]).nextRun).toBeNull()
    expect(row([task()], [occ('x', '2026-10-25T21:00:00Z', 'scheduled', { mission_id: 'other' })]).nextRun).toBeNull()
    expect(row([task()], [occ('x', '2026-10-25T21:00:00Z', 'scheduled', { task_id: 'ghost' })]).nextRun).toBeNull()
  })

  it('takes the last result as the most recent occurrence that has already come due, with how it reads', () => {
    const r = row([task()], [
      occ('old', '2026-10-20T21:00:00Z', 'succeeded'),
      occ('new', '2026-10-22T21:00:00Z', 'skipped', { skip_reason: 'no_executor', message: 'nothing on the edge can run a route mission yet' }),
      occ('ahead', '2026-10-25T21:00:00Z', 'scheduled'),
    ])
    expect(r.lastResult).toMatchObject({ occurrenceId: 'new', date: '2026-10-23', time: '06:00', view: { statusKey: 'missions.calendar.waiting', tone: 'neutral' } })
  })

  it('shows a run in progress as the latest result, and does not show a cancelled one', () => {
    expect(row([task()], [occ('r', '2026-10-23T11:00:00Z', 'running')]).lastResult).toMatchObject({ occurrenceId: 'r', view: { tone: 'blue' } })
    expect(row([task()], [occ('c', '2026-10-23T11:00:00Z', 'cancelled')]).lastResult).toBeNull()
  })

  it('has no last result when nothing has come due yet', () => {
    expect(row([task()], [occ('ahead', '2026-10-25T21:00:00Z', 'scheduled')]).lastResult).toBeNull()
  })
})

describe('how the library words its cells', () => {
  it('words the schedule cell for every shape of it', () => {
    expect(scheduleCellText({ kind: 'none' })).toBe('No tasks')
    expect(scheduleCellText({ kind: 'manual' })).toBe('Manual only')
    expect(scheduleCellText({ kind: 'one', line: 'Weekdays 06:00' })).toBe('Weekdays 06:00')
    expect(scheduleCellText({ kind: 'many', count: 3 })).toBe('3 tasks')
    expect(scheduleCellText({ kind: 'many', count: 2 })).toBe('2 tasks')
  })

  it('words the robot cell, and never calls an unset robot "any"', () => {
    const name = (id: string) => `Robot ${id}`
    expect(robotCellText({ kind: 'none' }, name)).toBe('—')
    expect(robotCellText({ kind: 'unset' }, name)).toBe('No robot set')
    expect(robotCellText({ kind: 'one', robotId: 'r1' }, name)).toBe('Robot r1')
    expect(robotCellText({ kind: 'varies', unset: 0 }, name)).toBe('Varies')
    expect(robotCellText({ kind: 'varies', unset: 1 }, name)).toBe('Varies · 1 with no robot')
    expect(robotCellText({ kind: 'unset' }, name)).not.toMatch(/any/i)
  })

  it('has copy for these in both languages', () => {
    for (const tree of Object.values(LOCALES)) {
      for (const key of ['missions.library.noTasks', 'missions.library.varies', 'missions.library.variesUnset', 'missions.library.nextRunNote', 'missions.tasks.noRobot', 'missions.tasks.manual', 'missions.library.taskCount_other']) {
        expect(typeof lookup(tree, key)).toBe('string')
      }
    }
  })
})

describe('saveState: the save button is decided here, not in markup', () => {
  const ok = { dirty: true, saving: false, issues: [] as ReturnType<typeof taskIssues>, stale: false }
  const err = [{ severity: 'error' as const, code: 'x', message: 'x', waypoint_id: null }]
  const warn = [{ severity: 'warning' as const, code: 'x', message: 'x', waypoint_id: null }]

  it('is enabled for a changed, sound task', () => {
    expect(saveState(ok)).toEqual({ disabled: false, label: 'save' })
  })

  it('is disabled while a check is failing: an uncapped unbounded task must not save', () => {
    expect(saveState({ ...ok, issues: err }).disabled).toBe(true)
    // A warning is only a warning.
    expect(saveState({ ...ok, issues: warn }).disabled).toBe(false)
  })

  it('is disabled when nothing changed, while saving, and while a stale write is unresolved', () => {
    expect(saveState({ ...ok, dirty: false }).disabled).toBe(true)
    expect(saveState({ ...ok, saving: true }).disabled).toBe(true)
    expect(saveState({ ...ok, stale: true }).disabled).toBe(true)
  })

  it('labels it saving, then save for a change, then saved for none', () => {
    expect(saveState({ ...ok, saving: true }).label).toBe('saving')
    expect(saveState(ok).label).toBe('save')
    expect(saveState({ ...ok, dirty: false }).label).toBe('saved')
    // Saving wins over a clean draft: the request is still in flight.
    expect(saveState({ ...ok, dirty: false, saving: true }).label).toBe('saving')
  })
})

describe('removeAction', () => {
  it('asks before removing a saved task, and simply drops one that was never saved', () => {
    expect(removeAction(task())).toBe('confirm')
    expect(removeAction(null)).toBe('discard')
  })
})

describe('libraryWindow', () => {
  const T = Date.parse('2026-10-23T12:34:56Z')
  it('spans the scheduler horizon either side of now', () => {
    const w = libraryWindow(T)
    expect(Date.parse(w.to) - Date.parse(w.from)).toBe(28 * 86_400_000)
    expect(Date.parse(w.from)).toBeLessThanOrEqual(T - 14 * 86_400_000)
    expect(Date.parse(w.to)).toBeGreaterThanOrEqual(T + 14 * 86_400_000 - 3_600_000)
  })

  it('does not change within an hour, so a clock tick does not reload', () => {
    expect(libraryWindow(T)).toEqual(libraryWindow(Date.parse('2026-10-23T12:00:00Z')))
    expect(libraryWindow(T)).toEqual(libraryWindow(Date.parse('2026-10-23T12:59:59Z')))
  })

  it('moves on in the next hour, so a view left open overnight stops showing yesterday', () => {
    expect(libraryWindow(Date.parse('2026-10-23T13:00:00Z'))).not.toEqual(libraryWindow(T))
    expect(libraryWindow(Date.parse('2026-10-24T12:34:56Z')).from).not.toBe(libraryWindow(T).from)
  })
})

describe('the badge beside a dispatch rule', () => {
  const badge = (k: keyof DispatchRule) => ruleBadgeKey(dispatchRuleViews(DEFAULT_DISPATCH_RULE).find((v) => v.key === k)!)

  it('does not call require_network "Not enforced": it is enforced, and not a setting', () => {
    expect(badge('require_network')).toBe('missions.tasks.rule.notASetting')
    expect(lookup(LOCALES.en, badge('require_network'))).toMatch(/not a setting|always on/i)
    expect(lookup(LOCALES.en, badge('require_network'))).not.toMatch(/not enforced/i)
  })

  it('keeps "Not enforced" for the four nothing reads, and "No reading" for the battery', () => {
    for (const k of ['require_approval', 'block_if_maintenance_flagged', 'max_wind_kph', 'require_safety_checklist'] as const) {
      expect(badge(k)).toBe('missions.tasks.rule.notEnforced')
    }
    expect(badge('min_battery_pct')).toBe('missions.tasks.rule.noReading')
  })

  it('has every badge in both languages', () => {
    for (const tree of Object.values(LOCALES)) {
      for (const v of dispatchRuleViews(DEFAULT_DISPATCH_RULE)) expect(typeof lookup(tree, ruleBadgeKey(v))).toBe('string')
    }
  })
})

describe('the running time cap copy', () => {
  it('says a cap must be set but is not enforced as a limit', () => {
    // Honesty is the one property no type can hold, so it is held per locale.
    // The Korean says "not applied yet" (아직 적용 안 됨 / 적용되지는 않습니다) and
    // "does not stop the run" (멈추지 않습니다); the label must not promise a limit
    // (최대 / 가장 오래 / 넘지 않).
    const claims = {
      en: { disclaims: /not (yet )?enforced|nothing stops/i, promises: /longest|may run/i },
      ko: { disclaims: /적용(되지는 않|\s*안)|멈추지 않/, promises: /최대|가장 오래|넘지 않|제한합니다/ },
    } as const
    for (const [locale, tree] of Object.entries(LOCALES)) {
      const c = claims[locale as keyof typeof claims]
      expect(c, `no honesty guard for locale ${locale}`).toBeDefined()
      for (const key of ['missions.tasks.maxDurationHint', 'missions.tasks.maxDurationBadge']) {
        expect(typeof lookup(tree, key)).toBe('string')
        expect(lookup(tree, key), `${locale} ${key}`).toMatch(c.disclaims)
      }
      expect(lookup(tree, 'missions.tasks.maxDuration'), `${locale} label`).not.toMatch(c.promises)
    }
  })
})

describe('a mission is not a saved mission', () => {
  it('cannot be passed where the saved one is wanted', () => {
    // Never called: these lines exist to be type-checked. `tsc -b` fails if either stops being an error.
    const typeOnly = () => {
      // @ts-expect-error a draft is not a SavedMission; the cap must be read from what the server holds
      taskIssues(task(), { draft: mission(), saved: mission() })
      // @ts-expect-error `mission` and `stored` are gone, so the old transposable shape no longer type-checks
      taskIssues(task(), { mission: mission(), stored: mission() })
    }
    expect(typeof typeOnly).toBe('function')
  })
})
