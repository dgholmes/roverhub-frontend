/**
 * The Greet button and Greeter mode, as pure logic the panels render
 * (schema 0.0.36; spec docs/superpowers/specs/2026-11-26-greet-and-greeter-mode-design.md).
 *
 * - `readGreeterStatus`: /state's `greeter`, validated. A bridge older than
 *   0.0.36 sends none, and that is "this robot cannot", never "off".
 * - `greeterChip`: what the status chip says and in which tone.
 * - Saved greetings: per viewer, per operator, in browser storage
 *   (lib/viewMemory), with a few Korean and English defaults.
 * - `greeterParams`: the one SET_GREETER the settings panel sends.
 */
import type { Tone } from '@/components/kit'
import { viewKey } from '@/lib/viewMemory'
import {
  DEFAULT_GREETER_SETTING, GREET_DANCES, GREETER_BOUNDS, GREETER_PHASES,
  type GreetDance, type GreeterPhase, type GreeterSetting, type GreeterStatus, type RobotState, type SetGreeterParams,
} from '@/types'

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const str = (v: unknown): v is string => typeof v === 'string'

export function isGreetDance(v: unknown): v is GreetDance {
  return typeof v === 'string' && (GREET_DANCES as readonly string[]).includes(v)
}

/** A SetGreeterParams as the robot reports it, or null when it is not one. */
function readSetting(raw: unknown): SetGreeterParams | null {
  if (!isObject(raw) || typeof raw.enabled !== 'boolean') return null
  const out: SetGreeterParams = { enabled: raw.enabled }
  if (raw.clip_id === null || str(raw.clip_id)) out.clip_id = raw.clip_id
  if (raw.dance === null || isGreetDance(raw.dance)) out.dance = raw.dance
  for (const k of ['trigger_distance_m', 'facing_distance_m', 'dance_min_distance_m', 'cooldown_s', 'min_battery_pct'] as const) {
    if (num(raw[k])) out[k] = raw[k]
  }
  return out
}

/** /state's `greeter`, or null when absent, null or malformed -- each of which
 * the console treats as a bridge with no greeter. */
export function readGreeterStatus(raw: unknown): GreeterStatus | null {
  if (!isObject(raw)) return null
  if (typeof raw.enabled !== 'boolean') return null
  if (!(GREETER_PHASES as readonly unknown[]).includes(raw.phase)) return null
  return {
    enabled: raw.enabled,
    phase: raw.phase as GreeterPhase,
    blocked_reason: str(raw.blocked_reason) ? raw.blocked_reason : null,
    last_greeted_at: str(raw.last_greeted_at) ? raw.last_greeted_at : null,
    greetings_today: num(raw.greetings_today) ? raw.greetings_today : 0,
    setting: readSetting(raw.setting),
  }
}

/** Whether the robot's bridge has a greeter at all (0.0.36 or newer). */
export function hasGreeter(robot: Pick<RobotState, 'greeter'>): boolean {
  return robot.greeter != null
}

// ── The status chip ──────────────────────────────────────────────────────────

/** The blocked reasons the spec names, each with its own words. Anything else
 * the robot says is shown as it came, rather than hidden. */
export const GREETER_BLOCK_REASONS = [
  'lying_down', 'mission_running', 'operator_control', 'estop', 'battery', 'no_detection', 'no_depth',
  'nav_goal', 'robot_unreachable', 'fallen', 'not_standing', 'feed_unavailable',
] as const
export type GreeterBlockReason = typeof GREETER_BLOCK_REASONS[number]

export interface GreeterChip {
  phase: GreeterPhase
  tone: Tone
  /** Watching shows a dot: it is the live, healthy state. */
  dot: boolean
  /** i18n key of the phase's word. */
  labelKey: `greeter.phase.${GreeterPhase}`
  /** Only while blocked: the reason's i18n key, or the robot's own text when
   * it is one this console does not know. */
  reason: { key: `greeter.reason.${GreeterBlockReason}` } | { raw: string } | null
}

const PHASE_TONE: Record<GreeterPhase, Tone> = {
  off: 'neutral', watching: 'green', greeting: 'accent', cooldown: 'neutral', blocked: 'amber',
}

export function greeterChip(status: GreeterStatus): GreeterChip {
  const phase = status.phase
  let reason: GreeterChip['reason'] = null
  if (phase === 'blocked' && status.blocked_reason) {
    const r = status.blocked_reason
    reason = (GREETER_BLOCK_REASONS as readonly string[]).includes(r)
      ? { key: `greeter.reason.${r as GreeterBlockReason}` }
      : { raw: r }
  }
  return { phase, tone: PHASE_TONE[phase], dot: phase === 'watching', labelKey: `greeter.phase.${phase}`, reason }
}

// ── Saved greetings ──────────────────────────────────────────────────────────

export interface SavedGreeting {
  id: string
  text: string
}

/** What a viewer starts with: two Korean, two English. */
export const DEFAULT_GREETINGS: readonly SavedGreeting[] = [
  { id: 'ko-hello', text: '안녕하세요, 로버허브입니다' },
  { id: 'ko-welcome', text: '어서 오세요, 반갑습니다!' },
  { id: 'en-hello', text: 'Hello, welcome!' },
  { id: 'en-roverhub', text: 'Hi there, I am a RoverHub robot.' },
]

/** The schema's TTS input is a clip, but a greeting this long is a speech. */
export const MAX_GREETING_CHARS = 200

export function isSavedGreetings(v: unknown): v is SavedGreeting[] {
  return Array.isArray(v) && v.every((g) => isObject(g) && str(g.id) && str(g.text) && g.text.length <= MAX_GREETING_CHARS)
}

/** Per viewer and per operator: two people sharing a browser keep their own. */
export function savedGreetingsKey(operatorId: string): string {
  return viewKey('greetings', operatorId)
}

/** The list with `text` added, unless it is empty or already there. */
export function addGreeting(list: readonly SavedGreeting[], text: string, now = Date.now()): SavedGreeting[] {
  const t = text.trim().slice(0, MAX_GREETING_CHARS)
  if (!t || list.some((g) => g.text === t)) return [...list]
  return [...list, { id: `g-${now}`, text: t }]
}

export function removeGreeting(list: readonly SavedGreeting[], id: string): SavedGreeting[] {
  return list.filter((g) => g.id !== id)
}

export function editGreeting(list: readonly SavedGreeting[], id: string, text: string): SavedGreeting[] {
  const t = text.trim().slice(0, MAX_GREETING_CHARS)
  if (!t) return [...list]
  return list.map((g) => (g.id === id ? { ...g, text: t } : g))
}

/** A command label's text: short, so the toast stays one line. */
export function greetingLabel(text: string): string {
  const t = text.trim()
  return t.length > 28 ? `${t.slice(0, 28)}...` : t
}

// ── The setting ──────────────────────────────────────────────────────────────

/** The robot's setting with every field filled from the schema's defaults:
 * what the settings form starts from. */
export function settingOf(status: GreeterStatus | null | undefined): GreeterSetting {
  const s = status?.setting
  return { ...DEFAULT_GREETER_SETTING, ...(s ?? {}), enabled: s?.enabled ?? status?.enabled ?? false } as GreeterSetting
}

type BoundedField = keyof typeof GREETER_BOUNDS

export function clampField(field: BoundedField, value: number): number {
  const { min, max } = GREETER_BOUNDS[field]
  if (!Number.isFinite(value)) return DEFAULT_GREETER_SETTING[field]
  return Math.min(max, Math.max(min, value))
}

/** The one SET_GREETER the panel sends: the whole setting, every field, each
 * bounded as the schema bounds it. `clipId` is the greeting made first. */
export function greeterParams(setting: GreeterSetting, clipId: string | null): Required<SetGreeterParams> {
  return {
    enabled: setting.enabled,
    clip_id: clipId,
    dance: setting.dance,
    trigger_distance_m: clampField('trigger_distance_m', setting.trigger_distance_m),
    facing_distance_m: clampField('facing_distance_m', setting.facing_distance_m),
    dance_min_distance_m: clampField('dance_min_distance_m', setting.dance_min_distance_m),
    cooldown_s: clampField('cooldown_s', setting.cooldown_s),
    min_battery_pct: Math.round(clampField('min_battery_pct', setting.min_battery_pct)),
  }
}
