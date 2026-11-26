// @vitest-environment jsdom
import { act, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import { useSessionStore } from '@/store/useSessionStore'
import { DEFAULT_DISPATCH_RULE, type MissionLibraryEntry, type MissionTask, type RobotState, type RunPage, type RunSummary } from '@/types'

/**
 * The first-run confirmation (an airborne Quick action's first run on a robot)
 * at each of the three places a run starts by hand: the library's Run,
 * Schedule's Run now, and the editor's test run. Each must ask when the robot
 * has never run the mission, not ask once it has, and ask when the runs cannot
 * be read.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const h = vi.hoisted(() => ({
  listRuns: vi.fn(),
  runMission: vi.fn(),
  runTask: vi.fn(),
  startTestRun: vi.fn(),
  tasks: {} as Record<string, unknown>,
}))
vi.mock('@/lib/realtime/dataProvider', async (actual) => {
  const real = await actual<typeof import('@/lib/realtime/dataProvider')>()
  return { ...real, dataProvider: new Proxy(real.dataProvider, {
    get: (target, key) => (key === 'listRuns' ? h.listRuns : Reflect.get(target, key)),
  }) }
})
vi.mock('@/missions/startMissionRun', async (actual) => ({
  ...(await actual<typeof import('@/missions/startMissionRun')>()),
  runMissionNowAndOpen: (...args: unknown[]) => h.runMission(...args),
}))
vi.mock('@/missions/runTaskNowAndOpen', () => ({ runTaskNowAndOpen: (...args: unknown[]) => h.runTask(...args) }))
vi.mock('@/missions/useTaskStore', () => ({
  useTaskStore: (select?: (s: Record<string, unknown>) => unknown) => (select ? select(h.tasks) : h.tasks),
}))
vi.mock('@/missions/useMissionMap', () => ({ useSiteMaps: () => ({ maps: [{ map_id: 'map', status: 'active' }], shown: undefined }) }))
vi.mock('@/missions/program/edgeTestRun', async (actual) => ({
  ...(await actual<typeof import('@/missions/program/edgeTestRun')>()),
  startTestRun: (...args: unknown[]) => h.startTestRun(...args),
}))
vi.mock('@/missions/program/runBlockers', async (actual) => ({
  ...(await actual<typeof import('@/missions/program/runBlockers')>()),
  runBlockers: () => [],
}))
vi.mock('@/liveops/useRobotRun', () => ({ useRobotRun: () => ({ view: null }) }))
vi.mock('@/liveops/controlOwner', async (actual) => ({
  ...(await actual<typeof import('@/liveops/controlOwner')>()),
  useControlHolderNames: () => {},
}))

import { useEdgeTestRun } from '@/missions/program/useEdgeTestRun'
import { RunMissionButton } from './RunMissionButton'
import { TaskListView } from './TaskListView'
import { useFirstRunConfirm } from './FirstRunConfirm'

const rex: RobotState = {
  ...initialRobots[1], robot_id: 'r-rex', name: 'Rex',
  abstract_state: 'STAND', posture: 'upright', control_owner: null, robot_type: 'quad',
  battery: { percent: 90, est_runtime_min: 200, charging: false },
  connectivity: { ...initialRobots[1].connectivity, bridge_state: 'connected', grpc: 'connected' },
  bridge: initialRobots[1].bridge ? { ...initialRobots[1].bridge, last_heartbeat_at: new Date().toISOString(), nav_map_id: null } : undefined,
}
const jumper: MissionLibraryEntry = {
  mission_id: 'm-jump', name: 'Pictlab', type: 'patrol', kind: 'route', version: 1, creator: 'x', updated_at: '', map_id: 'map',
  site_id: 's1', segments: [],
  waypoints: [
    { waypoint_id: 'w1', label: 'A', x_m: 0, y_m: 0, z_m: null, heading_deg: null, tolerance_m: 0.5, actions: [], status: 'pending' },
    { waypoint_id: 'w2', label: 'B', x_m: 4, y_m: 0, z_m: null, heading_deg: null, tolerance_m: 0.5, status: 'pending', actions: [
      { type: 'quick_action', label: 'Jump', params: { state: 'jump' } },
      { type: 'quick_action', label: 'Backflip', params: { state: 'backflip' } },
    ] },
  ],
}
const task: MissionTask = {
  task_id: 't1', mission_id: 'm-jump', site_id: 's1', name: null, robot_id: 'r-rex', schedule: null,
  dispatch_rule: { ...DEFAULT_DISPATCH_RULE }, status: 'enabled', max_duration_min: null,
  created_by: 'op', created_at: '', updated_at: '', version: 1,
}
const page = (items: Partial<RunSummary>[]): RunPage => ({ items: items as RunSummary[], total: items.length, next_offset: null, sample: false })
const NEVER = () => h.listRuns.mockResolvedValue(page([]))
const BEFORE = () => h.listRuns.mockResolvedValue(page([{ run_id: 'r0', mission_id: 'm-jump', robot_id: 'r-rex' }]))
const UNREADABLE = () => h.listRuns.mockRejectedValue(new Error('GET /runs answered 503'))

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  for (const f of [h.listRuns, h.runMission, h.runTask, h.startTestRun]) f.mockReset()
  h.runMission.mockResolvedValue({ ok: true, robotId: 'r-rex', runId: 'run-1' })
  h.runTask.mockResolvedValue({ ok: true, robotId: 'r-rex', runId: 'run-1' })
  h.startTestRun.mockResolvedValue({ ok: true, runId: 'run-1' })
  h.tasks = { siteId: 's1', tasks: [task], occurrences: [], tasksLoaded: true, loading: false, error: null, load: async () => {} }
  useSessionStore.setState({ selectedRobotId: null })
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const confirmDialog = () => document.querySelector<HTMLElement>('[data-first-run-confirm]')
const answer = async (label: 'start' | 'cancel') => {
  const b = [...confirmDialog()!.querySelectorAll('button')].find((x) => x.textContent === i18n.t(`missions.firstRun.${label}`))!
  await act(async () => b.click())
}
const click = async (el: HTMLElement) => { await act(async () => el.click()) }
const buttonIn = (scope: ParentNode, text: string) => [...scope.querySelectorAll('button')].find((b) => b.textContent === text)!

describe('the first-run question', () => {
  it('names the robot and the moves', async () => {
    NEVER()
    let confirm!: ReturnType<typeof useFirstRunConfirm>['confirm']
    function Harness() {
      const f = useFirstRunConfirm()
      confirm = f.confirm
      return f.dialog
    }
    act(() => root.render(<Harness />))
    let answered: boolean | undefined
    await act(async () => { void confirm(jumper, 'r-rex', 'Rex').then((v) => { answered = v }) })
    expect(confirmDialog()!.textContent).toContain(i18n.t('missions.firstRun.body', { robot: 'Rex', moves: 'jump and backflip' }))
    await answer('cancel')
    expect(answered).toBe(false)
    expect(confirmDialog()).toBeNull()
  })
})

describe('the library’s Run', () => {
  const start = async () => {
    act(() => root.render(<RunMissionButton siteId="s1" mission={jumper} robots={[rex]} tasks={[task]} />))
    await click([...host.querySelectorAll('button')].find((b) => b.getAttribute('aria-haspopup') === 'dialog')!)
    await click(buttonIn(host.querySelector('[role="alertdialog"]')!, i18n.t('missions.library.run.start')))
  }

  it('asks on the robot’s first run, and Cancel starts nothing', async () => {
    NEVER()
    await start()
    expect(confirmDialog()).not.toBeNull()
    expect(h.runMission).not.toHaveBeenCalled()
    await answer('cancel')
    expect(h.runMission).not.toHaveBeenCalled()
  })

  it('starts on Start', async () => {
    NEVER()
    await start()
    await answer('start')
    expect(h.runMission).toHaveBeenCalledWith('s1', jumper, 'r-rex')
  })

  it('does not ask once the robot has run the mission', async () => {
    BEFORE()
    await start()
    expect(confirmDialog()).toBeNull()
    expect(h.runMission).toHaveBeenCalled()
  })

  it('asks when the runs cannot be read', async () => {
    UNREADABLE()
    await start()
    expect(confirmDialog()).not.toBeNull()
    expect(h.runMission).not.toHaveBeenCalled()
  })
})

describe('Schedule’s Run now', () => {
  const start = async () => {
    act(() => root.render(<TaskListView siteId="s1" missions={[jumper]} robots={[rex]} timezone="Asia/Seoul" onEdit={() => {}} />))
    await click(buttonIn(host, i18n.t('missions.tasks.runNow')))
  }

  it('asks on the robot’s first run; Cancel starts nothing, Start starts it', async () => {
    NEVER()
    await start()
    expect(confirmDialog()).not.toBeNull()
    await answer('cancel')
    expect(h.runTask).not.toHaveBeenCalled()
    await click(buttonIn(host, i18n.t('missions.tasks.runNow')))
    await answer('start')
    expect(h.runTask).toHaveBeenCalledWith('s1', task, jumper)
  })

  it('does not ask once the robot has run the mission', async () => {
    BEFORE()
    await start()
    expect(confirmDialog()).toBeNull()
    expect(h.runTask).toHaveBeenCalled()
  })

  it('asks when the runs cannot be read', async () => {
    UNREADABLE()
    await start()
    expect(confirmDialog()).not.toBeNull()
    expect(h.runTask).not.toHaveBeenCalled()
  })
})

describe('the editor’s test run', () => {
  let run!: ReturnType<typeof useEdgeTestRun>
  function Editor() {
    const editorRef = useRef(null)
    const firstRun = useFirstRunConfirm()
    run = useEdgeTestRun({
      mission: jumper, robots: [rex], robotId: 'r-rex', blocks: [], missionIssues: [], editorRef,
      routeMapActive: true, confirmFirstRun: firstRun.confirm,
    })
    return firstRun.dialog
  }
  const start = async () => {
    act(() => root.render(<Editor />))
    await act(async () => { void run.start() })
  }

  it('asks on the robot’s first run; Cancel starts nothing, Start starts it', async () => {
    NEVER()
    await start()
    expect(confirmDialog()).not.toBeNull()
    await answer('cancel')
    expect(h.startTestRun).not.toHaveBeenCalled()
    await act(async () => { void run.start() })
    await answer('start')
    expect(h.startTestRun).toHaveBeenCalledTimes(1)
  })

  it('does not ask once the robot has run the mission', async () => {
    BEFORE()
    await start()
    expect(confirmDialog()).toBeNull()
    expect(h.startTestRun).toHaveBeenCalledTimes(1)
  })

  it('asks when the runs cannot be read', async () => {
    UNREADABLE()
    await start()
    expect(confirmDialog()).not.toBeNull()
    expect(h.startTestRun).not.toHaveBeenCalled()
  })
})
