import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/realtime/mqttClient', () => ({ connectBroker: vi.fn(() => ({ on: vi.fn() })) }))

import { RealDataProvider, WIRED_COMMAND_TYPES } from '@/lib/realtime/realDataProvider'
import { mockDataProvider } from '@/mocks/mockDataProvider'
import { useMissionStore } from '@/missions/useMissionStore'
import { ApiError, conflictOf } from '@/lib/realtime/apiError'
import { RUN_REASON_TEXT } from '@/missions/program/run'
import { en } from '@/i18n/locales/en'
import { ko } from '@/i18n/locales/ko'
import { missions as enMissions } from '@/i18n/locales/en/missions'
import { missions as koMissions } from '@/i18n/locales/ko/missions'
import { CONDITION_KINDS, STEP_KINDS, type CommandStep, type Step } from '@/missions/program/types'
import { RunStartRefused } from '@/lib/realtime/runStart'

/** A compiled program, as Run now sends it. */
const runSteps: Step[] = [{ kind: 'wait', blockId: 'b1', seconds: 1, label: 'Wait 1 s' }]
import {
  MISSION_KINDS, OCCURRENCE_STATUSES, SCHEDULE_RECURRENCES, SKIP_REASONS, TASK_STATUSES,
  COMMAND_TYPES, RUN_EVENT_KINDS, RUN_RESULTS,
  type ActiveRun, type DispatchRule, type MissionEstimates, type MissionRun, type RunEvent, type MissionLibraryEntry, type MissionSchedule, type MissionTask, type TaskOccurrence,
} from '@/types'

// --- The mirror against the Python it mirrors ------------------------------
//
// types/ is hand-maintained, and a drift there does not fail loudly: a field
// the TypeScript forgot is simply never read, and a literal it forgot is a
// string no `switch` handles. `mission_missing` is the live example -- it was
// added to SkipReason late, and without it a deleted mission renders as
// `no_executor` ("waiting on hardware"). These read shared/ directly.

// Resolved from this file, not from the cwd, so running vitest from another
// directory cannot make the guard lose its subject.
const SHARED = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'shared', 'schemas')
const haveShared = existsSync(path.join(SHARED, 'tasks.py')) && existsSync(path.join(SHARED, 'missions.py'))
// A skipped drift test reports a tidy "skipped" while catching nothing, and it is
// the only thing standing between the two type systems. So a missing shared/ is
// never quiet: it fails outright where CI is set, and warns loudly everywhere else.
const driftGuardUnavailable = `the TypeScript/Python drift test did NOT run: shared/schemas not found at ${SHARED} (resolved from this test file). Clone shared/ beside roverhub-frontend/.`
if (!haveShared) console.warn(`
!!! ${driftGuardUnavailable}
`)

it.runIf(!haveShared && !!process.env.CI)('has shared/schemas to compare against, because CI must not skip the drift test', () => {
  throw new Error(driftGuardUnavailable)
})
const py = (file: string) => readFileSync(path.join(SHARED, file), 'utf8')

/** The members of a module-level `Name = Literal[...]`. */
function pythonLiteral(source: string, name: string): string[] {
  const m = new RegExp(`^${name} = Literal\\[([^\\]]*)\\]`, 'm').exec(source.replace(/#.*$/gm, '')) // comments quote strings and brackets
  if (!m) throw new Error(`no Literal ${name} in the schema`)
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])
}

/** The annotated fields of a class body: lines `    name: ...` at class depth. */
function pythonFields(source: string, cls: string): string[] {
  const start = source.search(new RegExp(`^class ${cls}\\(`, 'm'))
  if (start < 0) throw new Error(`no class ${cls} in the schema`)
  const rest = source.slice(start).split(/\r?\n/).slice(1)
  const end = rest.findIndex((l) => /^\S/.test(l))
  const body = end < 0 ? rest : rest.slice(0, end)
  return body.map((l) => /^ {4}([a-z_]\w*):/.exec(l)?.[1]).filter((f): f is string => !!f)
}

/** The members of a module-level `NAME = {"A", "B", ...}` set (may span lines). */
function pythonSet(source: string, name: string): string[] {
  const m = new RegExp(`^${name} = \{([^}]*)\}`, 'm').exec(source.replace(/#.*$/gm, ''))
  if (!m) throw new Error(`no set ${name} in the schema`)
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1])
}

const sorted = (xs: readonly string[]) => [...xs].sort()

describe.skipIf(!haveShared)('the TypeScript mirror matches shared/schemas', () => {
  it('has every SkipReason, including mission_missing', () => {
    expect(sorted(SKIP_REASONS)).toEqual(sorted(pythonLiteral(py('tasks.py'), 'SkipReason')))
    expect(SKIP_REASONS).toContain('mission_missing')
  })

  it('has every OccurrenceStatus, TaskStatus, recurrence and mission kind', () => {
    expect(sorted(OCCURRENCE_STATUSES)).toEqual(sorted(pythonLiteral(py('tasks.py'), 'OccurrenceStatus')))
    expect(sorted(TASK_STATUSES)).toEqual(sorted(pythonLiteral(py('tasks.py'), 'TaskStatus')))
    expect(sorted(SCHEDULE_RECURRENCES)).toEqual(sorted(pythonLiteral(py('tasks.py'), 'ScheduleRecurrence')))
    expect(sorted(MISSION_KINDS)).toEqual(sorted(pythonLiteral(py('missions.py'), 'MissionKind')))
  })

  // Each fixture is typed with the interface, so tsc fails if the TypeScript
  // lacks a key written here; the assertion fails if the Python has one the
  // fixture (and so, by that typing, the interface) lacks.
  it('has every field of MissionTask', () => {
    expect(sorted(Object.keys(task))).toEqual(sorted(pythonFields(py('tasks.py'), 'MissionTask')))
  })

  it('has every field of TaskOccurrence', () => {
    expect(sorted(Object.keys(occurrence))).toEqual(sorted(pythonFields(py('tasks.py'), 'TaskOccurrence')))
  })

  it('has every field of DispatchRule', () => {
    expect(sorted(Object.keys(task.dispatch_rule satisfies DispatchRule))).toEqual(sorted(pythonFields(py('tasks.py'), 'DispatchRule')))
  })

  it('has every field of MissionSchedule, including until and skip_dates', () => {
    expect(sorted(Object.keys(schedule))).toEqual(sorted(pythonFields(py('tasks.py'), 'MissionSchedule')))
  })

  it('has every field of MissionLibraryEntry, and none of the four it lost', () => {
    const fields = sorted(Object.keys(programMission))
    expect(fields).toEqual(sorted(pythonFields(py('missions.py'), 'MissionLibraryEntry')))
    for (const gone of ['robot_id', 'schedule', 'dispatch_rule', 'library_status']) expect(fields).not.toContain(gone)
  })

  it('has every Step kind and every Condition kind', () => {
    expect(sorted(CONDITION_KINDS)).toEqual(sorted(pythonLiteral(py('missions.py'), 'ConditionKind')))
    // Each step model declares `kind: Literal["..."]`.
    const stepKinds = [...py('missions.py').matchAll(/^ {4}kind: Literal\["(\w+)"\]/gm)].map((m) => m[1])
    expect(sorted(STEP_KINDS)).toEqual(sorted(stepKinds))
  })

  it('mirrors RunEventKind and RunResult', () => {
    expect(sorted(RUN_EVENT_KINDS)).toEqual(sorted(pythonLiteral(py('runs.py'), 'RunEventKind')))
    expect(sorted(RUN_RESULTS)).toEqual(sorted(pythonLiteral(py('runs.py'), 'RunResult')))
  })

  it('has every field of RunEvent and MissionRun', () => {
    const event: Required<RunEvent> = {
      run_id: 'r', seq: 0, at: 't', kind: 'step_started', waypoint_id: null, task_index: null, actor: null,
      media: null, position: null, detection: null, message: null,
      block_id: null, result: null, reason: null, snapshot_id: null,
    }
    expect(sorted(Object.keys(event))).toEqual(sorted(pythonFields(py('runs.py'), 'RunEvent')))
    const run: Required<MissionRun> = {
      run_id: 'r', mission_id: 'm', mission: programMission, robot_id: 'x', site_id: 's', started_at: 't',
      ended_at: null, result: 'running', started_by: 'op', end_reason: null, bucket_copied_at: null,
      source: null, bridge_boot_id: null,
    }
    expect(sorted(Object.keys(run))).toEqual(sorted(pythonFields(py('runs.py'), 'MissionRun')))
  })

  it('has every field of ActiveRun', () => {
    const active: Required<ActiveRun> = {
      run_id: 'r', status: 'paused', step_label: null, block_id: null, started_at: 't', redo_step_label: null,
    }
    expect(sorted(Object.keys(active))).toEqual(sorted(pythonFields(py('bridge_status.py'), 'ActiveRun')))
  })

  it('mirrors CommandType and WIRED_COMMAND_TYPES', () => {
    expect(sorted(COMMAND_TYPES)).toEqual(sorted(pythonLiteral(py('commands.py'), 'CommandType')))
    expect(sorted([...WIRED_COMMAND_TYPES])).toEqual(sorted(pythonSet(py('commands.py'), 'WIRED_COMMAND_TYPES')))
  })

  it('translates every run event kind and every reason', () => {
    for (const [lang, root, missions] of [['en', en, enMissions], ['ko', ko, koMissions]] as const) {
      const kinds = (root as any).data.run.kind
      for (const k of RUN_EVENT_KINDS) expect(kinds[k], `${lang} data.run.kind.${k}`).toBeTruthy()
      const reasons = (missions as any).program.run.reason
      for (const r of Object.keys(RUN_REASON_TEXT)) expect(reasons[r], `${lang} reason.${r}`).toBeTruthy()
    }
  })

  it('has every field of CommandStep', () => {
    // Every optional key is present, so a field added on one side only fails here.
    const step: Required<CommandStep> = {
      kind: 'command', blockId: 'b1', type: 'SPEAK', params: {}, label: 'say', quadOnly: false,
      speech: { text: 'hi', untilDone: true },
    }
    expect(sorted(Object.keys(step))).toEqual(sorted(pythonFields(py('missions.py'), 'CommandStep')))
  })

  it('has every field of MissionEstimates, including duration_bounded', () => {
    expect(sorted(Object.keys(programMission.estimates!))).toEqual(sorted(pythonFields(py('missions.py'), 'MissionEstimates')))
  })
})

// --- Fixtures in the backend's shape ---------------------------------------

const schedule: MissionSchedule = {
  schedule_id: 'sch-1', recurrence: 'weekly', start_at: '2026-10-26T06:00', timezone: 'Asia/Seoul',
  days_of_week: [0, 2], window_minutes: 30, until: '2026-12-31', skip_dates: ['2026-11-02'],
}

const task: MissionTask = {
  task_id: 'task-1', mission_id: 'mission-1', site_id: 'site-a', name: 'Morning patrol', robot_id: 'robot-1', schedule,
  dispatch_rule: {
    min_battery_pct: 30, require_network: true, require_approval: false,
    block_if_maintenance_flagged: true, max_wind_kph: null, require_safety_checklist: false,
  },
  status: 'enabled', max_duration_min: 45, created_by: 'operator-dev',
  created_at: '2026-10-23T00:00:00Z', updated_at: '2026-10-23T00:00:00Z', version: 1,
}

const occurrence: TaskOccurrence = {
  occurrence_id: 'task-1-20261026T060000Z', task_id: 'task-1', mission_id: 'mission-1', site_id: 'site-a',
  robot_id: 'robot-1', due_at: '2026-10-25T21:00:00Z', status: 'skipped', run_id: null,
  skip_reason: 'mission_missing', message: 'mission mission-1 no longer exists',
}

/** A program mission: no waypoints, no segments, a serialized Blockly workspace. */
const programMission: MissionLibraryEntry = {
  mission_id: 'mission-prog', name: 'Lobby loop', type: 'patrol', kind: 'program', version: 1,
  creator: 'operator-dev', updated_at: '2026-10-23T00:00:00Z', map_id: 'map-a', site_id: 'site-a',
  waypoints: [], segments: [],
  constraints: { stairs_allowed: false, max_slope_deg: null, min_clearance_m: null, area_type: 'indoor', no_go_zone_ids: [], surface_type: 'unknown', human_proximity_policy: 'none' },
  validation: { status: 'unvalidated', issues: [] },
  estimates: { length_m: null, duration_s: 120, energy_wh: null, duration_bounded: false } satisfies MissionEstimates,
  program_state: '{"blocks":{}}', program_steps: { compiler_version: 1, quad: [], wheel: [] }, announcements: [], recording: { enabled: true, cameras: ['front'] },
}

describe('the backend shapes', () => {
  it('parses a task and an occurrence from the backend shape', () => {
    // What comes off the wire is plain JSON; nothing may be lost on the way.
    const wire = JSON.parse(JSON.stringify({ items: [task] })) as { items: MissionTask[] }
    expect(wire.items[0]).toEqual(task)
    expect(wire.items[0].schedule?.until).toBe('2026-12-31')
    expect(wire.items[0].schedule?.skip_dates).toEqual(['2026-11-02'])
    const occ = JSON.parse(JSON.stringify(occurrence)) as TaskOccurrence
    expect(occ.skip_reason).toBe('mission_missing')
    expect(SKIP_REASONS).toContain(occ.skip_reason)
    expect(OCCURRENCE_STATUSES).toContain(occ.status)
  })

  it('round-trips a program mission with no waypoints', () => {
    const back = JSON.parse(JSON.stringify(programMission)) as MissionLibraryEntry
    expect(back).toEqual(programMission)
    expect(back.kind).toBe('program')
    expect(back.waypoints).toEqual([])
    expect(back.estimates?.duration_bounded).toBe(false)
  })
})

// --- Real provider: the endpoints ------------------------------------------

function makeReal() {
  return new RealDataProvider({ wsUrl: 'ws://localhost:9001', apiBaseUrl: 'http://api.test', siteId: 'site-a' })
}

/** Resolves every fetch with `body`, and records what was asked. */
function stubFetch(body: unknown, init: { ok?: boolean; status?: number } = {}) {
  const fn = vi.fn().mockResolvedValue({ ok: init.ok ?? true, status: init.status ?? 200, json: () => Promise.resolve(body) })
  vi.stubGlobal('fetch', fn)
  return fn
}
const lastCall = (fn: ReturnType<typeof vi.fn>) => {
  const c = fn.mock.calls[fn.mock.calls.length - 1]
  return { url: c[0] as string, init: (c[1] ?? {}) as RequestInit }
}

describe('RealDataProvider tasks', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('lists tasks for a site', async () => {
    const fetchFn = stubFetch({ items: [task] })
    expect(await makeReal().listTasks('site a')).toEqual([task])
    expect(lastCall(fetchFn).url).toBe('http://api.test/tasks?site_id=site%20a')
  })

  it('saves a task with PUT, sending its version and returning what the server stored', async () => {
    const stored = { ...task, version: 2 }
    const fetchFn = stubFetch(stored)
    const result = await makeReal().saveTask({ ...task, version: 1 })
    const { url, init } = lastCall(fetchFn)
    expect(url).toBe('http://api.test/tasks/task-1')
    expect(init.method).toBe('PUT')
    expect((JSON.parse(init.body as string) as MissionTask).version).toBe(1)
    expect(result.version).toBe(2)
  })

  it('throws on a stale task write rather than pretending it saved', async () => {
    stubFetch({ ...task, version: 5 }, { ok: false, status: 409 })
    await expect(makeReal().saveTask(task)).rejects.toThrow(/409/)
  })

  it('raises a typed error for a stale write, carrying the stored task', async () => {
    const stored = { ...task, version: 5 }
    stubFetch(stored, { ok: false, status: 409 })
    const e = await makeReal().saveTask(task).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(ApiError)
    expect(e).toMatchObject({ status: 409, body: stored })
    expect(conflictOf(e)).toEqual({ kind: 'stale', stored })
  })

  it('raises a refusal for a refused run-now, carrying the reason, not a stale write', async () => {
    stubFetch({ detail: 'task is paused; only an enabled task can be run' }, { ok: false, status: 409 })
    const e = await makeReal().runTaskNow('task-1', runSteps).catch((x: unknown) => x)
    expect(e).toBeInstanceOf(RunStartRefused)
    expect(e).toMatchObject({ status: 409, message: 'task is paused; only an enabled task can be run' })
  })

  it('raises the same typed error for a stale mission write', async () => {
    const stored = { ...programMission, version: 8 }
    stubFetch(stored, { ok: false, status: 409 })
    const e = await makeReal().saveMission(programMission).catch((x: unknown) => x)
    expect(conflictOf(e)).toEqual({ kind: 'stale', stored })
  })

  it('deletes a task, and treats an already-gone one as deleted', async () => {
    const fetchFn = stubFetch({}, { ok: false, status: 404 })
    await expect(makeReal().deleteTask('task-1')).resolves.toBeUndefined()
    expect(lastCall(fetchFn)).toMatchObject({ url: 'http://api.test/tasks/task-1', init: { method: 'DELETE' } })
    stubFetch({}, { ok: false, status: 500 })
    await expect(makeReal().deleteTask('task-1')).rejects.toThrow(/500/)
  })

  it('percent-encodes the occurrence bounds, so a + offset is not decoded to a space', async () => {
    const fetchFn = stubFetch({ items: [occurrence] })
    const result = await makeReal().listOccurrences('site-a', '2026-10-23T00:00:00+09:00', '2026-10-30T00:00:00+09:00')
    expect(result).toEqual([occurrence])
    const { url } = lastCall(fetchFn)
    expect(url).toContain('from=2026-10-23T00%3A00%3A00%2B09%3A00')
    expect(url).toContain('to=2026-10-30T00%3A00%3A00%2B09%3A00')
    expect(url).toContain('site_id=site-a')
    expect(url.startsWith('http://api.test/tasks/occurrences?')).toBe(true)
    expect(url).not.toContain('+')
  })

  it('starts a run-now with POST and its steps, and returns the occurrence and the run', async () => {
    const started = { ...occurrence, status: 'running', skip_reason: null, run_id: occurrence.occurrence_id }
    const run = { run_id: occurrence.occurrence_id }
    const fetchFn = stubFetch({ occurrence: started, run, command: {} }, { status: 201 })
    expect(await makeReal().runTaskNow('task-1', runSteps)).toEqual({ occurrence: started, run })
    expect(lastCall(fetchFn)).toMatchObject({ url: 'http://api.test/tasks/task-1/run-now', init: { method: 'POST' } })
    // Never the old body-less call, which only queues.
    expect(JSON.parse(String(lastCall(fetchFn).init.body))).toEqual({ steps: runSteps, started_by: 'operator-dev' })
  })

  it('throws when run-now is refused, so a paused task is not shown as started', async () => {
    stubFetch({ detail: 'task is paused' }, { ok: false, status: 409 })
    await expect(makeReal().runTaskNow('task-1', runSteps)).rejects.toThrow(/paused/)
  })
})

describe('RealDataProvider missions', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends the mission version it was given and returns the stored one', async () => {
    const fetchFn = stubFetch({ ...programMission, version: 4 })
    const stored = await makeReal().saveMission({ ...programMission, version: 3 })
    expect((JSON.parse(lastCall(fetchFn).init.body as string) as MissionLibraryEntry).version).toBe(3)
    expect(stored.version).toBe(4)
  })
})

// --- Mock provider: the same shapes, kept in browser storage ----------------

function fakeStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() { return data.size },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => { data.delete(k) },
    setItem: (k, v) => { data.set(k, v) },
  }
}

describe('mockDataProvider', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', fakeStorage()) })
  afterEach(() => vi.unstubAllGlobals())

  it('stores a created mission at version 1 whatever the body carried', async () => {
    const stored = await mockDataProvider.saveMission({ ...programMission, mission_id: 'new-1', version: 9 })
    expect(stored.version).toBe(1)
  })

  it('increments the version on each write and refuses a stale one', async () => {
    const first = await mockDataProvider.saveMission({ ...programMission, mission_id: 'm-v' })
    const second = await mockDataProvider.saveMission({ ...first, name: 'renamed' })
    expect(second.version).toBe(2)
    await expect(mockDataProvider.saveMission({ ...first, name: 'stale' })).rejects.toThrow(/stale|409/)
    const listed = await mockDataProvider.listMissions('site-a')
    expect(listed.find((m) => m.mission_id === 'm-v')).toMatchObject({ name: 'renamed', version: 2 })
  })

  it('round-trips a program mission with no waypoints', async () => {
    await mockDataProvider.saveMission({ ...programMission, mission_id: 'm-prog' })
    const back = (await mockDataProvider.listMissions('site-a')).find((m) => m.mission_id === 'm-prog')!
    expect(back).toMatchObject({ kind: 'program', waypoints: [], program_state: '{"blocks":{}}' })
    expect(back.estimates?.duration_bounded).toBe(false)
  })

  it('gives sample missions a kind and a version', async () => {
    const sample = await mockDataProvider.listMissions('site-north-yard')
    expect(sample.length).toBeGreaterThan(0)
    for (const m of sample) {
      expect(MISSION_KINDS).toContain(m.kind)
      expect(m.version).toBe(1)
    }
  })

  it('tolerates a mission saved by an older console, which has no kind or version', async () => {
    localStorage.setItem('rh.mock.missions', JSON.stringify([
      { mission_id: 'old-route', name: 'Old', type: 'patrol', library_status: 'draft', creator: 'x', updated_at: '', map_id: 'm', site_id: 'site-a', waypoints: [], segments: [] },
      { mission_id: 'old-prog', name: 'Old', type: 'patrol', library_status: 'draft', creator: 'x', updated_at: '', map_id: 'm', site_id: 'site-a', waypoints: [], segments: [], program_state: '{}' },
    ]))
    const [route, program] = await mockDataProvider.listMissions('site-a')
    expect(route).toMatchObject({ kind: 'route', version: 1 })
    expect(program).toMatchObject({ kind: 'program', version: 1 })
  })

  it('saves a task at version 1, then bumps it, and refuses a stale write', async () => {
    const created = await mockDataProvider.saveTask({ ...task, task_id: 'mt-1', version: 7 })
    expect(created.version).toBe(1)
    const edited = await mockDataProvider.saveTask({ ...created, max_duration_min: 60 })
    expect(edited.version).toBe(2)
    await expect(mockDataProvider.saveTask({ ...created, max_duration_min: 5 })).rejects.toThrow(/stale|409/)
    // The same typed error the real provider raises, with the stored entity as its body.
    const stale = await mockDataProvider.saveTask({ ...created, max_duration_min: 5 }).catch((x: unknown) => x)
    expect(stale).toBeInstanceOf(ApiError)
    expect(conflictOf(stale)).toEqual({ kind: 'stale', stored: expect.objectContaining({ task_id: 'mt-1', version: 2, max_duration_min: 60 }) })
    expect((await mockDataProvider.listTasks('site-a')).find((t) => t.task_id === 'mt-1')).toMatchObject({ max_duration_min: 60, version: 2 })
  })

  it('lists tasks per site and deletes them', async () => {
    await mockDataProvider.saveTask({ ...task, task_id: 'mt-a', site_id: 'site-a' })
    await mockDataProvider.saveTask({ ...task, task_id: 'mt-b', site_id: 'site-b' })
    expect((await mockDataProvider.listTasks('site-b')).map((t) => t.task_id)).toEqual(['mt-b'])
    await mockDataProvider.deleteTask('mt-b')
    expect(await mockDataProvider.listTasks('site-b')).toEqual([])
    await expect(mockDataProvider.deleteTask('mt-b')).resolves.toBeUndefined()
  })

  it('starts a run-now as a running occurrence the listing then returns', async () => {
    await mockDataProvider.saveMission({ ...programMission, mission_id: task.mission_id })
    const created = await mockDataProvider.saveTask({ ...task, task_id: 'mt-run', site_id: 'site-a', robot_id: 'zaezae-x1-002' })
    const { occurrence: queued, run } = await mockDataProvider.runTaskNow('mt-run', runSteps)
    expect(queued).toMatchObject({ task_id: 'mt-run', mission_id: created.mission_id, site_id: 'site-a', status: 'running', run_id: run.run_id, skip_reason: null })
    expect(run).toMatchObject({ run_id: queued.occurrence_id, source: 'run_now', robot_id: 'zaezae-x1-002' })
    const from = new Date(Date.now() - 60_000).toISOString()
    const to = new Date(Date.now() + 60_000).toISOString()
    expect((await mockDataProvider.listOccurrences('site-a', from, to)).map((o) => o.occurrence_id)).toContain(queued.occurrence_id)
    expect(await mockDataProvider.listOccurrences('site-b', from, to)).toEqual([])
  })

  it('materialises a task schedule into the asked-for window, half-open, in the server order', async () => {
    const weekly = { ...task.schedule!, recurrence: 'weekly' as const, start_at: '2026-10-05T06:00', timezone: 'Asia/Seoul', days_of_week: [0, 2], until: null, skip_dates: [] }
    await mockDataProvider.saveTask({ ...task, task_id: 'mt-w', site_id: 'site-a', schedule: weekly })
    const week = await mockDataProvider.listOccurrences('site-a', '2026-10-25T15:00:00.000Z', '2026-11-01T15:00:00.000Z')
    expect(week.map((o) => o.due_at)).toEqual(['2026-10-25T21:00:00Z', '2026-10-27T21:00:00Z'])
    // The next week starts exactly where this one ends: nothing is in both.
    const next = await mockDataProvider.listOccurrences('site-a', '2026-11-01T15:00:00.000Z', '2026-11-08T15:00:00.000Z')
    expect(next.map((o) => o.due_at)).toEqual(['2026-11-01T21:00:00Z', '2026-11-03T21:00:00Z'])
    expect(await mockDataProvider.listOccurrences('site-b', '2026-10-25T15:00:00.000Z', '2026-11-01T15:00:00.000Z')).toEqual([])
  })

  it('keeps a queued run-now rather than overwriting it with the materialised run for the same slot', async () => {
    vi.useFakeTimers()
    try {
      // 09:00 Seoul is 00:00:00Z: the scheduled slot and the run-now share an id.
      vi.setSystemTime(new Date('2026-10-26T00:00:00Z'))
      const once = { ...task.schedule!, recurrence: 'once' as const, start_at: '2026-10-26T09:00', timezone: 'Asia/Seoul', days_of_week: [] }
      await mockDataProvider.saveMission({ ...programMission, mission_id: task.mission_id })
      await mockDataProvider.saveTask({ ...task, task_id: 'mt-once', site_id: 'site-a', schedule: once, robot_id: 'zaezae-x1-003' })
      const { occurrence: queued } = await mockDataProvider.runTaskNow('mt-once', runSteps)
      const listed = await mockDataProvider.listOccurrences('site-a', '2026-10-25T00:00:00Z', '2026-10-27T00:00:00Z')
      expect(listed.map((o) => o.occurrence_id)).toEqual([queued.occurrence_id])
      expect(listed[0]).toMatchObject({ status: 'running', skip_reason: null })
    } finally { vi.useRealTimers() }
  })

  it('refuses to run a task that is not enabled, or does not exist', async () => {
    await mockDataProvider.saveTask({ ...task, task_id: 'mt-paused', status: 'paused' })
    await expect(mockDataProvider.runTaskNow('mt-paused', runSteps)).rejects.toThrow(/paused/)
    await expect(mockDataProvider.runTaskNow('nope', runSteps)).rejects.toThrow()
    // The same shape the real provider raises: a refusal with a reason.
    const refused = await mockDataProvider.runTaskNow('mt-paused', runSteps).catch((x: unknown) => x)
    expect(refused).toBeInstanceOf(RunStartRefused)
    expect(refused).toMatchObject({ status: 409, message: expect.stringContaining('paused') })
    expect(await mockDataProvider.runTaskNow('nope', runSteps).catch((x: unknown) => x)).toMatchObject({ status: 404 })
  })

  it('raises the typed error for a stale mission write too', async () => {
    const first = await mockDataProvider.saveMission({ ...programMission, mission_id: 'm-typed' })
    await mockDataProvider.saveMission({ ...first, name: 'renamed' })
    const stale = await mockDataProvider.saveMission({ ...first, name: 'stale' }).catch((x: unknown) => x)
    expect(conflictOf(stale)).toEqual({ kind: 'stale', stored: expect.objectContaining({ mission_id: 'm-typed', version: 2 }) })
  })
})

// --- The path the editor takes: read, edit, save back -----------------------

describe('a mission read, edited and saved back through the store', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', fakeStorage())
    useMissionStore.setState({ siteId: null, missions: [], loading: false, error: null })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('can be saved more than once -- every save after the first used to be at risk', async () => {
    const { load, save } = useMissionStore.getState()
    await load('site-north-yard')
    const original = useMissionStore.getState().missions[0]
    expect(original.version).toBe(1)

    // What MissionEditor does: copy the entry, change it, send it, adopt the response.
    const first = await save({ ...original, name: 'edit 1' })
    expect(first.version).toBe(2)
    const second = await save({ ...first, name: 'edit 2' })
    expect(second.version).toBe(3)
    expect(useMissionStore.getState().missions.find((m) => m.mission_id === original.mission_id)).toMatchObject({ name: 'edit 2', version: 3 })
  })
})
