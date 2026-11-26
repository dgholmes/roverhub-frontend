import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import i18n from '@/i18n'
import { taskRows } from '@/missions/taskRun'
import { DEFAULT_DISPATCH_RULE, type MissionLibraryEntry, type MissionTask, type RobotState, type TaskOccurrence } from '@/types'

// The layout follows `narrow` (the width), never `touch` (the pointer):
// a 1420 px tablet keeps the table, a phone and a narrow window get cards.
type Shell = { touch: boolean; narrow: boolean }
const shell = vi.hoisted(() => ({ touch: false, narrow: false }))
vi.mock('@/lib/useTouchShell', () => ({
  useTouchShell: () => ({ touch: shell.touch, narrow: shell.narrow, orientation: 'landscape', big: true }),
}))
const PHONE: Shell = { touch: true, narrow: true }
const TABLET: Shell = { touch: true, narrow: false }
const DESKTOP: Shell = { touch: false, narrow: false }
const NARROW_WINDOW: Shell = { touch: false, narrow: true }
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

const renderTaskList = (at: Shell, onOpenMission?: (id: string) => void) => {
  Object.assign(shell, at)
  return renderToStaticMarkup(
    <TaskListView siteId="s1" missions={MISSIONS} robots={ROBOTS} timezone="Asia/Seoul" onEdit={() => {}} onOpenMission={onOpenMission} />,
  )
}

/** How many of `name`'s occurrences sit inside a NameLink. The robot already
 *  is one on the same card, so a plain-text mission beside it is the gap. */
function linkedNames(html: string, name: string): number {
  return (html.match(new RegExp(`class="rh-namelink"[^>]*>${name}<`, 'g')) ?? []).length
}
const renderRuns = (at: Shell) => {
  Object.assign(shell, at)
  return renderToStaticMarkup(
    <ScheduleRunsView siteId="s1" missions={MISSIONS} robots={ROBOTS} timezone="Asia/Seoul" onEditTask={() => {}} onOpenMission={() => {}} />,
  )
}

describe('Schedule › Tasks', () => {
  it('turns the task table into one card per task when narrow, whatever the pointer', () => {
    for (const at of [PHONE, NARROW_WINDOW]) {
      const html = renderTaskList(at)
      expect(html).not.toContain('role="table"')
      expect(html.match(/data-record-card/g)).toHaveLength(TASKS.length)
    }
  })

  it('keeps the table on a tablet exactly as on the desktop', () => {
    const tablet = renderTaskList(TABLET)
    expect(tablet).toContain('role="table"')
    // Nothing holds it wider than a tablet's page (it was 1200 px, 2026-11-26).
    expect(tablet).not.toMatch(/min-width:1[0-9]{3}px/)
    expect(tablet).not.toContain('data-record-card')
    expect(tablet).toBe(renderTaskList(DESKTOP))
  })

  it('keeps every column header and every row action in the tablet table', () => {
    const html = renderTaskList(TABLET)
    for (const col of ['task', 'robot', 'when', 'nextRun', 'lastResult', 'status'] as const) {
      expect(html).toContain(`>${i18n.t(`missions.tasks.list.col.${col}`)}<`)
    }
    expect(html.match(new RegExp(i18n.t('missions.tasks.runNow'), 'g'))).toHaveLength(TASKS.length)
    expect(html.match(new RegExp(`>${i18n.t('missions.tasks.list.edit')}<`, 'g'))).toHaveLength(TASKS.length)
  })

  it('gives the card buttons the desktop size, with no finger-sized height', () => {
    const html = renderTaskList(PHONE)
    const buttons = html.match(/<button[^>]*>/g) ?? []
    expect(buttons.length).toBeGreaterThan(0)
    for (const b of buttons) expect(b).not.toContain('min-height')
  })

  it('keeps Run now on every card, with the refusal reason taskRows gave', () => {
    const rows = taskRows(TASKS, MISSIONS, ROBOTS, OCCURRENCES, NOW, 'Asia/Seoul', null)
    const blocked = rows.find((r) => r.runNow === 'paused')!
    expect(blocked).toBeDefined()
    const html = renderTaskList(PHONE)
    expect(html.match(new RegExp(i18n.t('missions.tasks.runNow'), 'g'))).toHaveLength(TASKS.length)
    expect(html).toContain(i18n.t(`missions.tasks.runNowOff.${blocked.runNow!}`))
    // A task that can run carries no refusal.
    const refused = rows.filter((r) => r.runNow !== null).length
    const disabledRunNow = new RegExp(`<button[^>]*disabled[^>]*>(?:(?!</button>).)*${i18n.t('missions.tasks.runNow')}`, 'g')
    expect(html.match(disabledRunNow) ?? []).toHaveLength(refused)
    expect(refused).toBeLessThan(TASKS.length)
  })

  it('keeps every field and the Edit action on each card', () => {
    const rows = taskRows(TASKS, MISSIONS, ROBOTS, OCCURRENCES, NOW, 'Asia/Seoul', null)
    const html = renderTaskList(PHONE)
    for (const col of ['robot', 'when', 'nextRun', 'lastResult'] as const) {
      expect(html.match(new RegExp(`>${i18n.t(`missions.tasks.list.col.${col}`)}<`, 'g'))).toHaveLength(TASKS.length)
    }
    expect(html.match(new RegExp(`>${i18n.t('missions.tasks.list.edit')}<`, 'g'))).toHaveLength(TASKS.length)
    expect(html).toContain('Rover 1')
    // The mission sits on the card even though no task here has its own name.
    expect(html.match(/Lights check · /g)).toHaveLength(TASKS.length)
    // The schedule text and the first task's next run come from taskRows.
    expect(html).toContain(rows[0].schedule)
    const next = rows.find((r) => r.nextRun)!.nextRun!
    expect(html).toContain(`${next.date.slice(5)} ${next.time}`)
    // The task with no robot says so, as the table does.
    expect(html).toContain(i18n.t('missions.tasks.noRobot'))
  })

  // The robot is a RobotLink on the same card, so a mission that is plain
  // text there -- while the table row links it -- is an asymmetry inside one
  // card, not just a difference between the two layouts.
  it('links the mission on each card, as the table row does', () => {
    const open = () => {}
    expect(linkedNames(renderTaskList(DESKTOP, open), 'Lights check')).toBe(TASKS.length)
    expect(linkedNames(renderTaskList(PHONE, open), 'Lights check')).toBe(TASKS.length)
  })

  it('leaves the mission as plain text when the page offers nowhere to open it', () => {
    expect(linkedNames(renderTaskList(PHONE), 'Lights check')).toBe(0)
    expect(renderTaskList(PHONE)).toContain('Lights check')
  })

  it('keeps the table intact on a tablet and the desktop, including its accessible tree', () => {
    for (const at of [TABLET, DESKTOP]) {
      const html = renderTaskList(at)
      expect(html).toContain('role="table"')
      expect(html.match(/role="row"/g)).toHaveLength(TASKS.length + 1)
    }
  })

  it('has the table\'s accessible tree on the desktop', () => {
    const html = renderTaskList(DESKTOP)
    expect(html).toContain('role="table"')
    expect(html.match(/role="row"/g)).toHaveLength(TASKS.length + 1)
  })
})

describe('Schedule › Runs', () => {
  it('drops the robot aside when narrow and keeps the runs as cards', () => {
    const html = renderRuns(PHONE)
    expect(html).not.toContain('data-runs-aside')
    expect(html).not.toContain('min-width:1000px')
    expect(html.match(/data-record-card/g)?.length ?? 0).toBeGreaterThan(0)
    expect(html).not.toContain('role="table"')
    // The mission and robot stay reachable now that the aside is gone.
    expect(html).toContain('Lights check')
    expect(html).toContain('Rover 1')
    expect(html).toContain(i18n.t('missions.runs.col.mission'))
  })

  it('keeps the aside\'s robot filter reachable when narrow, as one toggle per robot', () => {
    const html = renderRuns(PHONE)
    expect(html).toContain('data-runs-robot-filter')
    for (const r of ROBOTS) {
      expect(html).toContain(`aria-label="${i18n.t('missions.runs.showRobot', { name: r.name })}"`)
    }
    expect(html).toContain('aria-pressed="true"')
  })

  it('gives the run cards\' actions no finger-sized height', () => {
    const html = renderRuns(PHONE)
    // The buttons and the Open run link; RecordCard's own row is its business.
    const controls = html.match(/<(?:button|a)\b[^>]*>/g) ?? []
    expect(controls.length).toBeGreaterThan(0)
    for (const c of controls) expect(c).not.toContain('min-height')
  })

  it('keeps the aside and the table on a tablet and the desktop', () => {
    for (const at of [TABLET, DESKTOP]) {
      const html = renderRuns(at)
      expect(html).toContain('data-runs-aside')
      expect(html).not.toMatch(/min-width:1[0-9]{3}px/) // fits a tablet's page beside the aside (2026-11-26)
      expect(html).toContain('role="table"')
      expect(html).not.toContain('data-record-card')
      expect(html).not.toContain('data-runs-robot-filter')
    }
    expect(renderRuns(TABLET)).toBe(renderRuns(DESKTOP))
  })
})
