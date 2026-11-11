import { describe, expect, it } from 'vitest'
import '@/i18n'
import type { GridPixels } from '@/missions/floorCells'
import type { MapFloor, Point2D } from '@/types/maps'
import type { NavGoalStatus, RobotPosition } from '@/types/robotState'
import type { CommandAvailability } from '@/types'
import { navGoalFrom, type NavGoal, type NavGoalRefusal } from './navGoal'
import type { NavNotice } from './navLocate'
import {
  NAV_UI_IDLE, initialEndedTrack, isMapSurface, navBarModel, navGoalEnded, navHint, navToolsModel, navUiReducer, settlePose, trackEnded,
  type NavBarInput, type NavUiAction, type NavUiState,
} from './navMode'

// The 4 x 3 grid navGoal.test.ts uses: 0.5 m pitch, lower-left at (-1, -2).
const FREE = 254, OCC = 0, UNK = 205
const floor: Pick<MapFloor, 'origin_xy_m' | 'resolution_m' | 'size_cells'> = {
  origin_xy_m: [-1, -2], resolution_m: 0.5, size_cells: [4, 3],
}
const grid: GridPixels = {
  width: 4, height: 3,
  pixels: new Uint8Array([UNK, UNK, UNK, OCC, UNK, FREE, UNK, UNK, FREE, UNK, UNK, UNK]),
}
const FREE_PT: Point2D = [-0.75, -1.75]
const UNKNOWN_PT: Point2D = [0.25, -1.75]
const WALL_PT: Point2D = [0.75, -0.75]

const run = (...actions: NavUiAction[]): NavUiState => actions.reduce(navUiReducer, NAV_UI_IDLE)

describe('navUiReducer: one mode at a time', () => {
  it('starts idle with nothing pending', () => {
    expect(NAV_UI_IDLE).toEqual({ mode: 'idle', pending: null, pose: null, poseProblem: null })
  })

  it('enters Go mode, and pressing Go again leaves it', () => {
    expect(run({ type: 'toggle', mode: 'go' }).mode).toBe('go')
    expect(run({ type: 'toggle', mode: 'go' }, { type: 'toggle', mode: 'go' })).toEqual(NAV_UI_IDLE)
  })

  it('switches straight from one mode to the other, dropping what the first had', () => {
    const s = run({ type: 'toggle', mode: 'go' }, { type: 'tap', point: FREE_PT }, { type: 'toggle', mode: 'setPosition' })
    expect(s).toEqual({ ...NAV_UI_IDLE, mode: 'setPosition' })
  })

  it('leaves either mode on Esc (exit)', () => {
    expect(run({ type: 'toggle', mode: 'go' }, { type: 'tap', point: FREE_PT }, { type: 'exit' })).toEqual(NAV_UI_IDLE)
    expect(run({ type: 'toggle', mode: 'setPosition' }, { type: 'press', point: FREE_PT }, { type: 'exit' })).toEqual(NAV_UI_IDLE)
  })

  it('places a pending pin on a tap in Go mode, and a new tap moves it', () => {
    expect(run({ type: 'toggle', mode: 'go' }, { type: 'tap', point: FREE_PT }).pending).toEqual(FREE_PT)
    expect(run({ type: 'toggle', mode: 'go' }, { type: 'tap', point: FREE_PT }, { type: 'tap', point: UNKNOWN_PT }).pending).toEqual(UNKNOWN_PT)
  })

  it('ignores a tap outside Go mode: a stray click never makes a goal', () => {
    expect(run({ type: 'tap', point: FREE_PT })).toEqual(NAV_UI_IDLE)
    expect(run({ type: 'toggle', mode: 'setPosition' }, { type: 'tap', point: FREE_PT }).pending).toBeNull()
  })

  it('clears the pin on Cancel and stays in Go mode for another tap', () => {
    const s = run({ type: 'toggle', mode: 'go' }, { type: 'tap', point: FREE_PT }, { type: 'cancel' })
    expect(s).toEqual({ ...NAV_UI_IDLE, mode: 'go' })
  })

  it('tracks a press and drag in Set-position mode only', () => {
    const s = run({ type: 'toggle', mode: 'setPosition' }, { type: 'press', point: FREE_PT }, { type: 'drag', point: [0, -1] })
    expect(s.pose).toEqual({ at: FREE_PT, toward: [0, -1] })
    expect(run({ type: 'press', point: FREE_PT }).pose).toBeNull()
    expect(run({ type: 'toggle', mode: 'go' }, { type: 'press', point: FREE_PT }).pose).toBeNull()
    expect(run({ type: 'toggle', mode: 'setPosition' }, { type: 'drag', point: FREE_PT }).pose).toBeNull()
  })

  it('keeps the mode and records why when a release cannot be sent, and a new press clears it', () => {
    const failed = run({ type: 'toggle', mode: 'setPosition' }, { type: 'press', point: FREE_PT }, { type: 'poseFailed', problem: 'needDrag' })
    expect(failed).toEqual({ ...NAV_UI_IDLE, mode: 'setPosition', poseProblem: 'needDrag' })
    expect(navUiReducer(failed, { type: 'press', point: FREE_PT }).poseProblem).toBeNull()
  })
})

describe('settlePose: what a press-drag-release sends', () => {
  it('sends RESET_POSITION params with the heading in degrees', () => {
    const r = settlePose([0, -1.75], [0, -1.25], floor, grid, 'map-venue', '0')
    expect(r).toEqual({ ok: true, params: { x_m: 0, y_m: -1.75, heading_deg: expect.closeTo(90, 6), map_id: 'map-venue', floor_id: '0' } })
  })

  it('asks for a drag rather than sending a drag under 5 cm', () => {
    expect(settlePose(FREE_PT, FREE_PT, floor, grid, 'm', '0')).toEqual({ ok: false, problem: 'needDrag' })
    expect(settlePose(FREE_PT, [FREE_PT[0] + 0.04, FREE_PT[1]], floor, grid, 'm', '0')).toEqual({ ok: false, problem: 'needDrag' })
  })

  it('is allowed on unsurveyed ground (the robot is there), refused in a wall or off the floor', () => {
    expect(settlePose(UNKNOWN_PT, [0.25, -1.25], floor, grid, 'm', '0').ok).toBe(true)
    expect(settlePose(WALL_PT, [0.75, -0.25], floor, grid, 'm', '0')).toEqual({ ok: false, problem: 'occupied' })
    expect(settlePose([5, 5], [5, 6], floor, grid, 'm', '0')).toEqual({ ok: false, problem: 'outsideFloor' })
  })
})

const position = (over: Partial<RobotPosition> = {}): RobotPosition => ({
  x_m: -0.75, y_m: -1.75, z_m: 0, heading_deg: 0, provider: 'slam', quality: 'localized',
  accuracy_m: 0.1, freshness: 'live', updated_at: '2026-11-10T00:00:00Z', ...over,
})
const status = (over: Partial<NavGoalStatus> = {}): NavGoalStatus => ({
  goal_id: 'g1', x_m: 0.25, y_m: 0.35, yaw_rad: null, map_id: 'm', state: 'active', reason: null,
  updated_at: '2026-11-10T00:00:00Z', ...over,
})
const OK: CommandAvailability = { enabled: true }

function input(over: Partial<NavBarInput> = {}): NavBarInput {
  return {
    ui: NAV_UI_IDLE, robot: { position: position(), nav_goal: null }, goal: null,
    walk: OK, ended: null, ...over,
  }
}
const goMode = (pending: Point2D | null = null): NavUiState => ({ ...NAV_UI_IDLE, mode: 'go', pending })
const tapped = (point: Point2D, pos = position()): NavGoal | NavGoalRefusal => navGoalFrom(point, floor, grid, { position: pos })

describe('navBarModel', () => {
  it('is empty when nothing is happening', () => {
    expect(navBarModel(input())).toEqual({ kind: 'none' })
    expect(navBarModel(input({ ui: goMode() }))).toEqual({ kind: 'none' })
  })

  it('offers Walk here with the straight-line distance for a clean tap', () => {
    const goal = tapped(FREE_PT, position({ x_m: -0.75, y_m: 1.65 })) // 3.4 m south
    const m = navBarModel(input({ ui: goMode(FREE_PT), robot: { position: position({ x_m: -0.75, y_m: 1.65 }), nav_goal: null }, goal }))
    expect(m).toMatchObject({ kind: 'confirm', title: 'Walk here', detail: '3.4 m away', warnings: [], walk: { enabled: true } })
    expect(m.kind === 'confirm' && m.detail).not.toMatch(/\bs\b|second/) // no invented time estimate
  })

  it('puts the unsurveyed-ground warning in the bar BEFORE confirm, with Walk still offered', () => {
    const m = navBarModel(input({ ui: goMode(UNKNOWN_PT), goal: tapped(UNKNOWN_PT) }))
    expect(m).toMatchObject({ kind: 'confirm', walk: { enabled: true } })
    expect(m.kind === 'confirm' && m.warnings).toEqual([expect.stringMatching(/survey never saw/i)])
  })

  it('puts the geofence warning there too, ahead of unknown ground, and keeps both', () => {
    const goal = navGoalFrom(UNKNOWN_PT, floor, grid, { position: position() },
      [{ kind: 'geofence', label: 'Site', polygon: [[-1, -2], [-0.6, -2], [-0.6, -1.6], [-1, -1.6]] }])
    const m = navBarModel(input({ ui: goMode(UNKNOWN_PT), goal }))
    expect(m.kind === 'confirm' && m.warnings).toEqual([expect.stringMatching(/geofence/i), expect.stringMatching(/survey never saw/i)])
  })

  it('shows a refusal in place of Walk: no Walk at all', () => {
    const m = navBarModel(input({ ui: goMode(WALL_PT), goal: tapped(WALL_PT) }))
    expect(m).toEqual({ kind: 'refused', text: 'That point is inside a wall or obstacle.' })
    expect(m).not.toHaveProperty('walk')
  })

  it('disables Walk with the policy reason, e.g. while this operator holds control (never auto-releases)', () => {
    const walk = { enabled: false, reason: 'You have control. Release it to send the robot to a point.' }
    const m = navBarModel(input({ ui: goMode(FREE_PT), goal: tapped(FREE_PT), walk }))
    expect(m).toMatchObject({ kind: 'confirm', walk })
  })

  it('asks for Set position in Go mode when the robot is not placed: no position, not SLAM, or lost', () => {
    for (const pos of [null, position({ provider: 'dead_reckoning' }), position({ quality: 'lost' })]) {
      const m = navBarModel(input({ ui: goMode(FREE_PT), robot: { position: pos, nav_goal: null }, goal: null }))
      expect(m).toEqual({ kind: 'notPlaced', text: 'The robot doesn’t know where it is on this map yet.' })
    }
  })

  it('shows Walking to goal with metres left and Stop while the goal is active, over anything else', () => {
    const robot = { position: position({ x_m: 0.25, y_m: -1.75 }), nav_goal: status() } // 2.1 m to go
    const m = navBarModel(input({ ui: goMode(FREE_PT), robot, goal: tapped(FREE_PT) }))
    expect(m).toEqual({ kind: 'walking', title: 'Walking to goal', detail: '2.1 m left' })
  })

  it('leaves the metres out while walking when the position is not on the map', () => {
    const m = navBarModel(input({ robot: { position: position({ provider: 'dead_reckoning' }), nav_goal: status() } }))
    expect(m).toEqual({ kind: 'walking', title: 'Walking to goal', detail: null })
  })

  it('ignores a malformed nav_goal rather than show a walk that is not happening', () => {
    const bad = { ...status(), state: 'walking' } as unknown as NavGoalStatus
    expect(navBarModel(input({ robot: { position: position(), nav_goal: bad } }))).toEqual({ kind: 'none' })
    const nan = status({ x_m: NaN })
    expect(navBarModel(input({ robot: { position: position(), nav_goal: nan } }))).toEqual({ kind: 'none' })
  })

  it('shows a finished goal briefly when asked to: Arrived, or Stopped with the reason', () => {
    expect(navBarModel(input({ ended: status({ state: 'succeeded' }) }))).toEqual({ kind: 'ended', tone: 'green', text: 'Arrived' })
    expect(navBarModel(input({ ended: status({ state: 'aborted', reason: 'localization_lost' }) })))
      .toEqual({ kind: 'ended', tone: 'red', text: 'Stopped: it lost its place on the map' })
  })

  it('lets a pending tap win over the ended note', () => {
    const m = navBarModel(input({ ui: goMode(FREE_PT), goal: tapped(FREE_PT), ended: status({ state: 'succeeded' }) }))
    expect(m.kind).toBe('confirm')
  })

  const unconfirmed: NavNotice = { tone: 'amber', text: 'The lidar could not confirm this position.' }

  it('shows what the lidar said about a Set position, as given', () => {
    expect(navBarModel(input({ notice: unconfirmed }))).toEqual({ kind: 'notice', ...unconfirmed })
    const refused: NavNotice = { tone: 'red', text: 'The robot is not sure where it is.', setPosition: true }
    expect(navBarModel(input({ notice: refused }))).toEqual({ kind: 'notice', ...refused })
  })

  it('puts the notice over a finished goal, and a walk or a pending tap over the notice', () => {
    expect(navBarModel(input({ notice: unconfirmed, ended: status({ state: 'succeeded' }) })).kind).toBe('notice')
    expect(navBarModel(input({ notice: unconfirmed, robot: { position: position(), nav_goal: status() } })).kind).toBe('walking')
    expect(navBarModel(input({ notice: unconfirmed, ui: goMode(FREE_PT), goal: tapped(FREE_PT) })).kind).toBe('confirm')
  })

  it('is unchanged with no notice', () => {
    expect(navBarModel(input({ notice: null }))).toEqual({ kind: 'none' })
    expect(navBarModel(input({ notice: undefined, ended: status({ state: 'succeeded' }) })).kind).toBe('ended')
  })
})

describe('navToolsModel', () => {
  it('marks the active tool, and enables both while idle', () => {
    const m = navToolsModel({ ui: goMode(), walking: false, setPosition: OK })
    expect(m.go).toEqual({ active: true, enabled: true })
    expect(m.setPosition).toEqual({ active: false, enabled: true })
  })

  it('disables both while a goal walks, so Stop stays in the bar and nothing redirects the walk', () => {
    const m = navToolsModel({ ui: NAV_UI_IDLE, walking: true, setPosition: OK })
    expect(m.go).toMatchObject({ enabled: false, reason: expect.stringMatching(/stop it first/i) })
    expect(m.setPosition.enabled).toBe(false)
  })

  it('carries the policy reason on Set position', () => {
    const m = navToolsModel({ ui: NAV_UI_IDLE, walking: false, setPosition: { enabled: false, reason: 'Another operator has control of the robot.' } })
    expect(m.setPosition).toEqual({ active: false, enabled: false, reason: 'Another operator has control of the robot.' })
  })
})

describe('navHint: the line under the tool group', () => {
  it('says what to do in each mode, and nothing while idle', () => {
    expect(navHint(NAV_UI_IDLE, true)).toBeNull()
    expect(navHint(goMode(), true)).toEqual({ tone: 'muted', text: 'Tap where the robot should go' })
    expect(navHint({ ...NAV_UI_IDLE, mode: 'setPosition' }, false)).toEqual({ tone: 'muted', text: 'Press where the robot stands, drag the way it faces, let go' })
  })

  it('stays quiet in Go mode when the robot is not placed (the bar asks for Set position instead)', () => {
    expect(navHint(goMode(), false)).toBeNull()
  })

  it('asks for a drag in amber, and says why a pose was refused in red', () => {
    expect(navHint({ ...NAV_UI_IDLE, mode: 'setPosition', poseProblem: 'needDrag' }, true))
      .toEqual({ tone: 'amber', text: 'Drag the way the robot faces before you let go.' })
    expect(navHint({ ...NAV_UI_IDLE, mode: 'setPosition', poseProblem: 'occupied' }, true))
      .toEqual({ tone: 'red', text: 'That point is inside a wall or obstacle.' })
  })
})

describe('navGoalEnded: when to show a finished goal', () => {
  it('never on the first status seen (a retained /state from earlier must not announce Arrived)', () => {
    expect(navGoalEnded(undefined, status({ state: 'succeeded' }))).toBe(false)
  })

  it('when a goal seen walking finishes', () => {
    expect(navGoalEnded(status(), status({ state: 'succeeded' }))).toBe(true)
    expect(navGoalEnded(status(), status({ state: 'aborted', reason: 'nav2_aborted' }))).toBe(true)
  })

  it('when a new goal arrives already finished (refused at start)', () => {
    expect(navGoalEnded(null, status({ goal_id: 'g2', state: 'refused', reason: 'operator_has_control' }))).toBe(true)
    expect(navGoalEnded(status({ state: 'succeeded' }), status({ goal_id: 'g2', state: 'refused' }))).toBe(true)
  })

  it('not again for the same finished goal, nor for an active or absent one', () => {
    expect(navGoalEnded(status({ state: 'succeeded' }), status({ state: 'succeeded' }))).toBe(false)
    expect(navGoalEnded(null, status())).toBe(false)
    expect(navGoalEnded(status(), null)).toBe(false)
  })
})

describe('trackEnded: the finished goal the bar shows, across /state updates', () => {
  it('starts with nothing shown, whatever the first status says', () => {
    const t = initialEndedTrack('r1', status({ state: 'succeeded' }))
    expect(t.ended).toBeNull()
  })

  it('shows a goal that finishes after being seen walking, and keeps it through repeats', () => {
    let t = initialEndedTrack('r1', status())
    t = trackEnded(t, 'r1', status({ state: 'succeeded' }))
    expect(t.ended?.state).toBe('succeeded')
    expect(trackEnded(t, 'r1', status({ state: 'succeeded' }))).toBe(t) // same status: no new state object
  })

  it('drops the note when the next goal starts walking', () => {
    let t = initialEndedTrack('r1', status())
    t = trackEnded(t, 'r1', status({ state: 'canceled', reason: 'operator' }))
    t = trackEnded(t, 'r1', status({ goal_id: 'g2' }))
    expect(t.ended).toBeNull()
  })

  it('starts over for another robot rather than carry one robot note to the next', () => {
    let t = initialEndedTrack('r1', status())
    t = trackEnded(t, 'r1', status({ state: 'succeeded' }))
    t = trackEnded(t, 'r2', status({ goal_id: 'g9', state: 'aborted' }))
    expect(t.ended).toBeNull()
    expect(t.robotId).toBe('r2')
  })

  it('reads the wire defensively: a malformed status counts as none', () => {
    let t = initialEndedTrack('r1', status())
    t = trackEnded(t, 'r1', { ...status(), state: 'done' } as unknown as NavGoalStatus)
    expect(t.ended).toBeNull()
  })
})

describe('isMapSurface', () => {
  // Stand-ins for DOM nodes: identity and `contains` are all it uses.
  const pane = { contains: (n: unknown) => n === pane || n === marker }
  const marker = {}
  const container = {}
  const control = {} // a FloorPicker / cloud toggle: inside the container, outside the pane

  it('counts a click on the map container itself', () => {
    // 2026-11-10: the floorplan image is not interactive, so a click on the
    // floor lands on the container, not inside the map pane. Only clicks on
    // the robot marker (inside the pane) counted -- every Set position landed
    // on the marker, and Go to point never placed a pin.
    expect(isMapSurface(container, container, pane)).toBe(true)
  })

  it('counts a click on something inside the map pane', () => {
    expect(isMapSurface(marker, container, pane)).toBe(true)
  })

  it('does not count a click on a control floating over the map', () => {
    expect(isMapSurface(control, container, pane)).toBe(false)
  })

  it('does not count a click with no target', () => {
    expect(isMapSurface(null, container, pane)).toBe(false)
  })
})
