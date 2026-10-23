import { DEFAULT_CONSTRAINTS, DEFAULT_DISPATCH_RULE } from '@/types'
import type { MissionKind, MissionLibraryEntry } from '@/types'
import type { SchedulableMission } from './transitionalScheduling'

export type EditorTab = 'route' | 'program' | 'rules' | 'announcements'

/**
 * A mission is a route or a program from the moment it is created, and stays
 * one. The backend refuses a program carrying waypoints or a route carrying
 * `program_state` (422), so the console never builds the "both" shape: a new
 * mission starts as exactly one kind, and only that kind's editor is offered
 * (`editorTabs`).
 *
 * A new program has no `program_state` yet. The Program tab seeds it the
 * moment the block canvas opens (`shouldSaveProgramState`), and a program
 * opens on that tab (`startTab`), so a saved program always has one.
 */
export function blankMission(name: string, siteId: string, creator: string, kind: MissionKind): SchedulableMission {
  return {
    mission_id: `mission-${Date.now().toString(36)}`,
    name, type: 'patrol', kind, version: 1, creator,
    updated_at: new Date().toISOString(), map_id: `map-${siteId}`, site_id: siteId,
    waypoints: [], segments: [],
    constraints: DEFAULT_CONSTRAINTS, dispatch_rule: DEFAULT_DISPATCH_RULE, schedule: null,
  }
}

/** The editor tabs a mission of this kind has: a route has the map, a program
 * the block canvas, and neither has the other's. */
export function editorTabs(kind: MissionKind): EditorTab[] {
  return [kind === 'program' ? 'program' : 'route', 'announcements', 'rules']
}

/** The tab to open on: the one asked for if the mission has it, else its first. */
export function startTab(kind: MissionKind, wanted: EditorTab): EditorTab {
  const tabs = editorTabs(kind)
  return tabs.includes(wanted) ? wanted : tabs[0]
}

/**
 * The mission after the block canvas reports its serialised state. Returns the
 * same object when nothing changed, so opening the Program tab does not mark
 * an untouched mission unsaved.
 *
 * This writes the state and nothing else. There is deliberately no compile
 * step: the old one dead-reckoned waypoints from (0, 0) out of the relative
 * move blocks and wrote them onto the mission, which gave a program a route
 * that corresponds to no real place and a 422 from the backend. A program has
 * no map frame; where one actually went is a run record, not a prediction.
 */
export function applyProgramState(mission: MissionLibraryEntry, state: string): MissionLibraryEntry {
  return state === mission.program_state ? mission : { ...mission, program_state: state }
}

/**
 * Whether a Program-tab event should store the canvas state.
 *
 * Opening the tab stores it only for a program that has none, to seed a new
 * one: re-serialising a saved program on open could differ textually from what
 * is stored and mark it unsaved. Interface events (selecting, scrolling,
 * zooming) never store. A real block edit always does.
 */
export function shouldSaveProgramState({ onOpen, isUiEvent, hasProgram }: {
  onOpen: boolean
  isUiEvent: boolean
  hasProgram: boolean
}): boolean {
  if (onOpen) return !hasProgram
  return !isUiEvent
}
