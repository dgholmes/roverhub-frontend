import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import i18n from '@/i18n'
import { taskRows } from '@/missions/taskRun'
import { DEFAULT_DISPATCH_RULE, type MissionLibraryEntry, type MissionTask, type RobotState, type TaskOccurrence } from '@/types'

const shell = vi.hoisted(() => ({ touch: false }))
vi.mock('@/lib/useTouchShell', () => ({
  useTouchShell: () => ({ touch: shell.touch, orientation: 'portrait', big: false }),
}))
// Zustand's server snapshot is the store's initial state, so a store filled with
// setState would render empty here; the hook is stood in with fixed state.
const taskState = vi.hoisted(() => ({ value: {} as Record<string, unknown> }))
vi.mock('@/missions/useTaskStore', () => ({
  useTaskStore: (select?: (s: Record<string, unknown>) => unknown) => (select ? select(taskState.value) : taskState.value),
}))
vi.mock('@/missions/useMissionMap', () => ({ useSiteMaps: () => ({ maps: null, shown: undefined }) }))

import { TaskListView } from './TaskListView'
import { ScheduleRunsView } from './ScheduleRunsView'

const NOW = Date.now()
const mission: MissionLibraryEntry = {
  mission_id: 'm1', name: 'Lights check', type: 'patrol', kind: 'program', version: 1, creator: 'x', updated_at: '', map_id: 'map',
  site_id: 's1', waypoints: [], segments: [], program_state: '{"blocks":{}}',
} as unknown as MissionLibraryEntry
const MISSIONS = [mission]
const ROBOTS = [{ robot_id: 'r1', name: 'Rover 1', robot_type: 'quad', battery: { percent: 80 }, abstract_state: 'STAND', sdk_state: 'balance_stand', connectivity: { bridge_state: 'connected', grpc: 'connected' } } as unknown as RobotState]
const task = (over: Partial<MissionTask>): MissionTask => ({
  task_id: 't1', mission_id: 'm1', site_id: 's1', name: null, robot_id: 'r1',
  schedule: { schedule_id: 's1', recurrence: 'weekly', start_at: '2026-10-26T09:00', timezone: 'Asia/Seoul', days_of_week: [0, 1, 2, 3, 4], window_minutes: null, until: null, skip_dates: [] },
  dispatch_rule: { ...DEFAULT_DISPATCH_RULE }, status: 'enabled', max_duration_min: null,
  created_by: 'op', created_at: '', updated_at: '', version: 1, ...over,
})
// The third task is paused, so taskRows refuses its Run now with 'paused'.
const TASKS = [task({ task_id: 't1' }), task({ task_id: 't2', robot_id: null }), task({ task_id: 't3', status: 'paused' })]
const due = new Date(NOW + 3_600_000).toISOString()
const OCCURRENCES: TaskOccurrence[] = [
  { occurrence_id: 'o1', task_id: 't1', mission_id: 'm1', site_id: 's1', robot_id: 'r1', due_at: due, status: 'scheduled', run_id: null, skip_reason: null, message: null },
  { occurrence_id: 'o2', task_id: 't2', mission_id: 'm1', site_id: 's1', robot_id: null, due_at: new Date(NOW - 3_600_000).toISOString(), status: 'skipped', run_id: null, skip_reason: null, message: null },
]

beforeEach(() => {
  taskState.value = { siteId: 's1', tasks: TASKS, occurrences: OCCURRENCES, tasksLoaded: true, loading: false, error: null, load: async () => {} }
})

const renderTaskList = (touch: boolean) => {
  shell.touch = touch
  return renderToStaticMarkup(
    <TaskListView siteId="s1" missions={MISSIONS} robots={ROBOTS} timezone="Asia/Seoul" onEdit={() => {}} />,
  )
}
const renderRuns = (touch: boolean) => {
  shell.touch = touch
  return renderToStaticMarkup(
    <ScheduleRunsView siteId="s1" missions={MISSIONS} robots={ROBOTS} timezone="Asia/Seoul" onEditTask={() => {}} onOpenMission={() => {}} />,
  )
}

describe('Schedule › Tasks', () => {
  it('turns the task table into one card per task at touch', () => {
    const html = renderTaskList(true)
    expect(html).not.toContain('min-width:1200px')
    expect(html.match(/data-record-card/g)).toHaveLength(TASKS.length)
  })

  it('keeps the table on a fine pointer', () => {
    const html = renderTaskList(false)
    expect(html).toContain('min-width:1200px')
    expect(html).not.toContain('data-record-card')
  })

  it('keeps Run now on every card, with the refusal reason taskRows gave', () => {
    const rows = taskRows(TASKS, MISSIONS, ROBOTS, OCCURRENCES, NOW, 'Asia/Seoul', null)
    const blocked = rows.find((r) => r.runNow === 'paused')!
    expect(blocked).toBeDefined()
    const html = renderTaskList(true)
    expect(html.match(new RegExp(i18n.t('missions.tasks.runNow'), 'g'))).toHaveLength(TASKS.length)
    expect(html).toContain(i18n.t(`missions.tasks.runNowOff.${blocked.runNow!}`))
    // A task that can run carries no refusal.
    const allowed = rows.filter((r) => r.runNow === null).length
    expect(html.match(/<button[^>]*disabled/g) ?? []).toHaveLength(rows.length - allowed)
  })
})

describe('Schedule › Runs', () => {
  it('drops the robot aside on touch and keeps the runs as cards', () => {
    const html = renderRuns(true)
    expect(html).not.toContain('data-runs-aside')
    expect(html).not.toContain('min-width:1000px')
    expect(html.match(/data-record-card/g)?.length ?? 0).toBeGreaterThan(0)
  })

  it('keeps the aside and the table on a fine pointer', () => {
    const html = renderRuns(false)
    expect(html).toContain('data-runs-aside')
    expect(html).toContain('min-width:1000px')
    expect(html).not.toContain('data-record-card')
  })
})
