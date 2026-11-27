import { gestureSpec, type GestureKind } from '@/liveops/gestures'
import { AIRBORNE_MOTION_IDS, gestureLabel, WAYPOINT_QUICK_ACTION_IDS } from '@/liveops/postureModel'
import type { MissionLibraryEntry, WaypointAction } from '@/types'

/**
 * A waypoint's Quick action (`quick_action`, schema 0.0.34): one of LiveOps'
 * Quick actions, performed on arrival. The list, labels and lengths are
 * LiveOps' own (postureModel's WAYPOINT_QUICK_ACTION_IDS, gestures.ts
 * GESTURES); the backend's route compiler mirrors the lengths for its estimate.
 */

/** What a waypoint needs to know about a move: whether it is held (Wave,
 * kept up until sent again, so the action has a duration) or timed, and a
 * timed one's length -- its entry in GESTURES. Null for anything that is not
 * a waypoint move. */
export function waypointMoveSpec(state: string): { kind: GestureKind; seconds?: number } | null {
  if (!WAYPOINT_QUICK_ACTION_IDS.includes(state)) return null
  return gestureSpec(state)
}

/** How long a held move (Wave) is kept up when the action names no time. */
export const HELD_DEFAULT_SECONDS = 5
export const HELD_MIN_SECONDS = 1
export const HELD_MAX_SECONDS = 600

export interface QuickActionMove {
  /** The SET_STATE target. */
  state: string
  /** LiveOps' label, in the current language. */
  label: string
  kind: GestureKind
  /** A timed move's length; undefined for a held one. */
  seconds?: number
  /** Leaves the ground: needs clear space around the waypoint. */
  airborne: boolean
}

/** The moves the picker offers, by label in the current language. */
export function quickActionMoves(): QuickActionMove[] {
  return WAYPOINT_QUICK_ACTION_IDS
    .map((state) => {
      const spec = waypointMoveSpec(state)!
      return { state, label: gestureLabel(state), kind: spec.kind, seconds: spec.seconds, airborne: AIRBORNE_MOTION_IDS.has(state) }
    })
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function quickActionState(a: Pick<WaypointAction, 'params'>): string | null {
  return typeof a.params.state === 'string' && a.params.state !== '' ? a.params.state : null
}

export function isAirborneQuickAction(a: Pick<WaypointAction, 'type' | 'params'>): boolean {
  const state = a.type === 'quick_action' ? quickActionState(a) : null
  return state !== null && AIRBORNE_MOTION_IDS.has(state)
}

/** Whether the move is held (kept up until sent again), so the action has a duration. */
export function isHeldQuickAction(a: Pick<WaypointAction, 'params'>): boolean {
  const state = quickActionState(a)
  return state !== null && waypointMoveSpec(state)?.kind === 'held'
}

/** Seconds the move takes, as the backend counts it: a timed move's known
 * length, a held move's duration (5 s when none is set). Unknown: 0. */
export function quickActionSeconds(a: Pick<WaypointAction, 'params'>): number {
  const state = quickActionState(a)
  const spec = state ? waypointMoveSpec(state) : null
  if (!spec) return 0
  if (spec.kind === 'held') return typeof a.params.seconds === 'number' && a.params.seconds > 0 ? a.params.seconds : HELD_DEFAULT_SECONDS
  return spec.seconds ?? 0
}

/** A new Quick action for `state`, labelled with the move. A held move starts at 5 s. */
export function newQuickAction(state: string): WaypointAction {
  const held = waypointMoveSpec(state)?.kind === 'held'
  return { type: 'quick_action', label: gestureLabel(state), params: held ? { state, seconds: HELD_DEFAULT_SECONDS } : { state } }
}

/** The action switched to another move: label follows, a duration only for a held one. */
export function withQuickActionMove(a: WaypointAction, state: string): WaypointAction {
  const next = newQuickAction(state)
  if (next.params.seconds !== undefined && typeof a.params.seconds === 'number') next.params.seconds = a.params.seconds
  return { ...a, label: next.label, params: next.params }
}

/** The airborne moves a route mission makes, each once, in route order. */
export function airborneMovesIn(mission: Pick<MissionLibraryEntry, 'kind' | 'waypoints'>): string[] {
  if (mission.kind !== 'route') return []
  const out: string[] = []
  for (const wp of mission.waypoints) {
    for (const a of wp.actions) {
      const state = isAirborneQuickAction(a) ? quickActionState(a)! : null
      if (state && !out.includes(state)) out.push(state)
    }
  }
  return out
}

/** "3 s", "5.9 s", "2 min 7 s": a move's length as the picker shows it. */
export function moveLengthText(t: (key: string, options?: Record<string, unknown>) => string, seconds: number): string {
  if (seconds < 60) return t('missions.actions.quick.seconds', { s: Math.round(seconds * 10) / 10 })
  return t('missions.actions.quick.minSeconds', { m: Math.floor(seconds / 60), s: Math.round(seconds % 60) })
}
