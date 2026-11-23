/**
 * Which stream to ask for and how to smooth it, for one camera pane.
 *
 * The rule the operator chose on 2026-11-23 ("Auto"): steady to watch, fast to
 * drive. While this viewer holds control the picture must not be late, so it
 * is smoothed causally (no delay, ~51 % of the shake removed on a real walk);
 * otherwise with 4 frames of lookahead (+267 ms, ~75 %).
 *
 * An edge device can steady a camera itself (`VIDEO_STABILISE`, off by
 * default) and says so in its registration (`stabilised_cameras`). Its stream
 * already carries the lookahead delay, so it is used as it is only when this
 * viewer would have used lookahead anyway; otherwise the raw stream is asked
 * for (`?raw=1`) and handled here. Never smoothed twice.
 */

/** Frames of lookahead while watching: 267 ms at the robot's 15 fps. */
export const LOOKAHEAD_FRAMES = 4

export type Smoothing = 'off' | 'causal' | 'lookahead'

export interface SteadyInputs {
  /** The viewer's Steady switch. */
  steady: boolean
  /** This viewer holds control of the robot (they are driving). */
  holdsControl: boolean
  /** The edge device already steadies this camera's stream. */
  edgeSteadies: boolean
}

export interface SteadyPlan {
  /** Ask the edge for its unsmoothed stream (only meaningful when it steadies). */
  raw: boolean
  smoothing: Smoothing
}

export function steadyPlan({ steady, holdsControl, edgeSteadies }: SteadyInputs): SteadyPlan {
  const wanted: Smoothing = !steady ? 'off' : holdsControl ? 'causal' : 'lookahead'
  if (!edgeSteadies) return { raw: false, smoothing: wanted }
  if (wanted === 'lookahead') return { raw: false, smoothing: 'off' }
  return { raw: true, smoothing: wanted }
}
