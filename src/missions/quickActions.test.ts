import { describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { GESTURES } from '@/liveops/gestures'
import { gestureLabel } from '@/liveops/postureModel'
import type { MissionLibraryEntry, MissionWaypoint, RunPage, RunSummary, WaypointAction } from '@/types'
import { computeEstimates, DEFAULT_SPEED_MPS } from './estimates'
import { firstRunMovesToConfirm } from './firstRunConfirm'
import {
  airborneMovesIn, HELD_DEFAULT_SECONDS, isAirborneQuickAction, isHeldQuickAction, newQuickAction, quickActionMoves,
  quickActionSeconds, withQuickActionMove,
} from './quickActions'
import { validateMission, type CheckContext } from './validate'

const wp = (id: string, x: number, actions: WaypointAction[] = []): MissionWaypoint =>
  ({ waypoint_id: id, label: id, x_m: x, y_m: 0, z_m: null, heading_deg: null, tolerance_m: 0.5, actions, status: 'pending' })
const route = (actions: WaypointAction[], patch: Partial<MissionLibraryEntry> = {}): MissionLibraryEntry => ({
  mission_id: 'm1', name: 'M', type: 'patrol', kind: 'route', version: 1, creator: 'x', updated_at: '', map_id: 'map',
  waypoints: [wp('a', 0), wp('b', 10, actions)], segments: [], ...patch,
})
const quick = (state: string, seconds?: number): WaypointAction =>
  ({ type: 'quick_action', label: state, params: seconds === undefined ? { state } : { state, seconds } })

describe('the Quick action picker list', () => {
  it('offers the quad moves of LiveOps’ menu, in its labels, and no wheel mode or gait', () => {
    const moves = quickActionMoves()
    const states = moves.map((m) => m.state)
    expect(states.sort()).toEqual([
      'backflip', 'body_wave', 'bounce', 'dance0', 'diag_step', 'gongxi', 'groove', 'head_circle', 'hip_circle', 'hop_step',
      'jump', 'twirl_jump', 'wave',
    ])
    // Not the wheel modes, and not the gaits: those are a leg's gait setting.
    for (const s of ['drift', 'climb', 'handstand', 'flying_trot', 'rl']) expect(states).not.toContain(s)
    const tx = i18n.t as unknown as (key: string) => string
    for (const m of moves) expect(m.label).toBe(tx(`command.gestures.${m.state}`))
  })

  it('gives each timed move its length from GESTURES, and marks the held ones', () => {
    for (const m of quickActionMoves()) {
      if (m.kind === 'timed') expect(m.seconds).toBe(GESTURES[m.state].seconds)
      else expect(m.state).toBe('wave')
    }
  })

  it('flags exactly Jump, Backflip and Twirl Jump as needing clear space', () => {
    expect(quickActionMoves().filter((m) => m.airborne).map((m) => m.state).sort()).toEqual(['backflip', 'jump', 'twirl_jump'])
  })
})

describe('a Quick action', () => {
  it('is made with the move’s label, and a held one with a 5 s duration', () => {
    expect(newQuickAction('backflip')).toEqual({ type: 'quick_action', label: gestureLabel('backflip'), params: { state: 'backflip' } })
    expect(newQuickAction('wave').params).toEqual({ state: 'wave', seconds: HELD_DEFAULT_SECONDS })
    expect(isHeldQuickAction(newQuickAction('wave'))).toBe(true)
    expect(isHeldQuickAction(newQuickAction('gongxi'))).toBe(false)
  })

  it('drops the duration for a timed move, and a held move starts again at 5 s', () => {
    const waved = { ...newQuickAction('wave'), params: { state: 'wave', seconds: 20 } }
    expect(withQuickActionMove(withQuickActionMove(waved, 'gongxi'), 'wave').params).toEqual({ state: 'wave', seconds: 5 })
    const jumped = withQuickActionMove(waved, 'jump')
    expect(jumped.params).toEqual({ state: 'jump' })
    expect(jumped.label).toBe(gestureLabel('jump'))
  })

  it('counts a timed move’s length, a held move’s duration, and nothing it does not know', () => {
    expect(quickActionSeconds(quick('gongxi'))).toBe(11.5)
    expect(quickActionSeconds(quick('gongxi', 99))).toBe(11.5)
    expect(quickActionSeconds(quick('wave', 30))).toBe(30)
    expect(quickActionSeconds(quick('wave'))).toBe(HELD_DEFAULT_SECONDS)
    expect(quickActionSeconds(quick('drift'))).toBe(0)
    expect(quickActionSeconds(quick('rl', 30))).toBe(0)
  })

  it('knows which are airborne', () => {
    expect(isAirborneQuickAction(quick('twirl_jump'))).toBe(true)
    expect(isAirborneQuickAction(quick('wave'))).toBe(false)
    expect(isAirborneQuickAction({ type: 'wait', params: { state: 'jump' } })).toBe(false)
  })
})

describe('estimates with Quick actions', () => {
  it('adds the timed length and the held duration, as the backend does', () => {
    const walk = 10 / DEFAULT_SPEED_MPS
    expect(computeEstimates(route([quick('dance0'), quick('wave', 12)])).duration_s).toBeCloseTo(walk + 126.5 + 12)
  })
})

describe('validation of Quick actions', () => {
  const ctx = (robotType: CheckContext['robotType']): CheckContext => ({ noGoZones: [], geofences: [], robotType })
  const codes = (m: MissionLibraryEntry, c: CheckContext) => validateMission(m, c).issues.map((i) => i.code)

  it('flags one on a mission whose tasks run on a wheel robot', () => {
    expect(codes(route([quick('gongxi')]), ctx('wheel'))).toContain('quickActionOnWheel')
    expect(codes(route([quick('gongxi')]), ctx('quad'))).not.toContain('quickActionOnWheel')
    expect(codes(route([quick('gongxi')]), ctx(null))).not.toContain('quickActionOnWheel')
    expect(validateMission(route([quick('gongxi')]), ctx('wheel')).status).toBe('invalid')
  })

  it('flags a move the backend would refuse, and passes a known one', () => {
    expect(codes(route([quick('handstand')]), ctx('quad'))).toContain('quickActionUnknown')
    expect(codes(route([quick('flying_trot')]), ctx('quad'))).toContain('quickActionUnknown')
    expect(codes(route([{ type: 'quick_action', label: 'x', params: {} }]), ctx('quad'))).toContain('quickActionUnknown')
    expect(codes(route([quick('backflip')]), ctx('quad'))).not.toContain('quickActionUnknown')
    expect(codes(route([quick('backflip')]), ctx('quad'))).not.toContain('actionNotRunnable')
  })
})

describe('the first-run confirmation', () => {
  const run = (mission_id: string, robot_id: string) => ({ run_id: 'r', mission_id, robot_id }) as RunSummary
  const page = (items: RunSummary[]): RunPage => ({ items, total: items.length, next_offset: null, sample: false })

  it('lists the airborne moves once each, in route order, for a route only', () => {
    const m = route([quick('backflip'), quick('wave'), quick('jump'), quick('backflip')])
    expect(airborneMovesIn(m)).toEqual(['backflip', 'jump'])
    expect(airborneMovesIn({ ...m, kind: 'program' })).toEqual([])
  })

  it('asks when the robot has never run the mission, and reads only this mission on this robot', async () => {
    const listRuns = vi.fn(async () => page([]))
    expect(await firstRunMovesToConfirm(route([quick('jump')]), 'rex', listRuns)).toEqual(['jump'])
    expect(listRuns).toHaveBeenCalledWith({ mission_id: 'm1', robot_id: 'rex', limit: 1 })
  })

  it('does not ask once the robot has run it', async () => {
    expect(await firstRunMovesToConfirm(route([quick('jump')]), 'rex', async () => page([run('m1', 'rex')]))).toEqual([])
  })

  it('asks when the runs answered belong to another mission or robot (a filter the backend ignored)', async () => {
    expect(await firstRunMovesToConfirm(route([quick('jump')]), 'rex', async () => page([run('m2', 'rex'), run('m1', 'max')]))).toEqual(['jump'])
  })

  it('asks when the runs cannot be read (fail safe)', async () => {
    expect(await firstRunMovesToConfirm(route([quick('jump')]), 'rex', async () => { throw new Error('GET /runs answered 503') })).toEqual(['jump'])
  })

  it('does not read the runs at all without an airborne move', async () => {
    const listRuns = vi.fn(async () => page([]))
    expect(await firstRunMovesToConfirm(route([quick('gongxi'), quick('wave')]), 'rex', listRuns)).toEqual([])
    expect(listRuns).not.toHaveBeenCalled()
  })
})
