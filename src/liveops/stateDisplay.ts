import { color } from '@/design-system/tokens'
import type { AbstractState } from '@/types'

export interface StateVisual {
  label: string
  color: string
  bg: string
  border: string
  pulsing?: boolean
  icon?: 'shield'
}

/** Visual treatment per docs/05-ui-ux.md §5.1 — state is always the topmost
 * visual element wherever a robot context is shown (§18.1). */
export const STATE_DISPLAY: Record<AbstractState, StateVisual> = {
  PASSIVE:      { label: 'Passive',        color: color.t2,    bg: color.card,    border: color.border },
  STAND:        { label: 'Standing',       color: color.green, bg: color.greenBg, border: color.greenBorder },
  MANUAL:       { label: 'Manual Control', color: color.blue,  bg: color.blueBg,  border: color.blueBorder },
  ASSISTED:     { label: 'Assisted',       color: color.blue,  bg: color.blueBg,  border: color.blueBorder, icon: 'shield' },
  AUTO_MISSION: { label: 'Auto Mission',   color: color.amber, bg: color.amberBg, border: color.amberBorder },
  RETURNING:    { label: 'Returning',      color: color.amber, bg: color.amberBg, border: color.amberBorder },
  DOCKING:      { label: 'Docking',        color: color.amber, bg: color.amberBg, border: color.amberBorder },
  FAULT:        { label: 'Fault',          color: color.red,   bg: color.redBg,   border: color.redBorder },
  E_STOP:       { label: 'E-Stop Active',  color: color.red,   bg: color.redBg,   border: color.redBorder, pulsing: true },
}

/** The three SDK states that all collapse to abstract PASSIVE, and what to
 * actually call each one.
 *
 * They are not the same thing to an operator. `stand_down` (趴下) and `ready`
 * (缓慢趴下 — a slow lie-down / safe stop) are *controlled* down states with the
 * motors still energised and holding; `passive` (被动模式) de-energises the
 * motors, so the robot is limp and drops if it isn't already down.
 *
 * The 9-state abstract model deliberately can't distinguish them — see
 * robot_bridge/state_machine.py's PASSIVE_SDK_STATES, whose comment says
 * "sdk_state carries the detail for display". This is the display side of that
 * contract, which had never been implemented: sitting a robot showed "Passive",
 * i.e. it read as motors-off/limp when the robot was in fact sitting and
 * holding. Only the label is refined — the visual treatment stays PASSIVE's,
 * because all three mean the same thing for command availability
 * (docs/05-ui-ux.md §5.1) and commandPolicy keys off abstract_state alone. */
const PASSIVE_SDK_STATE_LABELS: Record<string, string> = {
  stand_down: 'Sitting',
  ready: 'Safe Stop',
  passive: 'Passive',
}

/** Visual treatment for a robot, refining PASSIVE's label from `sdk_state`.
 *
 * Prefer this over indexing STATE_DISPLAY directly anywhere a full robot is in
 * hand. Falls back to the unrefined abstract-state visual when `sdkState` is
 * absent or isn't one of the known down states, so an unmapped SDK state can
 * never produce a blank or wrong label. */
export function stateVisualFor(state: AbstractState, sdkState?: string): StateVisual {
  const base = STATE_DISPLAY[state]
  if (state !== 'PASSIVE') return base
  const label = sdkState ? PASSIVE_SDK_STATE_LABELS[sdkState] : undefined
  return label ? { ...base, label } : base
}
