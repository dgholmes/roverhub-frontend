import { describe, expect, it } from 'vitest'
import type { MissionLibraryEntry, MissionWaypoint, WaypointAction } from '@/types'
import { applyCompiledProgram, compileBlocksToWaypoints, mergeTaskParams, shouldCompileProgram } from './compileProgram'

const wp = (id: string, actions: WaypointAction[]): MissionWaypoint =>
  ({ waypoint_id: id, label: id, x_m: 1, y_m: 0, z_m: null, heading_deg: null, tolerance_m: 0.5, actions, status: 'pending' })
const act = (type: WaypointAction['type'], params: Record<string, unknown> = {}): WaypointAction => ({ type, label: type, params })

describe('compileBlocksToWaypoints', () => {
  it('compiles wait seconds and speak text into params', () => {
    const wps = compileBlocksToWaypoints([
      { type: 'rh_move', fields: { DIRECTION: 'forward', DISTANCE: 2 } },
      { type: 'rh_wait', fields: { SECONDS: 5 } },
      { type: 'rh_speak', fields: { TEXT: 'Hello there' } },
    ])
    expect(wps[0].actions.map((a) => [a.type, a.params])).toEqual([
      ['wait', { seconds: 5 }],
      ['voice_prompt', { text: 'Hello there' }],
    ])
  })
})

describe('mergeTaskParams', () => {
  it('keeps params attached in the Route tab under a same-type compiled task, compiled values winning', () => {
    const previous = [wp('w1', [act('voice_prompt', { clip_id: 'c.wav', volume: 80, text: 'Old' }), act('snapshot', { camera: 'rear' })])]
    const compiled = [wp('w1', [act('voice_prompt', { text: 'New' }), act('snapshot')])]
    const merged = mergeTaskParams(previous, compiled)
    expect(merged[0].actions[0].params).toEqual({ clip_id: 'c.wav', volume: 80, text: 'New' })
    expect(merged[0].actions[1].params).toEqual({ camera: 'rear' })
  })
  it('does not merge when the task type at that position changed', () => {
    const previous = [wp('w1', [act('snapshot', { camera: 'rear' })])]
    const compiled = [wp('w1', [act('wait', { seconds: 3 })])]
    expect(mergeTaskParams(previous, compiled)[0].actions[0].params).toEqual({ seconds: 3 })
  })
  it('handles extra and missing tasks and waypoints', () => {
    const previous = [wp('w1', [act('snapshot', { camera: 'rear' }), act('led_signal', { color: 'red' })])]
    const compiled = [wp('w1', [act('snapshot')]), wp('w2', [act('wait', { seconds: 1 })])]
    const merged = mergeTaskParams(previous, compiled)
    expect(merged[0].actions).toHaveLength(1)
    expect(merged[0].actions[0].params).toEqual({ camera: 'rear' })
    expect(merged[1].actions[0].params).toEqual({ seconds: 1 })
    expect(mergeTaskParams([], compiled)).toEqual(compiled)
  })
  it('does not mutate its inputs', () => {
    const previous = [wp('w1', [act('snapshot', { camera: 'rear' })])]
    const compiled = [wp('w1', [act('snapshot')])]
    mergeTaskParams(previous, compiled)
    expect(compiled[0].actions[0].params).toEqual({})
  })
  it('recompiling an unchanged program yields deep-equal waypoints', () => {
    const compiled = () => [wp('w1', [act('voice_prompt', { text: 'Hi' }), act('wait', { seconds: 2 })])]
    const saved = [wp('w1', [act('voice_prompt', { text: 'Hi', clip_id: 'c.wav', volume: 100 }), act('wait', { seconds: 2 })])]
    expect(mergeTaskParams(saved, compiled())).toEqual(saved)
  })
})

describe('applyCompiledProgram', () => {
  const mission = (patch: Partial<MissionLibraryEntry> = {}): MissionLibraryEntry => ({
    mission_id: 'm', name: 'M', type: 'patrol', kind: 'program', version: 1, creator: 'x', updated_at: '', map_id: 'map',
    waypoints: [wp('w1', [act('voice_prompt', { text: 'Hi', clip_id: 'c.wav' })])],
    segments: [{ from_waypoint_id: 'w0', to_waypoint_id: 'w1', speed_mps: 0.3, gait: null, posture: null, wheel_leg_mode: null }],
    program_state: '{"s":1}', ...patch,
  })
  it('returns the same mission when nothing changed', () => {
    const m = mission()
    expect(applyCompiledProgram(m, [wp('w1', [act('voice_prompt', { text: 'Hi' })])], '{"s":1}')).toBe(m)
  })
  it('updates the program and clears segments when the route changed', () => {
    const next = applyCompiledProgram(mission(), [wp('w1', [act('voice_prompt', { text: 'Bye' })])], '{"s":2}')
    expect(next.waypoints[0].actions[0].params).toEqual({ text: 'Bye', clip_id: 'c.wav' })
    expect(next.program_state).toBe('{"s":2}')
    expect(next.segments).toEqual([])
  })
})

describe('shouldCompileProgram', () => {
  it('compiles on opening only when the mission already has a program', () => {
    expect(shouldCompileProgram({ onOpen: true, isUiEvent: false, hasProgram: true })).toBe(true)
    // A route drawn on the map must survive just opening the Program tab.
    expect(shouldCompileProgram({ onOpen: true, isUiEvent: false, hasProgram: false })).toBe(false)
  })
  it('ignores interface events such as selecting or scrolling', () => {
    expect(shouldCompileProgram({ onOpen: false, isUiEvent: true, hasProgram: true })).toBe(false)
    expect(shouldCompileProgram({ onOpen: false, isUiEvent: true, hasProgram: false })).toBe(false)
  })
  it('compiles on a real block edit, with or without an earlier program', () => {
    expect(shouldCompileProgram({ onOpen: false, isUiEvent: false, hasProgram: true })).toBe(true)
    expect(shouldCompileProgram({ onOpen: false, isUiEvent: false, hasProgram: false })).toBe(true)
  })
})
