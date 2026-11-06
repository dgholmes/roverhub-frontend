import type { MissionLibraryEntry, MissionTask, MissionType } from '@/types'
import { tasksOf } from './taskPanel'

/** A filter chip on the mission library: everything, one mission type, or
 * programs (which cut across types). */
export type LibraryFilter = { kind: 'all' } | { kind: 'type'; type: MissionType } | { kind: 'program' }

export function filterKey(f: LibraryFilter): string {
  return f.kind === 'type' ? `type:${f.type}` : f.kind
}

/** The chips worth offering: All, each type some mission has, in a fixed
 * order, and Program when there is one. A chip that could only ever show an
 * empty list is left out. */
export function libraryFilters(missions: readonly MissionLibraryEntry[]): LibraryFilter[] {
  const ORDER: MissionType[] = ['patrol', 'inspection', 'escort', 'return_to_dock', 'emergency']
  const present = new Set(missions.map((m) => m.type))
  return [
    { kind: 'all' },
    ...ORDER.filter((t) => present.has(t)).map((type): LibraryFilter => ({ kind: 'type', type })),
    ...(missions.some((m) => m.kind === 'program') ? [{ kind: 'program' } as LibraryFilter] : []),
  ]
}

/** Missions matching a chip and a name search, newest edit first. */
export function filterLibrary(
  missions: readonly MissionLibraryEntry[], filter: LibraryFilter, query: string,
): MissionLibraryEntry[] {
  const needle = query.trim().toLowerCase()
  return missions
    .filter((m) => filter.kind === 'all' || (filter.kind === 'program' ? m.kind === 'program' : m.type === filter.type))
    .filter((m) => !needle || m.name.toLowerCase().includes(needle))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
}

export interface LibraryCard {
  steps: number
  photos: number
  /** Tasks using the mission; null while the tasks have not loaded, because
   * "no tasks" would be a claim. */
  taskCount: number | null
}

export function libraryCard(m: MissionLibraryEntry, tasks: readonly MissionTask[] | null): LibraryCard {
  return {
    steps: m.waypoints.length,
    photos: m.waypoints.reduce((n, wp) => n + wp.actions.filter((a) => a.type === 'snapshot').length, 0),
    taskCount: tasks ? tasksOf(tasks, m.mission_id).length : null,
  }
}

/** The mission to preview: the one picked if it is still listed, else the first. */
export function previewed(shown: readonly MissionLibraryEntry[], pickedId: string | null): MissionLibraryEntry | null {
  return shown.find((m) => m.mission_id === pickedId) ?? shown[0] ?? null
}
