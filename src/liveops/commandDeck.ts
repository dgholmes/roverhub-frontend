/** One declaration of the operator controls LiveOps offers, rendered by both
 * the desktop command bar and the touch dock.
 *
 * Why this exists rather than `partitionCommandButtons`:
 * `commandOverflow.ts` splits a list of *command types* into a row and a menu,
 * and in `CurrentTaskBar` the list it is given has only ever held the
 * undispatchable PAUSE / RETURN / DOCK. Everything an operator actually uses --
 * take and release control, Release & resume, Retry, Stop mission, posture, the
 * leg switch, obstacle avoidance, LED, Speak -- was hand-written JSX further
 * down that file. A second shell built from the old helper would have shipped a
 * dock missing all of it, silently: the design's anti-goal #2, and the mistake
 * `RealDataProvider`'s hand-maintained WIRED_COMMAND_TYPES mirror already makes.
 * `src/liveops/commandDeck.test.ts` derives the bar's control set from
 * `CurrentTaskBar.tsx` itself and fails when the two drift.
 *
 * What this module decides and what it must not:
 * - It declares **which controls exist** and **at which tier** a given width
 *   shows them. Existence comes from `TaskBarModel.buttons` (the run and
 *   control-ownership story, computed once in `taskBar.ts`) and from the robot
 *   type's capabilities.
 * - It never decides **whether a command may be dispatched**.
 *   `getCommandAvailability` (`liveops/commandPolicy.ts`) is the only authority
 *   on that, and every consumer calls it per entry. There is deliberately no
 *   availability field here and no second list of wired types.
 * - It renders nothing and owns no dialog state. An entry says `kind`; the
 *   shell decides what that looks like, and the leg-switch and Stop-mission
 *   confirmations stay with the component that renders them.
 *
 * Design: docs/superpowers/specs/2026-11-23-tablet-and-mobile-console-design.md §7.2.
 */
import { applicablePostureActions } from '@/liveops/postureContext'
import type { PostureAction } from '@/liveops/postureModel'
import type { TaskBarModel } from '@/liveops/taskBar'
import type { CommandType, RobotState } from '@/types'

/** One control, or one group of controls that share a renderer.
 *
 * `posture` is a group on purpose: Stand, Sit, Safe stop and the contextual
 * Get up are one widget (`PostureButtons`) over one command type with different
 * `state` params, and splitting them here would mean re-deriving
 * `postureActionsFor` in two shells. */
export type DeckKind =
  | 'control'
  | 'releaseResume'
  | 'retry'
  | 'stopMission'
  | 'posture'
  | 'legSwitch'
  | 'avoidance'
  | 'led'
  | 'speak'
  | 'command'

/** Every kind, as a value, so a test can check the union against the renderers
 * that claim to cover it. Keep in the order entries are emitted. */
export const DECK_KINDS: readonly DeckKind[] = [
  'control', 'releaseResume', 'retry', 'stopMission', 'posture',
  'legSwitch', 'avoidance', 'led', 'speak', 'command',
]

/** `primary` is on the row or the dock; `overflow` is behind the "..." menu. */
export type DeckTier = 'primary' | 'overflow'

export interface DeckEntry {
  /** Stable across renders and unique within a deck: a React key, and what a
   * test names when a control goes missing. */
  key: string
  kind: DeckKind
  /** The single command type a consumer should ask `getCommandAvailability`
   * about. Absent for the two groups that span more than one type: `control`
   * (TAKE_CONTROL / RELEASE_CONTROL, whose own widget asks about both) and
   * `posture` (SET_STATE with a different `state` per target). */
  type?: CommandType
  tier: DeckTier
  /** `posture` only: which of the applicable actions this entry draws.
   *
   * The posture slot is one entry that renders up to three buttons, which on
   * a phone is most of the row. At `narrow` the deck splits it -- the action
   * the robot's own posture calls for stays on the dock, the rest go behind
   * "..." -- and this is how each half says which it owns. Absent means all
   * of them, which is every other caller. */
  postureActions?: PostureAction[]
}

/** Command types the bar declares but the edge cannot dispatch, so they are
 * behind the "..." menu at every width rather than taking row space from
 * working controls.
 *
 * None of the three is in `WIRED_COMMAND_TYPES`: an edge run is paused by Take
 * control and ended by Stop mission, and there is no return or dock. The real
 * provider would hand them to the mock for a simulated success, so
 * `commandPolicy` disables them against a real backend and during any run.
 *
 * ⚠️ **Remove an entry here the moment its command becomes wired** -- a working
 * command belongs on the row, not buried in a menu. RESUME was the fourth until
 * 2026-11-11 (schema 0.0.16); it is now the `retry` entry. SNAPSHOT was here
 * too, for want of camera plumbing; it became wired on 2026-08-13 and left the
 * bar on 2026-10-28 for the video's own capture rail (hero/CaptureRail.tsx),
 * because two buttons for one action cost row width. */
export const UNWIRED_COMMANDS = ['PAUSE', 'RETURN', 'DOCK'] as const satisfies readonly CommandType[]

/** The literal type of the above, so a shell's icon and label tables are
 * checked against it rather than hand-kept in step. */
export type UnwiredCommand = (typeof UNWIRED_COMMANDS)[number]

/**
 * The controls LiveOps offers for `robot`, in render order.
 *
 * `width` is the space the shell has, not the device: `wide` is the desktop bar
 * and a tablet dock, `narrow` a phone dock.
 *
 * The rule, which narrowed on 2026-11-24 (design §6.4): which *tier* a control
 * lands in is a function of width alone. Which controls *exist* may depend on
 * the robot and the run, under two constraints -- a control may be omitted only
 * when it cannot apply (never when it is merely refused, which is
 * `getCommandAvailability`'s business and is drawn disabled with its reason),
 * and a control that replaces another takes its slot rather than shifting the
 * row. The old rule forbade state-driven existence outright, for a reason that
 * still holds and is what the second constraint keeps: a control arriving under
 * a moving thumb is worse than a control that was never there.
 *
 * At `narrow` the primaries are the design's phone set (§7.2): the control
 * toggle and posture -- Stand, Sit and Safe stop, the three a cornered operator
 * reaches for -- with Speak, LED, avoidance, the leg switch and Stop mission in
 * the "..." menu beside them.
 */
export function deckEntries(model: TaskBarModel, robot: RobotState, width: 'wide' | 'narrow'): DeckEntry[] {
  const wide = width === 'wide'
  /** Controls that earn a row slot on a wide deck and a menu line on a phone. */
  const byWidth: DeckTier = wide ? 'primary' : 'overflow'
  const entries: DeckEntry[] = []

  // The control group follows taskBarModel exactly: `release` and `takeControl`
  // are the one toggle, `releaseResume` stands in its place while you hold a
  // paused run, and a run another operator paused offers neither.
  if (model.buttons.includes('takeControl') || model.buttons.includes('release')) {
    entries.push({ key: 'control', kind: 'control', tier: 'primary' })
  }
  if (model.buttons.includes('releaseResume')) {
    entries.push({ key: 'releaseResume', kind: 'releaseResume', type: 'RELEASE_CONTROL', tier: 'primary' })
  }
  if (model.buttons.includes('retry')) {
    entries.push({ key: 'retry', kind: 'retry', type: 'RESUME', tier: 'primary' })
  }
  if (model.buttons.includes('stopMission')) {
    entries.push({ key: 'stopMission', kind: 'stopMission', type: 'STOP_MISSION', tier: byWidth })
  }

  // Posture exists where the robot has a posture action that applies now --
  // Stand to a robot lying down, Sit and Safe stop to one that is up, Get up to
  // a fallen one, and all three when its `sdk_state` is unrecognised
  // (postureContext.ts). Stand and Sit share this one slot by construction, so
  // the deck's width does not change as the robot stands up.
  //
  // A running mission drops it: posture and the leg switch are both refused by
  // the bridge for the length of a run, so they cannot apply, and the room goes
  // to Stop mission. A *paused* run keeps posture -- standing the robot up to
  // look at something is the reason an operator pauses one.
  //
  // A phone takes only the FIRST of them on the dock and puts the rest in
  // "..." (operator, 2026-11-25, who picked this shape): the slot is up to
  // three buttons, which on a 390 px row is most of the space there is, and
  // the first is the one the robot's own posture calls for -- Stand to a
  // robot lying down, Sit to one that is up, Get up to a fallen one. A
  // tablet and the desktop bar keep all of them on the row.
  const running = model.slot === 'running'
  const posture = running ? [] : applicablePostureActions(robot)
  if (posture.length > 0) {
    entries.push({
      key: 'posture', kind: 'posture', tier: 'primary',
      postureActions: wide ? posture : posture.slice(0, 1),
    })
    if (!wide && posture.length > 1) {
      entries.push({
        key: 'posture-more', kind: 'posture', tier: 'overflow',
        postureActions: posture.slice(1),
      })
    }
  }

  // On the row rather than in More: the operator wants the leg switch one click
  // away (2026-11-06), even though it makes the row wrap sooner.
  if (!running) {
    entries.push({ key: 'legSwitch', kind: 'legSwitch', type: 'CHANGE_MODE', tier: byWidth })
  }
  entries.push({ key: 'avoidance', kind: 'avoidance', type: 'SET_OBSTACLE_AVOIDANCE', tier: byWidth })
  entries.push({ key: 'led', kind: 'led', type: 'LED_SIGNAL', tier: byWidth })
  entries.push({ key: 'speak', kind: 'speak', type: 'SPEAK', tier: byWidth })

  for (const type of UNWIRED_COMMANDS) {
    entries.push({ key: type, kind: 'command', type, tier: 'overflow' })
  }

  return entries
}
