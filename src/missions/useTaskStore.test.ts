import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MissionTask, TaskOccurrence } from '@/types'

const provider = vi.hoisted(() => ({
  listTasks: vi.fn(), listOccurrences: vi.fn(), saveTask: vi.fn(), deleteTask: vi.fn(),
}))
vi.mock('@/lib/realtime/dataProvider', () => ({ dataProvider: provider }))

import { useTaskStore } from './useTaskStore'

const occ = (id: string): TaskOccurrence => ({
  occurrence_id: id, task_id: 't', mission_id: 'm', site_id: 's', robot_id: null,
  due_at: '2026-10-27T00:00:00Z', status: 'scheduled', run_id: null, skip_reason: null, message: null,
})
const task = (id: string): MissionTask => ({ task_id: id } as MissionTask)

beforeEach(() => {
  vi.resetAllMocks()
  useTaskStore.setState({ siteId: null, window: null, tasks: [], tasksLoaded: false, occurrences: [], loading: false, error: null })
})

describe('useTaskStore', () => {
  it('loads the tasks and the window\'s occurrences, in the order the server gave', async () => {
    provider.listTasks.mockResolvedValue([task('a')])
    provider.listOccurrences.mockResolvedValue([occ('2'), occ('1')])
    await useTaskStore.getState().load('s', 'F', 'T')
    expect(provider.listOccurrences).toHaveBeenCalledWith('s', 'F', 'T')
    expect(useTaskStore.getState()).toMatchObject({ loading: false, error: null, tasks: [{ task_id: 'a' }] })
    expect(useTaskStore.getState().occurrences.map((o) => o.occurrence_id)).toEqual(['2', '1'])
  })

  it('lets only the window now showing land when loads overlap', async () => {
    let releaseOld!: (v: TaskOccurrence[]) => void
    provider.listTasks.mockResolvedValue([])
    provider.listOccurrences
      .mockReturnValueOnce(new Promise((r) => { releaseOld = r }))
      .mockResolvedValueOnce([occ('new')])
    const old = useTaskStore.getState().load('s', 'W1', 'W2')
    await useTaskStore.getState().load('s', 'W2', 'W3')
    releaseOld([occ('old')])
    await old
    expect(useTaskStore.getState().occurrences.map((o) => o.occurrence_id)).toEqual(['new'])
    expect(useTaskStore.getState().window).toEqual({ from: 'W2', to: 'W3' })
  })

  it('drops the previous week\'s runs while the next loads, and reports a failure', async () => {
    provider.listTasks.mockResolvedValue([])
    provider.listOccurrences.mockResolvedValueOnce([occ('1')]).mockRejectedValueOnce(new Error('no /tasks'))
    await useTaskStore.getState().load('s', 'W1', 'W2')
    const next = useTaskStore.getState().load('s', 'W2', 'W3')
    expect(useTaskStore.getState().occurrences).toEqual([])
    await next
    expect(useTaskStore.getState()).toMatchObject({ loading: false, error: 'no /tasks' })
  })

  it('does not keep showing a week as current after reloading it fails', async () => {
    provider.listTasks.mockResolvedValue([])
    provider.listOccurrences.mockResolvedValueOnce([occ('1')]).mockRejectedValueOnce(new Error('down'))
    await useTaskStore.getState().load('s', 'W1', 'W2')
    expect(useTaskStore.getState().occurrences).toHaveLength(1)
    await useTaskStore.getState().load('s', 'W1', 'W2')
    expect(useTaskStore.getState()).toMatchObject({ error: 'down', occurrences: [] })
  })

  it('adds a saved task and removes a deleted one', async () => {
    provider.saveTask.mockResolvedValue(task('n'))
    await useTaskStore.getState().save(task('n'))
    expect(useTaskStore.getState().tasks.map((t) => t.task_id)).toEqual(['n'])
    await useTaskStore.getState().remove('n')
    expect(provider.deleteTask).toHaveBeenCalledWith('n')
    expect(useTaskStore.getState().tasks).toEqual([])
  })
})

describe('useTaskStore.loadTasks (the editor wants tasks, not a week)', () => {
  it('fetches the tasks alone and leaves the window and runs of the week on show as they were', async () => {
    provider.listTasks.mockResolvedValue([])
    provider.listOccurrences.mockResolvedValue([occ('1')])
    await useTaskStore.getState().load('s', 'W1', 'W2')
    provider.listTasks.mockResolvedValue([task('a'), task('b')])
    await useTaskStore.getState().loadTasks('s')
    expect(provider.listOccurrences).toHaveBeenCalledTimes(1)
    const s = useTaskStore.getState()
    expect(s.tasks.map((t) => t.task_id)).toEqual(['a', 'b'])
    expect(s.occurrences.map((o) => o.occurrence_id)).toEqual(['1'])
    expect(s.window).toEqual({ from: 'W1', to: 'W2' })
    expect(s.tasksLoaded).toBe(true)
  })

  it('does not say there are no tasks when they could not be loaded', async () => {
    provider.listTasks.mockRejectedValue(new Error('no /tasks'))
    await useTaskStore.getState().loadTasks('s')
    expect(useTaskStore.getState()).toMatchObject({ tasks: [], tasksLoaded: false, error: 'no /tasks' })
  })

  it("drops another site's tasks at once, and ignores a late answer for the site it left", async () => {
    let releaseOld!: (v: MissionTask[]) => void
    provider.listTasks
      .mockReturnValueOnce(new Promise((r) => { releaseOld = r }))
      .mockResolvedValueOnce([task('new')])
    const old = useTaskStore.getState().loadTasks('s1')
    await useTaskStore.getState().loadTasks('s2')
    releaseOld([task('old')])
    await old
    expect(useTaskStore.getState().tasks.map((t) => t.task_id)).toEqual(['new'])
    expect(useTaskStore.getState().siteId).toBe('s2')
  })

  it('counts tasks as loaded after a full load too, and not after a failed one', async () => {
    provider.listTasks.mockResolvedValue([task('a')])
    provider.listOccurrences.mockResolvedValue([])
    await useTaskStore.getState().load('s', 'W1', 'W2')
    expect(useTaskStore.getState().tasksLoaded).toBe(true)
    // Another site: nothing carried over, so nothing is loaded until it arrives.
    provider.listTasks.mockRejectedValue(new Error('down'))
    await useTaskStore.getState().load('t', 'W1', 'W2')
    expect(useTaskStore.getState()).toMatchObject({ tasks: [], tasksLoaded: false })
  })
})

