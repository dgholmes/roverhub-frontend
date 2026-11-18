import { describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import { currentOperatorId } from '@/lib/realtime/operator'
import type { NavGoalStatus, NavRouteOption, NavStuck, RobotState } from '@/types/robotState'
import { getCommandAvailability } from './commandPolicy'
import { navGoalOutcome, readNavGoal } from './navGoal'
import { navBarModel, navGoalEnded, navToolsModel, NAV_UI_IDLE } from './navMode'
import {
  defaultRouteId, formatEstimate, goLabel, initialStuckTrack, midpointOf, navResolveParams, nextStuckTrack, readNavStuck,
  readNavStuckPolicy, routeName, routeNote, stuckAnswerable, stuckBox, stuckDeadlineMs, stuckEpisodeOf, stuckFractionLeft,
  stuckReasonText, stuckRoutes,
} from './navStuck'

const opt = (id: string, points: [number, number][], over: Partial<NavRouteOption> = {}): NavRouteOption => ({
  option_id: id, points, length_m: points.slice(1).reduce((s, p, i) => s + Math.hypot(p[0] - points[i][0], p[1] - points[i][1]), 0),
  est_s: 30, end: points[points.length - 1], ...over,
})

const STUCK: NavStuck = {
  reason: 'no_progress',
  since: '2026-11-18T06:00:00.000Z',
  decide_by: '2026-11-18T06:01:00.000Z',
  failed_route: [[0, 0], [2, 0], [6, 0]],
  stuck_at: [2, 0],
  routes: [
    opt('A', [[2, 0], [2, 2], [6, 2], [6, 0]]),     // 8 m
    opt('B', [[2, 0], [2, -4], [6, -4], [6, 0]]),   // 12 m
  ],
  nearest: null,
  back: opt('back', [[2, 0], [0, 0]], { est_s: null }),
}

const goal = (over: Partial<NavGoalStatus> = {}): NavGoalStatus => ({
  goal_id: 'g1', x_m: 6, y_m: 0, yaw_rad: null, map_id: 'm', state: 'stuck', reason: null, updated_at: 't', stuck: STUCK, ...over,
})

describe('readNavStuck', () => {
  it('reads a well-formed stuck, routes and all', () => {
    expect(readNavStuck(JSON.parse(JSON.stringify(STUCK)))).toEqual(STUCK)
  })

  it('drops the whole thing without a finite stuck_at: there is nowhere to draw it', () => {
    expect(readNavStuck({ ...STUCK, stuck_at: [Number.NaN, 0] })).toBeNull()
    expect(readNavStuck({ ...STUCK, stuck_at: undefined })).toBeNull()
    expect(readNavStuck('stuck')).toBeNull()
  })

  it('drops one bad route and keeps the others, Retry and Cancel', () => {
    const s = readNavStuck({ ...STUCK, routes: [STUCK.routes[0], { ...STUCK.routes[1], points: [[0, 'x']] }] })
    expect(s?.routes.map((r) => r.option_id)).toEqual(['A'])
    expect(readNavStuck({ ...STUCK, routes: [{ ...STUCK.routes[0], option_id: '' }] })?.routes).toEqual([])
    expect(readNavStuck({ ...STUCK, routes: [{ ...STUCK.routes[0], points: Array(401).fill([0, 0]) }] })?.routes).toEqual([])
  })

  it('measures a missing length and takes the last point for a missing end', () => {
    const s = readNavStuck({ ...STUCK, routes: [{ option_id: 'A', points: [[0, 0], [3, 4]] }] })
    expect(s?.routes[0]).toEqual({ option_id: 'A', points: [[0, 0], [3, 4]], length_m: 5, est_s: null, end: [3, 4] })
  })

  it('empties a failed route that is not one, and keeps a reason it does not know', () => {
    const s = readNavStuck({ ...STUCK, failed_route: [[0, Infinity]], reason: 'from_the_future' })
    expect(s?.failed_route).toEqual([])
    expect(s?.reason).toBe('from_the_future')
  })

  it('comes through readNavGoal on a stuck status; a status without one has none', () => {
    expect(readNavGoal(goal())?.stuck).toEqual(STUCK)
    expect(readNavGoal(goal())?.state).toBe('stuck')
    expect(readNavGoal({ ...goal(), stuck: undefined })).not.toHaveProperty('stuck')
  })
})

describe('readNavStuckPolicy', () => {
  it('knows ask, auto and stop; anything else is an older bridge', () => {
    expect(['ask', 'auto', 'stop'].map(readNavStuckPolicy)).toEqual(['ask', 'auto', 'stop'])
    expect([null, undefined, 'maybe', 3].map(readNavStuckPolicy)).toEqual([null, null, null, null])
  })
})

describe('stuckRoutes', () => {
  it('lists A, B, then the way back, marking the shortest to the goal', () => {
    const routes = stuckRoutes(STUCK)
    expect(routes.map((r) => [r.id, r.kind, r.shortest])).toEqual([['A', 'a', true], ['B', 'b', false], ['back', 'back', false]])
    expect(defaultRouteId(routes)).toBe('A')
  })

  it('says how much longer than what was left of the blocked route each one is', () => {
    const [a, b] = stuckRoutes(STUCK)
    expect(a.extraM).toBeCloseTo(4)   // 8 m against the 4 m left from where it stopped
    expect(b.extraM).toBeCloseTo(8)
    expect(stuckRoutes({ ...STUCK, failed_route: [] })[0].extraM).toBeNull()
  })

  it('offers the nearest point only with no route to the goal, and picks it first', () => {
    const nearest = opt('nearest', [[2, 0], [4, 1]])
    const routes = stuckRoutes({ ...STUCK, routes: [], nearest })
    expect(routes.map((r) => r.kind)).toEqual(['nearest', 'back'])
    expect(defaultRouteId(routes)).toBe('nearest')
  })

  it('does not call a lone route the shortest', () => {
    const routes = stuckRoutes({ ...STUCK, routes: [STUCK.routes[1]] })
    expect(routes[0].shortest).toBe(false)
    expect(routes[0].kind).toBe('b')
    expect(defaultRouteId(routes)).toBe('B')
  })

  it('picks the way back when that is all there is, and nothing with nothing', () => {
    expect(defaultRouteId(stuckRoutes({ ...STUCK, routes: [] }))).toBe('back')
    expect(defaultRouteId([])).toBeNull()
  })
})

describe('the drawing', () => {
  it('boxes every line and the goal, padded', () => {
    expect(stuckBox(STUCK, { x_m: 6, y_m: 0 }, 0.5)).toEqual({ minX: -0.5, minY: -4.5, maxX: 6.5, maxY: 2.5 })
  })

  it('puts a label halfway along the line by length', () => {
    expect(midpointOf([[0, 0], [2, 0], [2, 2]])).toEqual([2, 0])
    expect(midpointOf([[0, 0], [4, 0]])).toEqual([2, 0])
    expect(midpointOf([])).toBeNull()
  })
})

describe('words', () => {
  it('names the routes and their buttons in Korean, as the mock does', async () => {
    await i18n.changeLanguage('ko')
    const [a, , back] = stuckRoutes(STUCK)
    expect([routeName(a), goLabel(a)]).toEqual(['A', 'A로 가기'])
    expect([routeName(back), goLabel(back)]).toEqual(['출발점으로', '출발점으로 가기'])
    expect(routeNote(a, { x_m: 6, y_m: 0 })).toBe('막힌 길보다 4.0 m 더 깁니다')
    expect(routeNote(back, null)).toBe('이 걷기를 끝내고 돌아갑니다')
    expect(formatEstimate(35)).toBe('약 35초')
    expect(stuckReasonText('no_progress')).toContain('30초 동안 앞으로 가지 못했습니다')
    await i18n.changeLanguage('en')
    expect(goLabel(a)).toBe('Go via A')
    expect(formatEstimate(150)).toBe('about 3 min')
    expect(stuckReasonText('from_the_future')).toBe(i18n.t('liveops.nav.stuck.reason.unknown'))
  })

  it('words a walk that ended from stuck', async () => {
    await i18n.changeLanguage('en')
    expect(navGoalOutcome({ state: 'aborted', reason: 'stuck_timeout' })?.text).toBe('Stopped: no other way was chosen within a minute')
    expect(navGoalOutcome({ state: 'aborted', reason: 'no_route' })?.text).toBe('Stopped: it found no route to the goal')
    expect(navGoalOutcome({ state: 'aborted', reason: 'reached_nearest' })?.text)
      .toBe('Stopped: it walked to the nearest point it could reach instead of the goal')
    expect(navGoalOutcome({ state: 'canceled', reason: 'returned_to_start' })?.text).toContain('it walked back to where it started')
    expect(navGoalOutcome({ state: 'stuck', reason: null })).toBeNull()
  })
})

describe('the countdown', () => {
  const since = Date.parse(STUCK.since)

  it('counts the robot’s window from when this browser first saw it', () => {
    // The browser's clock is 10 s behind the robot's: it saw the stuck at
    // since - 10 s, and the robot's deadline read straight is 70 s away.
    const firstSeen = since - 10_000
    expect(stuckDeadlineMs(STUCK, firstSeen)).toBe(firstSeen + 60_000)
    expect(stuckFractionLeft(STUCK, firstSeen, firstSeen + 15_000)).toBeCloseTo(0.75)
  })

  it('never promises more than the robot’s own deadline (a page opened late)', () => {
    const firstSeen = since + 40_000
    expect(stuckDeadlineMs(STUCK, firstSeen)).toBe(Date.parse(STUCK.decide_by!))
    expect(stuckFractionLeft(STUCK, firstSeen, firstSeen)).toBeCloseTo(20 / 60)
  })

  it('has none when the robot does not wait', () => {
    expect(stuckDeadlineMs({ ...STUCK, decide_by: null }, since)).toBeNull()
    expect(stuckFractionLeft({ ...STUCK, decide_by: 'soon' }, since, since)).toBeNull()
  })
})

describe('who may answer', () => {
  it('anyone while the walk itself or nobody holds control; else who does', () => {
    expect(stuckAnswerable({ control_owner: null })).toEqual({ ok: true })
    expect(stuckAnswerable({ control_owner: 'nav:g1' })).toEqual({ ok: true })
    expect(stuckAnswerable({ control_owner: currentOperatorId() })).toEqual({ ok: true })
    expect(stuckAnswerable({ control_owner: 'someone-else' })).toEqual({ ok: false, owner: 'someone-else' })
    expect(stuckAnswerable({ control_owner: 'mission:r1' })).toEqual({ ok: false, owner: 'mission:r1' })
  })

  it('NAV_RESOLVE has the walk’s gates in the command policy', () => {
    const robot = { ...initialRobots[1], abstract_state: 'STAND', sdk_state: 'balance_stand', control_owner: 'nav:g1', active_run: null } as RobotState
    expect(getCommandAvailability(robot, 'NAV_RESOLVE').enabled).toBe(true)
    expect(getCommandAvailability({ ...robot, control_owner: 'someone-else' }, 'NAV_RESOLVE').enabled).toBe(false)
    expect(getCommandAvailability({ ...robot, battery: { ...robot.battery, percent: 10 } }, 'NAV_RESOLVE').enabled).toBe(false)
    expect(getCommandAvailability({ ...robot, battery: { ...robot.battery, percent: 10 } }, 'SET_NAV_STUCK_POLICY').enabled).toBe(true)
  })

  it('builds the answer: an option only for a route', () => {
    expect(navResolveParams('g1', 'route', 'B')).toEqual({ goal_id: 'g1', choice: 'route', option_id: 'B' })
    expect(navResolveParams('g1', 'retry', 'B')).toEqual({ goal_id: 'g1', choice: 'retry' })
    expect(navResolveParams('g1', 'cancel')).toEqual({ goal_id: 'g1', choice: 'cancel' })
    expect(() => navResolveParams('g1', 'route')).toThrow(RangeError)
  })
})

describe('the stuck track', () => {
  const active = goal({ state: 'active', stuck: null })
  const step = (track: ReturnType<typeof initialStuckTrack>, g: NavGoalStatus | null, now = 1000) => nextStuckTrack(track, 'r', g, now)

  it('shows a walk stuck now, from the first look, and keeps its countdown start', () => {
    const t0 = initialStuckTrack('r', goal(), 500)
    expect(stuckEpisodeOf(t0, goal())).toMatchObject({ mode: 'live', firstSeenAt: 500 })
    const same = step(t0, goal({ updated_at: 'later' }), 9000)
    expect(same).toBe(t0)
  })

  it('keeps the routes and the reason when the minute runs out', () => {
    let t = initialStuckTrack('r', active, 0)
    t = step(t, goal(), 1000)
    t = step(t, goal({ state: 'aborted', reason: 'stuck_timeout', stuck: null }), 61_000)
    expect(t.ended).toMatchObject({ mode: 'ended', stuck: STUCK, firstSeenAt: 1000 })
    expect(stuckEpisodeOf(t, goal({ state: 'aborted', reason: 'stuck_timeout' }))?.mode).toBe('ended')
  })

  it('keeps them for the stop policy, which never shows the walk as stuck', () => {
    const t = step(initialStuckTrack('r', active, 0), goal({ state: 'aborted', reason: 'no_progress' }))
    expect(t.ended?.stuck).toEqual(STUCK)
  })

  it('does not for a cancel, nor for a walk answered and then ended', () => {
    let t = step(initialStuckTrack('r', active, 0), goal())
    expect(step(t, goal({ state: 'canceled', reason: 'operator' })).ended).toBeNull()
    t = step(t, active)
    expect(step(t, goal({ state: 'aborted', reason: 'localization_lost', stuck: null })).ended).toBeNull()
  })

  it('does not announce a stuck end that happened before the page opened, and starts over for another robot', () => {
    const old = goal({ state: 'aborted', reason: 'stuck_timeout' })
    const t = initialStuckTrack('r', old, 0)
    expect(stuckEpisodeOf(t, old)).toBeNull()
    expect(nextStuckTrack(t, 'other', goal(), 5).lastStuck?.firstSeenAt).toBe(5)
  })

  it('a new walk clears an ended one', () => {
    let t = step(initialStuckTrack('r', active, 0), goal({ state: 'aborted', reason: 'no_progress' }))
    t = step(t, goal({ goal_id: 'g2', state: 'active', stuck: null }))
    expect(t.ended).toBeNull()
  })
})

describe('the walk bar and tools', () => {
  const robot = { position: initialRobots[1].position, nav_goal: goal() }

  it('puts the card in the bar while stuck, before Go mode; an ended one after it', () => {
    const base = { ui: NAV_UI_IDLE, robot, goal: null, walk: { enabled: true }, ended: null }
    expect(navBarModel({ ...base, stuck: 'live' })).toEqual({ kind: 'stuck', mode: 'live' })
    expect(navBarModel({ ...base, stuck: 'ended' })).toEqual({ kind: 'stuck', mode: 'ended' })
    const go = { ...NAV_UI_IDLE, mode: 'go' as const, pending: [1, 1] as [number, number] }
    expect(navBarModel({ ...base, ui: go, stuck: 'live' }).kind).toBe('stuck')
  })

  it('holds the tools while it waits for an answer', async () => {
    await i18n.changeLanguage('en')
    const tools = navToolsModel({ ui: NAV_UI_IDLE, walking: false, stuck: true, setPosition: { enabled: true } })
    expect(tools.go).toEqual({ active: false, enabled: false, reason: 'The walk is waiting for a choice. Answer it first.' })
  })

  it('counts a stuck walk as walking, not ended, for "Arrived" / "Stopped"', () => {
    expect(navGoalEnded(goal({ state: 'active' }), goal())).toBe(false)
    expect(navGoalEnded(goal(), goal({ state: 'aborted' }))).toBe(true)
  })
})
