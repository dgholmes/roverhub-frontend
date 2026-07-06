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
