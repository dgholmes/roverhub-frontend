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
  useTaskStore.setState({ siteId: null, window: null, tasks: [], occurrences: [], loading: false, error: null })
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

  it('adds a saved task and removes a deleted one', async () => {
    provider.saveTask.mockResolvedValue(task('n'))
    await useTaskStore.getState().save(task('n'))
    expect(useTaskStore.getState().tasks.map((t) => t.task_id)).toEqual(['n'])
    await useTaskStore.getState().remove('n')
    expect(provider.deleteTask).toHaveBeenCalledWith('n')
    expect(useTaskStore.getState().tasks).toEqual([])
  })
})
