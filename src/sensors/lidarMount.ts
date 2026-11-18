import { schemaAtLeast } from '@/lib/schemaVersion'
import {
  CALIBRATION_MODES, DIFFERS_MIN_DEG, DIFFERS_MIN_M, MAX_MOUNT_HISTORY, MOUNT_BOUNDS, MOUNT_CONFIDENT_TURNS, MOUNT_SOURCES,
  TURN_REFUSALS, type LidarMount, type LidarMountChange, type LidarMountEstimate, type LidarMountStatus, type LidarMountTurn,
  type TurnRefusal,
} from '@/types/sensors'

/**
 * Systems › Sensors' logic, kept out of the page so it can be tested alone:
 * reading a LidarMountStatus off the wire, laying out the In use / Measured
 * table, building the mount that Apply measured sends, checking a typed one,
 * and deciding when the bell says the lidar seems to have moved.
 */

/** The first schema whose bridges publish sensors/lidar_mount and accept the
 * two commands. An older bridge would refuse SET_LIDAR_MOUNT as unknown. */
export const SENSORS_MIN_SCHEMA = '0.0.23'

export const bridgeHasSensors = (schemaVersion: string | null | undefined): boolean =>
  schemaAtLeast(schemaVersion, SENSORS_MIN_SCHEMA)

// --- parsing ------------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const optNum = (v: unknown): number | null | undefined => (v === undefined || v === null ? null : num(v) ? v : undefined)
const optStr = (v: unknown): string | null | undefined => (v === undefined || v === null ? null : typeof v === 'string' ? v : undefined)

const MOUNT_KEYS = Object.keys(MOUNT_BOUNDS) as (keyof LidarMount)[]

function parseMount(raw: unknown): LidarMount | null {
  if (!isObj(raw)) return null
  const out: Partial<LidarMount> = {}
  for (const k of MOUNT_KEYS) {
    // roll/pitch/yaw default to 0 in the schema; x/y/z are required.
    const v = raw[k] ?? (k.endsWith('_deg') ? 0 : undefined)
    if (!num(v)) return null
    out[k] = v
  }
  return out as LidarMount
}

function parseEstimate(raw: unknown): LidarMountEstimate | null | undefined {
  if (raw === undefined || raw === null) return null
  if (!isObj(raw)) return undefined
  const fields = {
    x_m: optNum(raw.x_m), y_m: optNum(raw.y_m), sd_x_m: optNum(raw.sd_x_m), sd_y_m: optNum(raw.sd_y_m),
    roll_deg: optNum(raw.roll_deg), pitch_deg: optNum(raw.pitch_deg), sd_tilt_deg: optNum(raw.sd_tilt_deg),
    since: optStr(raw.since), updated_at: optStr(raw.updated_at),
  }
  if (Object.values(fields).some((v) => v === undefined)) return undefined
  const turns = raw.turns ?? 0
  const still = raw.still_samples ?? 0
  if (!num(turns) || !num(still)) return undefined
  return {
    ...(fields as Omit<LidarMountEstimate, 'turns' | 'still_samples'>), turns, still_samples: still,
    // 0.0.25. Lenient: a bad value reads as "not said", like an older bridge,
    // rather than costing the whole status.
    turns_left: count(raw.turns_left), turns_right: count(raw.turns_right),
    offset_confident: flag(raw.offset_confident), tilt_confident: flag(raw.tilt_confident),
    last_turn: parseTurn(raw.last_turn),
  }
}

const count = (v: unknown): number | null => (num(v) && v >= 0 && Number.isInteger(v) ? v : null)
const flag = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)

/** The newest turn the robot saw (0.0.25), or null. A refusal whose reason
 * this console does not know yet keeps `kept: false` with no reason, so the
 * page still says the turn was not counted. */
function parseTurn(raw: unknown): LidarMountTurn | null {
  if (!isObj(raw) || typeof raw.at !== 'string' || typeof raw.kept !== 'boolean') return null
  const reason = typeof raw.reason === 'string' && (TURN_REFUSALS as readonly string[]).includes(raw.reason)
    ? raw.reason as TurnRefusal : null
  return { at: raw.at, kept: raw.kept, reason: raw.kept ? null : reason, turned_deg: num(raw.turned_deg) ? raw.turned_deg : null }
}

function parseChange(raw: unknown): LidarMountChange | null {
  if (!isObj(raw) || typeof raw.at !== 'string') return null
  const mount = parseMount(raw.mount)
  const source = raw.source
  if (!mount || typeof source !== 'string' || !(MOUNT_SOURCES as readonly string[]).includes(source)) return null
  const by = optStr(raw.by)
  if (by === undefined) return null
  return { at: raw.at, mount, source: source as LidarMountChange['source'], by }
}

/** A sensors/lidar_mount payload, or null when it is not one. A malformed
 * history entry is dropped rather than the whole status: the table and the
 * mode still matter without it. */
export function parseLidarMountStatus(raw: unknown): LidarMountStatus | null {
  if (!isObj(raw)) return null
  const { robot_id, site_id, updated_at } = raw
  if (typeof robot_id !== 'string' || !robot_id || typeof site_id !== 'string' || typeof updated_at !== 'string') return null
  const mode = raw.mode ?? 'suggest'
  if (typeof mode !== 'string' || !(CALIBRATION_MODES as readonly string[]).includes(mode)) return null
  const inUse = parseMount(raw.in_use)
  if (!inUse) return null
  const measured = parseEstimate(raw.measured)
  if (measured === undefined) return null
  const history = Array.isArray(raw.history)
    ? raw.history.map(parseChange).filter((c): c is LidarMountChange => c !== null).slice(0, MAX_MOUNT_HISTORY)
    : []
  return {
    robot_id, site_id, updated_at, mode: mode as LidarMountStatus['mode'], in_use: inUse, measured,
    differs: raw.differs === true, history,
  }
}

// --- the table ----------------------------------------------------------------

export type MountRowKey = 'forward' | 'left' | 'height' | 'pitch' | 'roll' | 'yaw'
export type MountUnit = 'm' | 'deg'

export interface MountRow {
  key: MountRowKey
  field: keyof LidarMount
  unit: MountUnit
  inUse: number
  /** The measurement, once it can be trusted; null until then (or never, for
   * a `typedOnly` row). */
  measured: number | null
  sd: number | null
  typedOnly: boolean
  /** Being measured, not trusted yet: the offset before OFFSET_MIN_TURNS turns
   * and a spread under OFFSET_MAX_SD_M, the tilt before the bridge has one. */
  measuring: boolean
  /** The measurement is clearly different from what is in use. */
  differs: boolean
}

/** When the measured offset can be trusted, as the bridge's calibration
 * decides it (Edge B, 2026-11-16): at least 8 kept turns on the spot (3 or
 * more each way) and a spread under 1.5 cm. From 0.0.25 the bridge says so
 * itself (`offset_confident`) and that is what counts; for an older bridge
 * the console can check only the total and the spread. */
export const OFFSET_MIN_TURNS = MOUNT_CONFIDENT_TURNS
export const OFFSET_MAX_SD_M = 0.015

export function offsetConfident(m: LidarMountEstimate | null | undefined): boolean {
  if (!m || m.x_m === null || m.y_m === null) return false
  if (typeof m.offset_confident === 'boolean') return m.offset_confident
  return m.turns >= OFFSET_MIN_TURNS
    && m.sd_x_m !== null && m.sd_y_m !== null && m.sd_x_m < OFFSET_MAX_SD_M && m.sd_y_m < OFFSET_MAX_SD_M
}

/** The tilt can be trusted: the bridge's `tilt_confident` from 0.0.25; before
 * that it sent no tilt until it had one (10 s standing still). */
export function tiltMeasured(m: LidarMountEstimate | null | undefined): boolean {
  if (!m || m.pitch_deg === null || m.roll_deg === null) return false
  return typeof m.tilt_confident === 'boolean' ? m.tilt_confident : true
}

const ROWS: { key: MountRowKey; field: keyof LidarMount; unit: MountUnit; est?: keyof LidarMountEstimate; sd?: keyof LidarMountEstimate; tilt?: boolean }[] = [
  { key: 'forward', field: 'x_m', unit: 'm', est: 'x_m', sd: 'sd_x_m' },
  { key: 'left', field: 'y_m', unit: 'm', est: 'y_m', sd: 'sd_y_m' },
  { key: 'height', field: 'z_m', unit: 'm' },
  { key: 'pitch', field: 'pitch_deg', unit: 'deg', est: 'pitch_deg', sd: 'sd_tilt_deg', tilt: true },
  { key: 'roll', field: 'roll_deg', unit: 'deg', est: 'roll_deg', sd: 'sd_tilt_deg', tilt: true },
  { key: 'yaw', field: 'yaw_deg', unit: 'deg' },
]

/** In use against measured, a row per value. Height and yaw are never
 * measured by the robot (sensors.py), so they say "typed only". A value still
 * being measured is not shown, so nobody acts on a guess. */
export function mountRows(status: Pick<LidarMountStatus, 'in_use' | 'measured'>): MountRow[] {
  const m = status.measured
  return ROWS.map(({ key, field, unit, est, sd, tilt }) => {
    const inUse = status.in_use[field]
    if (!est) return { key, field, unit, inUse, measured: null, sd: null, typedOnly: true, measuring: false, differs: false }
    const trusted = tilt ? tiltMeasured(m) : offsetConfident(m)
    const measured = trusted ? (m?.[est] as number | null | undefined) ?? null : null
    const spread = trusted && sd ? (m?.[sd] as number | null | undefined) ?? null : null
    const limit = unit === 'm' ? DIFFERS_MIN_M : DIFFERS_MIN_DEG
    return {
      key, field, unit, inUse, measured, sd: spread, typedOnly: false, measuring: !!m && !trusted,
      differs: measured !== null && Math.abs(measured - inUse) > limit,
    }
  })
}

/** "0.234 m", "-5.9°": three decimals for metres (millimetres), one for degrees. */
export function formatMountValue(v: number, unit: MountUnit): string {
  return unit === 'm' ? `${v.toFixed(3)} m` : `${v.toFixed(1)}°`
}

/** "±0.008" / "±0.3": the spread, in the row's own unit, without the unit. */
export function formatSpread(sd: number, unit: MountUnit): string {
  return `±${unit === 'm' ? sd.toFixed(3) : sd.toFixed(1)}`
}

// --- Apply measured -----------------------------------------------------------

export type MeasuredMount =
  | { ok: true; mount: LidarMount }
  /** `nothing`: that part is not measured well enough yet. `outOfRange`: the
   * estimate falls outside what the bridge accepts, so it cannot be sent. */
  | { ok: false; reason: 'nothing' | 'outOfRange' }

/** What one step applies: the mount in use with only that step's measured
 * values -- `offset` the forward/left offset (step 2), `tilt` the pitch and
 * roll (step 1). Everything else stays as in use, and height and yaw are never
 * measured, so they always stay as typed. */
export function measuredMount(status: Pick<LidarMountStatus, 'in_use' | 'measured'>, part: 'offset' | 'tilt'): MeasuredMount {
  const m = status.measured
  if (part === 'offset' ? !offsetConfident(m) : !tiltMeasured(m)) return { ok: false, reason: 'nothing' }
  const mount: LidarMount = part === 'offset'
    ? { ...status.in_use, x_m: m!.x_m!, y_m: m!.y_m! }
    : { ...status.in_use, pitch_deg: m!.pitch_deg!, roll_deg: m!.roll_deg! }
  return mountInBounds(mount) ? { ok: true, mount } : { ok: false, reason: 'outOfRange' }
}

export const mountInBounds = (mount: LidarMount): boolean =>
  MOUNT_KEYS.every((k) => Number.isFinite(mount[k]) && mount[k] >= MOUNT_BOUNDS[k][0] && mount[k] <= MOUNT_BOUNDS[k][1])

// --- Edit values --------------------------------------------------------------

export type MountForm = Record<keyof LidarMount, string>
export type MountFieldError = 'required' | 'notNumber' | 'outOfRange'

/** The form's starting text: the mount in use, as the table shows it. */
export function mountToForm(mount: LidarMount): MountForm {
  const out = {} as MountForm
  for (const k of MOUNT_KEYS) out[k] = k.endsWith('_m') ? String(Number(mount[k].toFixed(3))) : String(Number(mount[k].toFixed(1)))
  return out
}

/** The typed values as a mount, or what is wrong with each field. A comma is
 * read as a decimal point (Korean and European keyboards). */
export function formToMount(form: MountForm): { ok: true; mount: LidarMount } | { ok: false; errors: Partial<Record<keyof LidarMount, MountFieldError>> } {
  const errors: Partial<Record<keyof LidarMount, MountFieldError>> = {}
  const mount = {} as LidarMount
  for (const k of MOUNT_KEYS) {
    const text = form[k].trim().replace(',', '.')
    if (!text) { errors[k] = 'required'; continue }
    const v = Number(text)
    if (!Number.isFinite(v)) { errors[k] = 'notNumber'; continue }
    if (v < MOUNT_BOUNDS[k][0] || v > MOUNT_BOUNDS[k][1]) { errors[k] = 'outOfRange'; continue }
    mount[k] = v
  }
  return Object.keys(errors).length ? { ok: false, errors } : { ok: true, mount }
}

export const sameMount = (a: LidarMount, b: LidarMount): boolean =>
  MOUNT_KEYS.every((k) => Math.abs(a[k] - b[k]) < 1e-9)

// --- the bell -----------------------------------------------------------------

/**
 * When to say "the lidar seems to have moved": once when a robot in Suggest
 * starts reporting `differs`, not on every status after it (the bridge sends
 * one at most every 10 s while the estimate moves). It may say it again for
 * the same robot only after something changed: the difference went away (or
 * the mode left Suggest) and came back, or the mount in use changed.
 */
export class LidarMoveAlerts {
  /** robot_id -> the mount in use when the robot was last alerted for. */
  private alerted = new Map<string, string>()

  /** True when this status should raise the alert. */
  observe(status: Pick<LidarMountStatus, 'robot_id' | 'mode' | 'differs' | 'in_use'>): boolean {
    if (!status.differs || status.mode !== 'suggest') {
      this.alerted.delete(status.robot_id)
      return false
    }
    const key = MOUNT_KEYS.map((k) => status.in_use[k].toFixed(4)).join(',')
    if (this.alerted.get(status.robot_id) === key) return false
    this.alerted.set(status.robot_id, key)
    return true
  }
}
