// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { initialRobots } from '@/mocks/mockRobots'
import { RunStartRefused } from '@/lib/realtime/runStart'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import { DEFAULT_DISPATCH_RULE, type MissionLibraryEntry, type MissionTask, type RobotState } from '@/types'
import { defaultRunRobot, runMissionNowAndOpen, runRobotBlock, startMissionRun } from './startMissionRun'

const program = JSON.stringify({ blocks: { languageVersion: 0, blocks: [
  { type: 'rh_start', id: 'start', x: 30, y: 30, deletable: false, next: { block: { type: 'rh_speak', id: 'b1', fields: { TEXT: 'hello', UNTIL_DONE: 'once', VOLUME: 70 } } } },
] } })
const mission = (over: Partial<MissionLibraryEntry> = {}): MissionLibraryEntry => ({
  mission_id: 'm1', name: 'Lights', type: 'patrol', kind: 'program', version: 1, creator: 'x', updated_at: '', map_id: 'map',
  site_id: 'site-a', waypoints: [], segments: [], program_state: program, ...over,
})
const route = mission({ name: 'Pictlab', kind: 'route', program_state: undefined, waypoints: [
  { waypoint_id: 'w1', label: 'Gate A', x_m: 0, y_m: 0, z_m: null, heading_deg: null, tolerance_m: 0.5, actions: [], status: 'pending' },
] })
const deps = (over = {}) => ({
  startRun: vi.fn(async () => ({ run: { run_id: 'run-9' } }) as never),
  makeClip: vi.fn(async () => ({ clip_id: 'c1' })),
  robotType: () => 'quad' as const,
  batteryPct: () => 80 as number | null | undefined,
  ...over,
})

describe('startMissionRun', () => {
  it('posts a route as a task-less run_now with no steps', async () => {
    const d = deps()
    expect(await startMissionRun(d, route, 'r1')).toEqual({ ok: true, robotId: 'r1', runId: 'run-9' })
    expect(d.startRun).toHaveBeenCalledWith('r1', { mission: route, steps: [], source: 'run_now' })
    expect(d.makeClip).not.toHaveBeenCalled()
  })

  it('compiles a program for the robot, makes its clips, then posts the steps', async () => {
    const order: string[] = []
    const d = deps({
      makeClip: vi.fn(async () => { order.push('clip'); return { clip_id: 'c1' } }),
      startRun: vi.fn(async () => { order.push('post'); return { run: { run_id: 'x' } } as never }),
    })
    const m = mission()
    expect((await startMissionRun(d, m, 'r1')).ok).toBe(true)
    expect(order).toEqual(['clip', 'post'])
    const [robotId, req] = d.startRun.mock.calls[0] as unknown as [string, { mission: MissionLibraryEntry; steps: unknown[]; source: string }]
    expect(robotId).toBe('r1')
    expect(req.mission).toBe(m)
    expect(req.source).toBe('run_now')
    expect(req.steps.length).toBeGreaterThan(0)
  })

  it('refuses with the task Run now sentences, before posting', async () => {
    const cases: [ReturnType<typeof deps>, MissionLibraryEntry, string | RegExp][] = [
      [deps({ robotType: () => 'wheel' as const }), route, 'A route walks the map through navigation, which only a four-legged robot has.'],
      [deps({ robotType: () => null }), route, "The robot's type is not known yet; wait for it to come online."],
      [deps({ batteryPct: () => undefined }), route, "The robot's type is not known yet; wait for it to come online."],
      [deps({ batteryPct: () => 14 }), route, /15%/],
      [deps(), mission({ program_state: undefined }), 'This mission has no program to run.'],
      [deps({ makeClip: vi.fn(async () => { throw new Error('boom') }) }), mission(), /^Could not make the speech for /],
    ]
    for (const [d, m, reason] of cases) {
      const r = await startMissionRun(d, m, 'r1')
      expect(r.ok).toBe(false)
      expect(!r.ok && r.reason).toMatch(reason)
      expect(d.startRun).not.toHaveBeenCalled()
    }
  })

  it('leaves an unknown battery to the bridge', async () => {
    expect((await startMissionRun(deps({ batteryPct: () => null }), route, 'r1')).ok).toBe(true)
  })

  it("shows the backend's refusal as it was written", async () => {
    const d = deps({ startRun: vi.fn(async () => { throw new RunStartRefused('the map Office is a draft; activate it in Missions › Maps', 409) }) })
    expect(await startMissionRun(d, route, 'r1')).toEqual({ ok: false, reason: 'the map Office is a draft; activate it in Missions › Maps' })
  })
})

describe('runMissionNowAndOpen', () => {
  const robot = { ...initialRobots[1], robot_id: 'r-open', robot_type: 'quad', battery: { percent: 90, est_runtime_min: 100, charging: false } } as RobotState
  const before = { robots: useLiveOpsStore.getState().robots, startRun: useLiveOpsStore.getState().startRun }
  afterEach(() => {
    useLiveOpsStore.setState(before)
    window.location.hash = ''
  })

  it('opens LiveOps with the robot selected on success', async () => {
    const startRun = vi.fn(async () => ({ run: { run_id: 'run-1' } }) as never)
    useLiveOpsStore.setState({ robots: [robot], startRun })
    const r = await runMissionNowAndOpen('site-a', route, 'r-open')
    expect(r).toEqual({ ok: true, robotId: 'r-open', runId: 'run-1' })
    expect(startRun).toHaveBeenCalledWith('r-open', { mission: route, steps: [], source: 'run_now' })
    expect(useSessionStore.getState().selectedRobotId).toBe('r-open')
    expect(window.location.hash).toMatch(/site-a.*liveops/i)
  })

  it('stays put and returns the refusal', async () => {
    useLiveOpsStore.setState({ robots: [robot], startRun: vi.fn(async () => { throw new RunStartRefused('Robot is in E-Stop.', 409) }) })
    window.location.hash = '#/site/site-a/missions'
    expect(await runMissionNowAndOpen('site-a', route, 'r-open')).toEqual({ ok: false, reason: 'Robot is in E-Stop.' })
    expect(window.location.hash).toBe('#/site/site-a/missions')
  })
})

describe('defaultRunRobot', () => {
  const online = initialRobots[1]
  const bot = (id: string, up = true): RobotState => ({
    ...online, robot_id: id,
    connectivity: up ? { ...online.connectivity, bridge_state: 'connected', grpc: 'connected' } : { ...online.connectivity, bridge_state: 'offline' },
  })
  const task = (id: string, robot: string | null, over: Partial<MissionTask> = {}): MissionTask => ({
    task_id: id, mission_id: 'm1', site_id: 'site-a', name: null, robot_id: robot, schedule: null,
    dispatch_rule: { ...DEFAULT_DISPATCH_RULE }, status: 'enabled', max_duration_min: null,
    created_by: 'op', created_at: '', updated_at: '', version: 1, ...over,
  })
  const robots = [bot('a', false), bot('b'), bot('c')]
  const m = { mission_id: 'm1' }

  it("takes the one robot the mission's tasks use", () => {
    expect(defaultRunRobot(m, [task('t1', 'c'), task('t2', 'c'), task('t3', null)], robots, 'b')).toBe('c')
    // Archived tasks and other missions' tasks do not count.
    expect(defaultRunRobot(m, [task('t1', 'c'), task('t2', 'b', { status: 'archived' }), task('t3', 'a', { mission_id: 'm2' })], robots, null)).toBe('c')
  })

  it('falls back to the selected robot when the tasks disagree, or use a robot not at this site', () => {
    expect(defaultRunRobot(m, [task('t1', 'c'), task('t2', 'b')], robots, 'a')).toBe('a')
    expect(defaultRunRobot(m, [task('t1', 'elsewhere')], robots, 'c')).toBe('c')
  })

  it('then the first online robot, then none', () => {
    expect(defaultRunRobot(m, [], robots, 'not-here')).toBe('b')
    expect(defaultRunRobot(m, [], [bot('a', false)], null)).toBeNull()
    expect(defaultRunRobot(m, [], [], null)).toBeNull()
  })
})

describe('runRobotBlock', () => {
  const r = (over: Partial<RobotState> = {}) => ({ robot_type: 'quad', battery: { percent: 80, est_runtime_min: 1, charging: false }, ...over }) as RobotState
  const prog = { kind: 'program' } as const
  it('lets an available robot, or one with only a warning, run', () => {
    expect(runRobotBlock(r(), { status: 'available' }, prog)).toBeNull()
    expect(runRobotBlock(r(), { status: 'attention', attention: { severity: 'warning' } as never }, prog)).toBeNull()
  })
  it('blocks offline, busy and critically unwell robots', () => {
    expect(runRobotBlock(r(), { status: 'offline' }, prog)).toBe('offline')
    expect(runRobotBlock(r(), { status: 'onMission' }, prog)).toBe('busy')
    expect(runRobotBlock(r(), { status: 'inUse' }, prog)).toBe('busy')
    expect(runRobotBlock(r(), { status: 'attention', attention: { severity: 'critical' } as never }, prog)).toBe('attention')
  })
  it('blocks a wheel robot for a route only, and a known battery under 15%', () => {
    expect(runRobotBlock(r({ robot_type: 'wheel' }), { status: 'available' }, { kind: 'route' })).toBe('wheelRobot')
    expect(runRobotBlock(r({ robot_type: 'wheel' }), { status: 'available' }, prog)).toBeNull()
    expect(runRobotBlock(r({ battery: { percent: 14, est_runtime_min: 1, charging: false } }), { status: 'available' }, prog)).toBe('batteryLow')
    expect(runRobotBlock(r({ battery: { percent: null, est_runtime_min: null, charging: false } } as never), { status: 'available' }, prog)).toBeNull()
  })
})
