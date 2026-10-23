import type { DispatchRule, MissionLibraryEntry, MissionSchedule } from '@/types'

/**
 * TRANSITIONAL — remove with the editor rewrite (plan tasks 11 and 12).
 *
 * Robot, schedule and dispatch rule moved off `MissionLibraryEntry` onto
 * `MissionTask` when the wire contract split (shared/schemas/tasks.py). The
 * library table, the Rules tab and `validateMission` still read
 * them from the mission, and are rebuilt against tasks by the next tasks. Until
 * then they take this widened type so the app keeps compiling.
 *
 * What this does and does not do, so nobody mistakes it for a feature: the
 * fields exist only in the browser. The backend's `MissionLibraryEntry` ignores
 * unknown keys, so a robot or schedule set in the editor is dropped on save in
 * real mode (it persists only in the mock provider's browser storage), and the
 * backend never returns them. Scheduling is authored through `MissionTask` and
 * the provider's `saveTask`.
 */
export interface LegacySchedulingFields {
  robot_id?: string
  schedule?: MissionSchedule | null
  dispatch_rule?: DispatchRule | null
}

export type SchedulableMission = MissionLibraryEntry & LegacySchedulingFields
