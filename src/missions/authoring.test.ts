import { describe, expect, it } from 'vitest'
import type { MissionLibraryEntry } from '@/types'
import type { MissionEstimates } from '@/types'
import { applyProgramState, blankMission, editorTabs, estimatesDiffer, shouldSaveProgramState, startTab } from './authoring'

/** The invariant table of shared/schemas/missions.py, which the router enforces with a 422. */
function violations(m: MissionLibraryEntry): string[] {
  const out: string[] = []
  if (m.kind === 'program') {
    if (m.program_state === undefined) out.push('program without program_state')
    if (m.waypoints.length > 0 || m.segments.length > 0) out.push('program with waypoints or segments')
  } else if (m.program_state !== undefined) out.push('route with program_state')
  return out
}

describe('blankMission', () => {
  it('makes a route a route, with nothing a program owns', () => {
    const m = blankMission('R', 'site-a', 'op', 'route')
    expect(m.kind).toBe('route')
    expect(violations(m)).toEqual([])
  })

  it('makes a program a program, with no route and no dead-reckoned anything', () => {
    const m = blankMission('P', 'site-a', 'op', 'program')
    expect(m.kind).toBe('program')
    expect(m.waypoints).toEqual([])
    expect(m.segments).toEqual([])
  })

  it('carries no robot, schedule or dispatch rule: those belong to a task, and the backend drops them', () => {
    const m = blankMission('R', 'site-a', 'op', 'route')
    for (const gone of ['robot_id', 'schedule', 'dispatch_rule', 'library_status']) expect(m).not.toHaveProperty(gone)
  })

  it('leaves a new program without estimates: nothing has been computed yet', () => {
    expect(blankMission('P', 'site-a', 'op', 'program').estimates).toBeUndefined()
  })
})

describe('applyProgramState', () => {
  const program = (patch: Partial<MissionLibraryEntry> = {}): MissionLibraryEntry =>
    ({ ...blankMission('P', 'site-a', 'op', 'program'), ...patch })

  it('returns the same object when the state is unchanged, so opening the tab is not an edit', () => {
    const m = program({ program_state: '{"s":1}' })
    expect(applyProgramState(m, '{"s":1}')).toBe(m)
  })

  it('stores a changed state and nothing else, so a saved program stays valid to the backend', () => {
    const next = applyProgramState(program({ program_state: '{"s":1}' }), '{"s":2}')
    expect(next.program_state).toBe('{"s":2}')
    expect(next.kind).toBe('program')
    expect(violations(next)).toEqual([])
  })

  it('gives a new program its first state, which the backend requires before it will save', () => {
    const m = program()
    expect(violations(m)).toEqual(['program without program_state'])
    expect(violations(applyProgramState(m, '{"s":1}'))).toEqual([])
  })
})

describe('shouldSaveProgramState', () => {
  it('seeds a program that has none when the tab opens', () => {
    expect(shouldSaveProgramState({ onOpen: true, isUiEvent: false, hasProgram: false })).toBe(true)
  })
  it('leaves a program that already has a state alone on open: re-serialising it would mark it unsaved', () => {
    expect(shouldSaveProgramState({ onOpen: true, isUiEvent: false, hasProgram: true })).toBe(false)
  })
  it('ignores interface events: selecting, scrolling and zooming are not edits', () => {
    expect(shouldSaveProgramState({ onOpen: false, isUiEvent: true, hasProgram: true })).toBe(false)
    expect(shouldSaveProgramState({ onOpen: false, isUiEvent: true, hasProgram: false })).toBe(false)
  })
  it('saves on a real block edit', () => {
    expect(shouldSaveProgramState({ onOpen: false, isUiEvent: false, hasProgram: true })).toBe(true)
    expect(shouldSaveProgramState({ onOpen: false, isUiEvent: false, hasProgram: false })).toBe(true)
  })
})

describe('editorTabs', () => {
  it('gives a route the map editor and no block canvas, which would 422 on save', () => {
    expect(editorTabs('route')).toEqual(['route', 'announcements', 'tasks', 'settings'])
  })
  it('gives a program the block canvas and no map editor', () => {
    expect(editorTabs('program')).toEqual(['program', 'announcements', 'tasks', 'settings'])
  })
  it('starts on a tab the mission has, whatever was asked for', () => {
    expect(startTab('program', 'route')).toBe('program')
    expect(startTab('route', 'program')).toBe('route')
  })
  it('honours a request for a tab the mission does have', () => {
    expect(startTab('program', 'tasks')).toBe('tasks')
    expect(startTab('route', 'settings')).toBe('settings')
    expect(startTab('route', 'announcements')).toBe('announcements')
  })
})

describe('estimatesDiffer', () => {
  const e: MissionEstimates = { length_m: 2, duration_s: 40, energy_wh: null, duration_bounded: true }

  it('is false for the same figures', () => {
    expect(estimatesDiffer(e, { ...e })).toBe(false)
  })
  it('is true when a figure moved', () => {
    expect(estimatesDiffer(e, { ...e, duration_s: 41 })).toBe(true)
    expect(estimatesDiffer(e, { ...e, length_m: 3 })).toBe(true)
    expect(estimatesDiffer(e, { ...e, duration_bounded: false })).toBe(true)
  })
  it('is true for a stored estimate from before duration_bounded existed', () => {
    // The trap: nothing in the mission itself changed, so Save would stay
    // disabled while the header showed the recomputed figures.
    const old = { length_m: 2, duration_s: 40, energy_wh: null } as unknown as MissionEstimates
    expect(estimatesDiffer(old, e)).toBe(true)
  })
  it('is true when nothing was stored', () => {
    expect(estimatesDiffer(undefined, e)).toBe(true)
  })
  it('ignores float noise', () => {
    expect(estimatesDiffer(e, { ...e, duration_s: 40 + 1e-9 })).toBe(false)
  })
})
