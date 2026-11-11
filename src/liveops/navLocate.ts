import i18n from '@/i18n'
import type { Command } from '@/types'

/**
 * What the robot's lidar said about a Set position, and the one walk refusal
 * that sends the operator back to Set position. Pure: NavGoalLayer shows the
 * notice in its bar; everything it says is decided here.
 *
 * Set position is placed by eye on a mostly blank map, and on 2026-11-11 one
 * placement left the robot 1.8 m and 75° wrong while the console showed it as
 * localised. The bridge now matches a live scan against the map and places the
 * robot where the scan fits, and says so in RESET_POSITION's ack:
 * `result.locate`. An older bridge, or a robot without navigation, sends no
 * `locate`, and then nothing new is shown.
 */

export type LocateOutcome = 'confirmed' | 'corrected' | 'unconfirmed'
export type LocateReason = 'no_scan' | 'no_map' | 'poor_fit' | 'ambiguous' | 'unavailable'

/** `result.locate` of a RESET_POSITION ack, as it may be used. */
export interface LocateResult {
  /** confirmed: the lidar agrees (within 0.25 m and 10°) and the robot was
   * snapped to the match. corrected: the lidar found it elsewhere and it was
   * placed THERE. unconfirmed: the robot is where the operator put it. */
  outcome: LocateOutcome
  /** Why not, for `unconfirmed`; null otherwise, or for a reason this build
   * does not know. */
  reason: LocateReason | null
  /** Where the robot was placed: map metres, heading degrees anticlockwise
   * from +x. Null only for `unconfirmed`, which may leave them out. */
  x_m: number | null
  y_m: number | null
  heading_deg: number | null
  /** How far from the operator's placement, metres and signed degrees. */
  moved_m: number | null
  turned_deg: number | null
  /** How well the scan fits the map there, or null. */
  fit: number | null
}

const OUTCOMES: ReadonlySet<LocateOutcome> = new Set(['confirmed', 'corrected', 'unconfirmed'])
const REASONS: ReadonlySet<LocateReason> = new Set(['no_scan', 'no_map', 'poor_fit', 'ambiguous', 'unavailable'])

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/**
 * `result.locate`, or null. It arrives from MQTT unvalidated, so it is read
 * defensively: an outcome that is not one of the three, or a number that is
 * not a finite number (a string, NaN, a negative distance), drops it whole --
 * a notice built on half a reading would say something untrue. Only
 * `unconfirmed` may leave its pose out, since nothing is said about it. A
 * reason this build does not know reads as no reason.
 */
export function readLocate(result: unknown): LocateResult | null {
  if (typeof result !== 'object' || result === null || Array.isArray(result)) return null
  const raw = (result as Record<string, unknown>).locate
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const l = raw as Record<string, unknown>
  if (!OUTCOMES.has(l.outcome as LocateOutcome)) return null
  const outcome = l.outcome as LocateOutcome

  // Absent and null are "not said"; anything else must be a finite number.
  const malformed = (v: unknown) => v !== undefined && v !== null && !finite(v)
  const pose = [l.x_m, l.y_m, l.heading_deg, l.moved_m, l.turned_deg]
  if (pose.some(malformed) || malformed(l.fit)) return null
  if (outcome !== 'unconfirmed' && !pose.every(finite)) return null
  if (finite(l.moved_m) && l.moved_m < 0) return null

  const num = (v: unknown) => (finite(v) ? v : null)
  return {
    outcome,
    reason: REASONS.has(l.reason as LocateReason) ? l.reason as LocateReason : null,
    x_m: num(l.x_m),
    y_m: num(l.y_m),
    heading_deg: num(l.heading_deg),
    moved_m: num(l.moved_m),
    turned_deg: num(l.turned_deg),
    fit: num(l.fit),
  }
}

/** Below these a correction is not worth naming: the bridge's own tolerance
 * for "confirmed". */
export const MOVED_NOTABLE_M = 0.25
export const TURNED_NOTABLE_DEG = 10

/**
 * A line for the map's bar. `green` and `neutral` are information, `amber` asks
 * the operator to check something, `red` refuses; `setPosition` offers the Set
 * position button beside it.
 */
export interface NavNotice {
  tone: 'green' | 'neutral' | 'amber' | 'red'
  text: string
  setPosition?: boolean
}

/** Wire reasons with a sentence that helps the operator act. `no_map` and
 * `unavailable` are nothing they can fix from here, so they read as the plain
 * "could not confirm". */
const REASON_KEYS: Partial<Record<LocateReason, 'noScan' | 'ambiguous' | 'poorFit'>> = {
  no_scan: 'noScan',
  ambiguous: 'ambiguous',
  poor_fit: 'poorFit',
}

/**
 * A Set position's outcome in words. A correction names what changed: the
 * distance to one decimal and the turn in whole degrees without a sign, and
 * only the one that is notable when the other is not (both when neither is,
 * since the bridge still moved it).
 */
export function locateNotice(locate: LocateResult): NavNotice {
  switch (locate.outcome) {
    case 'confirmed':
      return { tone: 'green', text: i18n.t('liveops.nav.locate.confirmed') }
    case 'corrected': {
      const moved = locate.moved_m ?? 0
      const turned = Math.abs(locate.turned_deg ?? 0)
      const vars = { distance: moved.toFixed(1), angle: String(Math.round(turned)) }
      const movedNotable = moved >= MOVED_NOTABLE_M
      const turnedNotable = turned >= TURNED_NOTABLE_DEG
      const key = movedNotable && !turnedNotable ? 'moved' : turnedNotable && !movedNotable ? 'turned' : 'both'
      return { tone: 'neutral', text: i18n.t(`liveops.nav.locate.corrected.${key}`, vars) }
    }
    case 'unconfirmed': {
      const reasonKey = locate.reason ? REASON_KEYS[locate.reason] : undefined
      const text = reasonKey
        ? i18n.t('liveops.nav.locate.unconfirmedBecause', { reason: i18n.t(`liveops.nav.locate.reason.${reasonKey}`) })
        : i18n.t('liveops.nav.locate.unconfirmed')
      return { tone: 'amber', text }
    }
  }
}

/** NAV_GOTO's refusal when the pre-walk check finds the scan does not match the
 * map at the believed position: "REJECTED_NOT_LOCALISED", bare or with a detail
 * after a colon. */
export function isNotLocalisedRefusal(failureReason: string | null | undefined): boolean {
  return typeof failureReason === 'string' && /^REJECTED_NOT_LOCALISED(?![A-Z0-9_])/.test(failureReason.trim())
}

/** That refusal in words, or null for any other failure. */
export function notLocalisedText(failureReason: string | null | undefined): string | null {
  return isNotLocalisedRefusal(failureReason) ? i18n.t('liveops.nav.notLocalised') : null
}

/**
 * What a finished nav command has to tell the operator on the map, or null:
 * a Set position the lidar weighed in on, or a walk refused because the robot
 * is not sure where it is. Everything else -- an older bridge's Set position,
 * any other refusal -- is null, and the command toast is all there is, as
 * before.
 */
export function navCommandNotice(
  command: Pick<Command, 'type' | 'current_stage' | 'failure_reason' | 'result'>,
): NavNotice | null {
  if (command.type === 'RESET_POSITION' && command.current_stage === 'execution_completed') {
    const locate = readLocate(command.result)
    return locate ? locateNotice(locate) : null
  }
  if (command.type === 'NAV_GOTO' && command.current_stage === 'execution_failed') {
    const text = notLocalisedText(command.failure_reason)
    return text ? { tone: 'red', text, setPosition: true } : null
  }
  return null
}

/** How long a notice stays when the operator does nothing else on the map:
 * a confirmation as long as "Arrived"; anything to read and act on as long as
 * a failed command's toast. */
export const NOTICE_SHORT_MS = 6000
export const NOTICE_LONG_MS = 12000

export function noticeShowMs(notice: Pick<NavNotice, 'tone'>): number {
  return notice.tone === 'green' ? NOTICE_SHORT_MS : NOTICE_LONG_MS
}
