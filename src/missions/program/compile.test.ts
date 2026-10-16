import { describe, expect, it } from 'vitest'
import { compileProgram } from './compile'
import type { ProgramBlock } from './types'

let n = 0
const blk = (type: string, fields: ProgramBlock['fields'] = {}, inputs: ProgramBlock['inputs'] = {}): ProgramBlock => ({ id: `b${++n}`, type, fields, inputs })
const cmd = (s: unknown) => s as { kind: string; type: string; params: Record<string, unknown>; blockId: string; quadOnly?: boolean }

describe('compileProgram', () => {
  it('maps motion blocks to commands with exact params', () => {
    const steps = compileProgram([
      blk('rh_move', { DIRECTION: 'forward', DISTANCE: 1 }),
      blk('rh_set_speed', { SPEED: 40 }),
      blk('rh_rotate', { DIRECTION: 'left', ANGLE: 90 }),
      blk('rh_rotate_turns', { DIRECTION: 'right', TURNS: 2 }),
      blk('rh_avoidance', { STATE: 'on' }),
    ], 'quad').map(cmd)
    expect(steps.map((s) => [s.type, s.params])).toEqual([
      ['LINE_WALK', { direction: 'forward', distance: 1 }],
      ['SET_SPEED_RATIO', { ratio: 40 }],
      ['ROTATE', { direction: 'left', angle: 90 }],
      ['CIRCLE', { direction: 'right', turns: 2 }],
      ['SET_OBSTACLE_AVOIDANCE', { enabled: true }],
    ])
  })

  it('splits move-towards into a rotate and a walk, and skips the rotate at heading 0', () => {
    const left = compileProgram([blk('rh_move_towards', { DISTANCE: 2, HEADING: 90 })], 'quad').map(cmd)
    expect(left.map((s) => [s.type, s.params])).toEqual([
      ['ROTATE', { direction: 'left', angle: 90 }],
      ['LINE_WALK', { direction: 'forward', distance: 2 }],
    ])
    const right = compileProgram([blk('rh_move_towards', { DISTANCE: 2, HEADING: -45 })], 'quad').map(cmd)
    expect(right[0].params).toEqual({ direction: 'right', angle: 45 })
    const straight = compileProgram([blk('rh_move_towards', { DISTANCE: 2, HEADING: 0 })], 'quad').map(cmd)
    expect(straight.map((s) => s.type)).toEqual(['LINE_WALK'])
  })

  it('maps poses and tricks as quad-only', () => {
    const [pose, trick] = compileProgram([
      blk('rh_pose', { MODE: 'static', DURATION: 2, ROLL: 1, PITCH: 2, YAW: 3, HEIGHT: 0.05 }),
      blk('rh_trick', { TRICK: 'wave' }),
    ], 'quad').map(cmd)
    expect(pose).toMatchObject({ type: 'STATIC_POSE', quadOnly: true, params: { duration: 2, roll_deg: 1, pitch_deg: 2, yaw_deg: 3, height_m: 0.05 } })
    expect(trick).toMatchObject({ type: 'SET_STATE', quadOnly: true, params: { state: 'wave' } })
    expect(cmd(compileProgram([blk('rh_pose', { MODE: 'dynamic', DURATION: 1, ROLL: 0, PITCH: 0, YAW: 0, HEIGHT: 0 })], null)[0]).type).toBe('DYNAMIC_POSE')
  })

  it('picks stand and walk names by robot type', () => {
    const stand = blk('rh_mode', { MODE: 'stand' })
    const walk = blk('rh_mode', { MODE: 'walk' })
    expect(cmd(compileProgram([stand], 'wheel')[0]).params).toEqual({ state: 'wheel_loco' })
    expect(cmd(compileProgram([stand], 'quad')[0]).params).toEqual({ state: 'balance_stand' })
    expect(cmd(compileProgram([walk], 'wheel')[0]).params).toEqual({ gait: 'wheel_loco' })
    expect(cmd(compileProgram([walk], 'quad')[0]).params).toEqual({ gait: 'walk' })
    expect(cmd(compileProgram([blk('rh_mode', { MODE: 'ready' })], 'quad')[0]).params).toEqual({ state: 'ready' })
    expect(cmd(compileProgram([blk('rh_mode', { MODE: 'trot' })], 'quad')[0])).toMatchObject({ type: 'SET_GAIT', params: { gait: 'flying_trot' }, quadOnly: true })
    expect(cmd(compileProgram([blk('rh_switch_layout')], 'quad')[0])).toMatchObject({ type: 'CHANGE_MODE', params: {} })
  })

  it('maps lights, speech, sound and snapshots', () => {
    const steps = compileProgram([
      blk('rh_lights', { WHICH: 'front', STATE: 'on' }),
      blk('rh_lights', { WHICH: 'both', STATE: 'off' }),
      blk('rh_led'),
      blk('rh_speak', { TEXT: 'Hi', UNTIL_DONE: 'until' }),
      blk('rh_stop_sound'),
      blk('rh_snapshot', { CAMERA: 'rear' }),
    ], 'quad')
    expect(cmd(steps[0]).params).toEqual({ names: ['fill_light1'], r: 0, g: 0, b: 0, brightness: 255, priority: 0 })
    expect(cmd(steps[1]).params).toMatchObject({ names: ['fill_light1', 'fill_light3'], brightness: 0 })
    expect(cmd(steps[2]).params).toMatchObject({ names: ['fill_light1', 'fill_light3'], brightness: 255 })
    expect(steps[3]).toMatchObject({ type: 'SPEAK', params: { volume: 100 }, speech: { text: 'Hi', untilDone: true } })
    expect(cmd(steps[4]).type).toBe('STOP_SPEAK')
    expect(cmd(steps[5])).toMatchObject({ type: 'SNAPSHOT', params: { camera: 'rear' } })
  })

  it('keeps nested structure and block ids', () => {
    const move = blk('rh_move', { DIRECTION: 'forward', DISTANCE: 1 })
    const repeat = blk('rh_repeat', { TIMES: 3 }, { DO: [move] })
    const cond = blk('rh_cond_battery_below', { PCT: 20 })
    const wait = blk('rh_wait', { SECONDS: 2 })
    const iff = blk('rh_if', {}, { COND: cond, DO: [repeat], ELSE: [wait] })
    const [step] = compileProgram([iff], 'quad')
    expect(step).toMatchObject({ kind: 'if', blockId: iff.id, condition: { kind: 'batteryBelow', pct: 20 } })
    if (step.kind !== 'if') throw new Error('not an if')
    expect(step.then[0]).toMatchObject({ kind: 'repeat', times: 3, blockId: repeat.id })
    const inner = step.then[0]
    if (inner.kind !== 'repeat') throw new Error('not a repeat')
    expect(inner.body[0]).toMatchObject({ blockId: move.id, type: 'LINE_WALK' })
    expect(step.else[0]).toMatchObject({ kind: 'wait', seconds: 2, blockId: wait.id })
  })

  it('compiles repeat-until, wait-until and every condition kind; missing when the socket is empty', () => {
    const kinds = ['rh_cond_fallen', 'rh_cond_standing', 'rh_cond_avoidance_on'].map((t) =>
      compileProgram([blk('rh_wait_until', {}, { COND: blk(t) })], 'quad')[0])
    expect(kinds.map((s) => (s as { condition: { kind: string } }).condition.kind)).toEqual(['fallen', 'standing', 'avoidanceOn'])
    const [until, wait] = compileProgram([blk('rh_repeat_until', {}, { COND: null, DO: [] }), blk('rh_wait_until')], 'quad')
    expect(until).toMatchObject({ kind: 'repeatUntil', condition: { kind: 'missing' }, body: [] })
    expect(wait).toMatchObject({ kind: 'waitUntil', condition: { kind: 'missing' } })
  })

  it('skips unknown block types', () => {
    expect(compileProgram([blk('rh_from_the_future'), blk('rh_stop_sound')], 'quad')).toHaveLength(1)
  })
})
