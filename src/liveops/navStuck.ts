import i18n from '@/i18n'
import type { Point2D } from '@/types/maps'
import { MAX_NAV_PATH_POINTS } from '@/types/navPath'
import type {
  NavGoalStatus, NavRouteOption, NavStuck, NavStuckPolicy, NavStuckReason, RobotState,
} from '@/types/robotState'
import { isMissionOwner, isNavOwner } from './controlOwner'
import { currentOperatorId } from '@/lib/realtime/operator'

/**
 * When a walk gets stuck (schema 0.0.27), as plain rules: what a `stuck` on the
 * robot's nav_goal must be to be drawn, the routes it offers in the order the
 * card lists them, which one is picked first, the 60 s countdown, who may
 * answer, and what an answer sends. NavStuckLayer draws it; the providers
 * deliver it on /state.
 *
 * The bridge holds the walk (Nav2's goal cancelled, the robot standing where it
 * is) and offers up to two other routes to the goal (A, B), or the reachable
 * point nearest it, and the way back to where the walk started. Each is a line
 * in the map frame, drawn on the map and in the card.
 */

export const NAV_STUCK_REASONS: readonly NavStuckReason[] = ['no_route', 'no_progress', 'nav2_aborted']
export const NAV_STUCK_POLICIES: readonly NavStuckPolicy[] = ['ask', 'auto', 'stop']

/** Wire shape of NavResolveParams (shared/schemas/commands.py, 0.0.27). */
export interface NavResolveParams {
  goal_id: string
  choice: 'route' | 'retry' | 'cancel'
  /** Required iff choice is "route": one of the offered option ids. */
  option_id?: string | null
}
export type NavResolveChoice = NavResolveParams['choice']

/** Wire shape of SET_NAV_STUCK_POLICY's params (0.0.27). */
export interface SetNavStuckPolicyParams {
  policy: NavStuckPolicy
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function readPoint(raw: unknown): Point2D | null {
  return Array.isArray(raw) && raw.length === 2 && finite(raw[0]) && finite(raw[1]) ? [raw[0], raw[1]] : null
}

/** A list of map points, or null when any is not a finite pair or there are
 * more than the schema allows: a line drawn half-right is worse than none. */
function readPoints(raw: unknown): Point2D[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_NAV_PATH_POINTS) return null
  const out: Point2D[] = []
  for (const p of raw) {
    const point = readPoint(p)
    if (!point) return null
    out.push(point)
  }
  return out
}

/** Metres along a polyline. */
export function polylineLengthM(points: readonly Point2D[]): number {
  let sum = 0
  for (let i = 1; i < points.length; i++) sum += Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1])
  return sum
}

/** One offered route as it may be used, or null: it needs an id and finite
 * points. A missing length is measured; a missing end is the last point. */
export function readRouteOption(raw: unknown): NavRouteOption | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const o = raw as Record<string, unknown>
  if (typeof o.option_id !== 'string' || !o.option_id) return null
  const points = readPoints(o.points ?? [])
  if (!points) return null
  const end = readPoint(o.end) ?? points[points.length - 1] ?? null
  if (!end) return null
  const length = finite(o.length_m) && o.length_m >= 0 ? o.length_m : polylineLengthM(points)
  const est = finite(o.est_s) && o.est_s >= 0 ? o.est_s : null
  return { option_id: o.option_id, points, length_m: length, est_s: est, end }
}

/**
 * `nav_goal.stuck` as it may be used, or null. It arrives from MQTT
 * unvalidated. Without a finite `stuck_at` there is nothing to draw it at, so
 * the whole thing is dropped; a route that is not well-formed is dropped on its
 * own (the card still offers the rest, Retry and Cancel), and a failed route
 * that is not becomes empty. A reason this build does not know is kept: the
 * card says it in general words.
 */
export function readNavStuck(raw: unknown): NavStuck | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const s = raw as Record<string, unknown>
  const stuckAt = readPoint(s.stuck_at)
  if (!stuckAt) return null
  const routes = Array.isArray(s.routes)
    ? s.routes.map(readRouteOption).filter((r): r is NavRouteOption => r !== null)
    : []
  return {
    reason: (typeof s.reason === 'string' ? s.reason : '') as NavStuckReason,
    since: typeof s.since === 'string' ? s.since : '',
    decide_by: typeof s.decide_by === 'string' ? s.decide_by : null,
    failed_route: readPoints(s.failed_route ?? []) ?? [],
    stuck_at: stuckAt,
    routes,
    nearest: s.nearest == null ? null : readRouteOption(s.nearest),
    back: s.back == null ? null : readRouteOption(s.back),
  }
}

/** `nav_stuck_policy` from /state, or null for an older bridge (or a value this
 * build does not know, which it cannot offer either). */
export function readNavStuckPolicy(raw: unknown): NavStuckPolicy | null {
  return typeof raw === 'string' && (NAV_STUCK_POLICIES as readonly string[]).includes(raw) ? raw as NavStuckPolicy : null
}

// ── The routes, as the card and the map show them ───────────────────────────

/** Which line a route is drawn as: A teal, B purple, nearest green, back grey dashed. */
export type RouteKind = 'a' | 'b' | 'nearest' | 'back'

export interface StuckRoute {
  /** The option_id to send back. */
  id: string
  kind: RouteKind
  option: NavRouteOption
  /** The shortest of the routes to the goal, when there is more than one. */
  shortest: boolean
  /** Metres longer than what was left of the route that failed; null when
   * that is not known or the difference is too small to say. */
  extraM: number | null
}

function routeKind(option: NavRouteOption, index: number): RouteKind {
  const id = option.option_id.trim().toUpperCase()
  if (id === 'A') return 'a'
  if (id === 'B') return 'b'
  return index === 0 ? 'a' : 'b'
}

/** The route that failed, from where the robot got stuck: the part it had
 * already walked does not count against an alternative. */
function failedRemainingM(stuck: NavStuck): number | null {
  const route = stuck.failed_route
  if (route.length < 2) return null
  // Nearest vertex to where it stopped, then the rest of the line.
  let best = 0, bestD = Infinity
  route.forEach(([x, y], i) => {
    const d = Math.hypot(x - stuck.stuck_at[0], y - stuck.stuck_at[1])
    if (d < bestD) { bestD = d; best = i }
  })
  return bestD + polylineLengthM(route.slice(best))
}

/** The routes in the card's order -- A, B, then the nearest point, then the
 * way back -- with the shortest route to the goal marked. */
export function stuckRoutes(stuck: NavStuck): StuckRoute[] {
  const failedM = failedRemainingM(stuck)
  const toGoal = stuck.routes.slice(0, 2)
  const shortestLen = toGoal.length > 1 ? Math.min(...toGoal.map((r) => r.length_m)) : null
  const out: StuckRoute[] = toGoal.map((option, i) => {
    const extra = failedM === null ? null : option.length_m - failedM
    return {
      id: option.option_id,
      kind: routeKind(option, i),
      option,
      shortest: shortestLen !== null && option.length_m === shortestLen && toGoal.findIndex((r) => r.length_m === shortestLen) === i,
      extraM: extra !== null && extra >= 0.1 ? extra : null,
    }
  })
  if (stuck.nearest && toGoal.length === 0) out.push({ id: stuck.nearest.option_id, kind: 'nearest', option: stuck.nearest, shortest: false, extraM: null })
  if (stuck.back) out.push({ id: stuck.back.option_id, kind: 'back', option: stuck.back, shortest: false, extraM: null })
  return out
}

/** The route picked when the card opens: the shortest to the goal, else the
 * nearest point, else the way back; null with none. */
export function defaultRouteId(routes: readonly StuckRoute[]): string | null {
  const toGoal = routes.filter((r) => r.kind === 'a' || r.kind === 'b')
  const shortest = toGoal.find((r) => r.shortest) ?? toGoal[0]
  return (shortest ?? routes.find((r) => r.kind === 'nearest') ?? routes[0] ?? null)?.id ?? null
}

/** The map-frame box that holds every line of a stuck walk (the failed route,
 * each option, where it stopped) and the goal, with `pad` metres round it.
 * Every row's drawing uses this one box, so they read as the same place. */
export function stuckBox(
  stuck: NavStuck, goal: { x_m: number; y_m: number } | null, pad = 0.6,
): { minX: number; minY: number; maxX: number; maxY: number } {
  let minX = stuck.stuck_at[0], maxX = minX, minY = stuck.stuck_at[1], maxY = minY
  const add = ([x, y]: Point2D) => {
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  for (const r of [...stuck.routes, stuck.nearest, stuck.back]) if (r) { r.points.forEach(add); add(r.end) }
  stuck.failed_route.forEach(add)
  if (goal) add([goal.x_m, goal.y_m])
  return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad }
}

/** The point halfway along a line by length, where its label sits. */
export function midpointOf(points: readonly Point2D[]): Point2D | null {
  if (points.length === 0) return null
  if (points.length === 1) return points[0]
  const half = polylineLengthM(points) / 2
  let walked = 0
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i]
    const seg = Math.hypot(bx - ax, by - ay)
    if (walked + seg >= half && seg > 0) {
      const t = (half - walked) / seg
      return [ax + (bx - ax) * t, ay + (by - ay) * t]
    }
    walked += seg
  }
  return points[points.length - 1]
}

// ── Words ────────────────────────────────────────────────────────────────────

/** A length as the card shows it: one decimal. */
export const formatRouteM = (m: number): string => m.toFixed(1)

/** A walk's time as the card shows it: "about 35 s", or minutes from 90 s. */
export function formatEstimate(s: number): string {
  return s < 90
    ? i18n.t('liveops.nav.stuck.aboutSeconds', { s: Math.max(1, Math.round(s)) })
    : i18n.t('liveops.nav.stuck.aboutMinutes', { m: Math.round(s / 60) })
}

/** The sentence under the title, per reason; a reason this build does not
 * know reads in general words. */
export function stuckReasonText(reason: string): string {
  return (NAV_STUCK_REASONS as readonly string[]).includes(reason)
    ? i18n.t(`liveops.nav.stuck.reason.${reason as NavStuckReason}`)
    : i18n.t('liveops.nav.stuck.reason.unknown')
}

/** A route's name: "A", "B", "Nearest point", "Back to the start". */
export function routeName(route: Pick<StuckRoute, 'kind' | 'id'>): string {
  if (route.kind === 'nearest') return i18n.t('liveops.nav.stuck.name.nearest')
  if (route.kind === 'back') return i18n.t('liveops.nav.stuck.name.back')
  return route.id
}

/** The short name on the map's label. */
export function routeTag(route: Pick<StuckRoute, 'kind' | 'id'>): string {
  if (route.kind === 'nearest') return i18n.t('liveops.nav.stuck.tag.nearest')
  if (route.kind === 'back') return i18n.t('liveops.nav.stuck.tag.back')
  return route.id
}

/** The primary button for the picked route: "Go via A", "Go back to the start". */
export function goLabel(route: Pick<StuckRoute, 'kind' | 'id'>): string {
  if (route.kind === 'nearest') return i18n.t('liveops.nav.stuck.go.nearest')
  if (route.kind === 'back') return i18n.t('liveops.nav.stuck.go.back')
  return i18n.t('liveops.nav.stuck.go.route', { name: route.id })
}

/** The row's second line. */
export function routeNote(route: StuckRoute, goal: { x_m: number; y_m: number } | null): string | null {
  if (route.kind === 'back') return i18n.t('liveops.nav.stuck.note.back')
  if (route.kind === 'nearest') {
    if (!goal) return null
    const d = Math.hypot(goal.x_m - route.option.end[0], goal.y_m - route.option.end[1])
    return i18n.t('liveops.nav.stuck.note.nearest', { distance: formatRouteM(d) })
  }
  return route.extraM === null ? null : i18n.t('liveops.nav.stuck.note.longer', { distance: formatRouteM(route.extraM) })
}

// ── The countdown ────────────────────────────────────────────────────────────

/**
 * When the robot stops waiting, in THIS browser's clock (ms), or null when it
 * does not wait (decide_by null: auto or stop, or an older bridge).
 *
 * `since` and `decide_by` are the robot's clock. Their difference is the
 * window (60 s), counted from when this browser first saw the walk stuck; the
 * robot's deadline read straight against the browser clock is the other
 * estimate, right when the clocks agree and when the page opened late. The
 * earlier of the two is used, so a skewed clock can only make the bar run
 * short, never promise time the robot will not give. Nothing is refused on
 * it: the robot decides.
 */
export function stuckDeadlineMs(stuck: Pick<NavStuck, 'since' | 'decide_by'>, firstSeenAt: number): number | null {
  if (!stuck.decide_by) return null
  const by = Date.parse(stuck.decide_by)
  if (!Number.isFinite(by)) return null
  const since = Date.parse(stuck.since)
  const window = Number.isFinite(since) && by > since ? by - since : null
  return window === null ? by : Math.min(firstSeenAt + window, by)
}

/** How much of the window is left, 0-1, for the bar. */
export function stuckFractionLeft(stuck: Pick<NavStuck, 'since' | 'decide_by'>, firstSeenAt: number, now: number): number | null {
  const end = stuckDeadlineMs(stuck, firstSeenAt)
  if (end === null) return null
  const since = Date.parse(stuck.since)
  const by = Date.parse(stuck.decide_by!)
  const window = Number.isFinite(since) && by > since ? by - since : 60_000
  return Math.max(0, Math.min(1, (end - now) / window))
}

// ── Who may answer, and what an answer sends ────────────────────────────────

/** Whether this operator may answer the stuck walk, or who holds control
 * instead. Mirrors the bridge's gate for NAV_RESOLVE, which is NAV_GOTO's: a
 * person holding control (anyone but the walk itself, `nav:<goal_id>`) or a
 * mission run keeps the decision; with nobody, anyone may answer. */
export function stuckAnswerable(robot: Pick<RobotState, 'control_owner'>): { ok: true } | { ok: false; owner: string } {
  const owner = robot.control_owner
  if (owner == null || isNavOwner(owner)) return { ok: true }
  if (isMissionOwner(owner)) return { ok: false, owner }
  return owner === currentOperatorId() ? { ok: true } : { ok: false, owner }
}

/** The body of a NAV_RESOLVE. Throws RangeError for a route with no option. */
export function navResolveParams(goalId: string, choice: NavResolveChoice, optionId: string | null = null): NavResolveParams {
  if (choice === 'route') {
    if (!optionId) throw new RangeError('NAV_RESOLVE route needs an option_id')
    return { goal_id: goalId, choice, option_id: optionId }
  }
  return { goal_id: goalId, choice }
}

// ── Remembering a stuck walk after it ends ───────────────────────────────────

/** A stuck walk the bar shows: live (waiting for an answer) or ended from
 * there (the stop policy, or no answer in time), with the routes it offered. */
export interface StuckEpisode {
  goal: NavGoalStatus
  stuck: NavStuck | null
  mode: 'live' | 'ended'
  /** When this browser first saw the walk stuck: the countdown's start. */
  firstSeenAt: number
}

/** What LiveOps remembers about one robot's stuck walks. */
export interface StuckTrack {
  robotId: string
  /** goal_id/state/since of the last status looked at; same key, same track. */
  key: string | null
  /** The goal last seen stuck, and its options (a terminal status may not
   * carry them again). */
  lastStuck: { goalId: string; stuck: NavStuck | null; firstSeenAt: number } | null
  /** A walk that ended from stuck, shown until dismissed or a new walk. */
  ended: StuckEpisode | null
}

const trackKey = (goal: NavGoalStatus | null) =>
  (goal ? `${goal.goal_id}/${goal.state}/${goal.stuck?.since ?? ''}/${goal.stuck?.routes.length ?? -1}` : null)

/** The first look at a robot: a walk stuck now is shown; one that ended
 * before the page opened is not (as the bar's "Arrived" is not). */
export function initialStuckTrack(robotId: string, goal: NavGoalStatus | null, now: number): StuckTrack {
  return {
    robotId, key: trackKey(goal), ended: null,
    lastStuck: goal?.state === 'stuck' ? { goalId: goal.goal_id, stuck: goal.stuck ?? null, firstSeenAt: now } : null,
  }
}

/**
 * The next track after a /state (`goal` already read with readNavGoal), or the
 * same object when nothing changed. A walk that goes from stuck to aborted --
 * the stop policy, or a minute with no answer -- keeps its routes and reason
 * for the bar; a walk that is cancelled, or answered and then finishes, does
 * not (the operator decided). A new walk clears it.
 */
export function nextStuckTrack(track: StuckTrack, robotId: string, goal: NavGoalStatus | null, now: number): StuckTrack {
  if (track.robotId !== robotId) return initialStuckTrack(robotId, goal, now)
  const key = trackKey(goal)
  if (key === track.key) return track
  if (!goal) return { ...track, key }
  const prev = track.lastStuck?.goalId === goal.goal_id ? track.lastStuck : null
  if (goal.state === 'stuck') {
    // A new stuck episode (a second one on the same goal included) restarts the clock.
    const fresh = !prev || (prev.stuck?.since ?? '') !== (goal.stuck?.since ?? '')
    return {
      robotId, key, ended: null,
      lastStuck: { goalId: goal.goal_id, stuck: goal.stuck ?? prev?.stuck ?? null, firstSeenAt: fresh ? now : prev!.firstSeenAt },
    }
  }
  // Answered (or walking again): what it offered is settled.
  if (goal.state === 'active') return { robotId, key, ended: null, lastStuck: null }
  const wasStuck = track.key?.startsWith(`${goal.goal_id}/stuck/`) ?? false
  const stuck = goal.stuck ?? (wasStuck ? prev?.stuck ?? null : null)
  // The stop policy may end the walk without it ever showing as stuck: the
  // final status carries the routes, and that is enough.
  if (goal.state === 'aborted' && (wasStuck || goal.stuck)) {
    return { robotId, key, lastStuck: null, ended: { goal, stuck, mode: 'ended', firstSeenAt: prev?.firstSeenAt ?? now } }
  }
  return { robotId, key, lastStuck: null, ended: goal.goal_id === track.ended?.goal.goal_id ? track.ended : null }
}

/** The episode to show for the robot's current goal, or null. */
export function stuckEpisodeOf(track: StuckTrack, goal: NavGoalStatus | null): StuckEpisode | null {
  if (goal?.state === 'stuck') {
    const last = track.lastStuck?.goalId === goal.goal_id ? track.lastStuck : null
    return { goal, stuck: goal.stuck ?? last?.stuck ?? null, mode: 'live', firstSeenAt: last?.firstSeenAt ?? Date.now() }
  }
  return track.ended
}
