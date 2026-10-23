import { create } from 'zustand'
import { dataProvider } from '@/lib/realtime/dataProvider'
import type { MissionTask, TaskOccurrence } from '@/types'

/**
 * The site's tasks and the server's queue of occurrences for the window being
 * looked at. Loaded through the data provider, like `useMissionStore`. The
 * browser never works out an occurrence: `occurrences` is what the backend
 * materialised and decided, in the order it returned them.
 */
interface TaskStore {
  siteId: string | null
  /** The half-open window `occurrences` was asked for. */
  window: { from: string; to: string } | null
  tasks: MissionTask[]
  /** Whether `tasks` is what the server said, as opposed to nothing having arrived
   * yet. An empty list and a list that failed to load must not look alike. */
  tasksLoaded: boolean
  occurrences: TaskOccurrence[]
  loading: boolean
  /** Set when the queue couldn't be loaded, e.g. a backend without /tasks. */
  error: string | null
  load: (siteId: string, from: string, to: string) => Promise<void>
  /** The tasks alone, for the editor, which wants a mission's tasks and no week. */
  loadTasks: (siteId: string) => Promise<void>
  save: (task: MissionTask) => Promise<MissionTask>
  remove: (taskId: string) => Promise<void>
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  siteId: null,
  window: null,
  tasks: [],
  tasksLoaded: false,
  occurrences: [],
  loading: false,
  error: null,
  load: async (siteId, from, to) => {
    const same = (s: TaskStore) => s.siteId === siteId && s.window?.from === from && s.window?.to === to
    // Another site's tasks, or another week's runs, must not linger under the
    // new heading while it loads.
    set((s) => ({
      siteId, window: { from, to }, loading: true, error: null,
      tasks: s.siteId === siteId ? s.tasks : [],
      tasksLoaded: s.siteId === siteId && s.tasksLoaded,
      occurrences: same(s) ? s.occurrences : [],
    }))
    try {
      const [tasks, occurrences] = await Promise.all([
        dataProvider.listTasks(siteId),
        dataProvider.listOccurrences(siteId, from, to),
      ])
      // Paging quickly through weeks leaves several loads in flight; only the
      // one for the window now showing may land.
      if (same(get())) set({ tasks, tasksLoaded: true, occurrences, loading: false })
    } catch (e) {
      // Clear the runs too: a week that failed to reload must not stay up as current.
      if (same(get())) set({ loading: false, occurrences: [], error: e instanceof Error ? e.message : String(e) })
    }
  },
  loadTasks: async (siteId) => {
    set((s) => (s.siteId === siteId ? { error: null } : {
      siteId, window: null, tasks: [], tasksLoaded: false, occurrences: [], error: null,
    }))
    try {
      const tasks = await dataProvider.listTasks(siteId)
      if (get().siteId === siteId) set({ tasks, tasksLoaded: true })
    } catch (e) {
      if (get().siteId === siteId) set({ error: e instanceof Error ? e.message : String(e) })
    }
  },
  save: async (task) => {
    const stored = await dataProvider.saveTask(task)
    set((s) => ({
      tasks: s.tasks.some((t) => t.task_id === stored.task_id)
        ? s.tasks.map((t) => (t.task_id === stored.task_id ? stored : t))
        : [stored, ...s.tasks],
    }))
    return stored
  },
  remove: async (taskId) => {
    await dataProvider.deleteTask(taskId)
    set((s) => ({ tasks: s.tasks.filter((t) => t.task_id !== taskId) }))
  },
}))
