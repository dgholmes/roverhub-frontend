import {
  DIFFERS_MIN_DEG, DIFFERS_MIN_M, MOUNT_CONFIDENT_EACH_WAY, MOUNT_CONFIDENT_TURNS,
  type LidarMountStatus, type LidarMountTurn,
} from '@/types/sensors'
import { offsetConfident, tiltMeasured } from './lidarMount'

/**
 * Systems › Sensors as three steps (operator's choice A, 2026-11-18): the
 * tilt, the forward/left offset, and the typed height and yaw. Each measured
 * step is done (`ok`: measured and the same as in use), needs applying
 * (`differs`), or is still being measured (`measuring`). Pure, so the page's
 * wording can be tested apart from its layout.
 */

export type StepState = 'ok' | 'differs' | 'measuring'

export interface TiltStep {
  state: StepState
  inUse: { pitch: number; roll: number }
  /** Null until the robot trusts its tilt. */
  measured: { pitch: number; roll: number } | null
  /** The roll is part of what differs, so the line names it too. */
  rollDiffers: boolean
  stillSamples: number
}

export interface OffsetStep {
  state: StepState
  inUse: { x: number; y: number }
  measured: { x: number; y: number } | null
  /** Kept turns in all, against MOUNT_CONFIDENT_TURNS. */
  turns: number
  target: number
  /** Kept turns each way, against MOUNT_CONFIDENT_EACH_WAY; null from a bridge
   * older than 0.0.25, which shows the total only. */
  left: number | null
  right: number | null
  eachWayTarget: number
  lastTurn: LidarMountTurn | null
  /** The turns are all there but the robot is not confident yet: its value
   * still moves (offset_confident also needs a spread under 1.5 cm). */
  unsteady: boolean
}

export interface MountSteps {
  tilt: TiltStep
  offset: OffsetStep
  /** Nothing left to do on the two measured steps. */
  allDone: boolean
}

export function mountSteps(status: Pick<LidarMountStatus, 'in_use' | 'measured'>): MountSteps {
  const m = status.measured
  const u = status.in_use

  const tiltTrusted = tiltMeasured(m)
  const pitchOff = tiltTrusted ? Math.abs(m!.pitch_deg! - u.pitch_deg) > DIFFERS_MIN_DEG : false
  const rollOff = tiltTrusted ? Math.abs(m!.roll_deg! - u.roll_deg) > DIFFERS_MIN_DEG : false
  const tilt: TiltStep = {
    state: !tiltTrusted ? 'measuring' : pitchOff || rollOff ? 'differs' : 'ok',
    inUse: { pitch: u.pitch_deg, roll: u.roll_deg },
    measured: tiltTrusted ? { pitch: m!.pitch_deg!, roll: m!.roll_deg! } : null,
    rollDiffers: rollOff,
    stillSamples: m?.still_samples ?? 0,
  }

  const offsetTrusted = offsetConfident(m)
  const offsetOff = offsetTrusted
    ? Math.abs(m!.x_m! - u.x_m) > DIFFERS_MIN_M || Math.abs(m!.y_m! - u.y_m) > DIFFERS_MIN_M
    : false
  const offset: OffsetStep = {
    state: !offsetTrusted ? 'measuring' : offsetOff ? 'differs' : 'ok',
    inUse: { x: u.x_m, y: u.y_m },
    measured: offsetTrusted ? { x: m!.x_m!, y: m!.y_m! } : null,
    turns: m?.turns ?? 0,
    target: MOUNT_CONFIDENT_TURNS,
    left: m?.turns_left ?? null,
    right: m?.turns_right ?? null,
    eachWayTarget: MOUNT_CONFIDENT_EACH_WAY,
    lastTurn: m?.last_turn ?? null,
    unsteady: false,
  }
  // A bridge that counts only one way is not one that counts each way.
  if (offset.left === null || offset.right === null) { offset.left = null; offset.right = null }
  offset.unsteady = offset.state === 'measuring' && offset.turns >= offset.target
    && (offset.left === null || (offset.left >= offset.eachWayTarget && offset.right! >= offset.eachWayTarget))

  return { tilt, offset, allDone: tilt.state === 'ok' && offset.state === 'ok' }
}

/** How full an each-way bar is, 0..1: it fills to the each-way target. */
export const barFraction = (n: number, target: number): number => (target > 0 ? Math.min(1, Math.max(0, n / target)) : 0)
