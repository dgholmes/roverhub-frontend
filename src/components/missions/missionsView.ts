import { isMissionsMapsHash, missionEditorFromHash, scheduleViewFromHash, type ScheduleView } from '@/app/routes'
import type { EditorTab } from '@/missions/authoring'
import type { MissionLibraryEntry } from '@/types'

export type MissionsView = 'missions' | 'schedule' | 'maps'

/** The view a location hash puts the Missions workspace on. Each view has a
 * hash of its own -- Maps, Schedule (and its Runs / Tasks / Calendar), and the
 * plain Missions hash for the library, which an open mission sits over. The
 * shell re-parses the route when the hash changes but does not remount this
 * workspace, so the workspace follows the hash itself: without that Back, or
 * the sidebar's Missions item, changes the address and nothing else. */
export function viewForHash(hash: string): MissionsView {
  if (isMissionsMapsHash(hash)) return 'maps'
  if (scheduleViewFromHash(hash)) return 'schedule'
  return 'missions'
}

/** Everything of the Missions workspace a hash holds. */
export interface MissionsLocation {
  view: MissionsView
  /** Only on a Schedule hash. */
  scheduleView: ScheduleView | null
  /** The mission open in the editor, if any. */
  missionId: string | null
  /** The editor tab the link asks for; the editor narrows it to the mission's kind. */
  tab: EditorTab | null
}

export function missionsLocation(hash: string): MissionsLocation {
  const editor = missionEditorFromHash(hash)
  return {
    view: viewForHash(hash),
    scheduleView: scheduleViewFromHash(hash),
    missionId: editor?.missionId ?? null,
    tab: editor?.tab ?? null,
  }
}

/** What to do with a link to a mission: open it, wait for the library to
 * load, or -- for a mission that has since been deleted, or a link from
 * another site -- treat it as missing and show the library instead. */
export function resolveMissionLink(
  missionId: string, missions: readonly MissionLibraryEntry[], loaded: boolean,
): 'open' | 'wait' | 'missing' {
  if (missions.some((m) => m.mission_id === missionId)) return 'open'
  return loaded ? 'missing' : 'wait'
}
