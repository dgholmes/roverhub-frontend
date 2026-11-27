/**
 * The Greet button and Greeter mode (schema 0.0.36). Mirrors
 * shared/schemas/greeter.py; spec
 * docs/superpowers/specs/2026-11-26-greet-and-greeter-mode-design.md.
 *
 * Both are one routine on the robot: wave, say the greeting, optionally dance,
 * then stand again. The bridge is the safety authority; the console only
 * configures (SET_GREETER) and presses (GREET).
 */

/** The dances a greeting may end with: no airborne moves, and no dance0
 * (126 s). Groove is the default. */
export const GREET_DANCES = ['groove', 'gongxi', 'bounce', 'body_wave', 'hip_circle', 'head_circle'] as const
export type GreetDance = typeof GREET_DANCES[number]

/** GREET: do it now. */
export interface GreetParams {
  /** A stored speech clip (audio-clips); null = wave only. */
  clip_id?: string | null
  /** null = no dance. */
  dance?: GreetDance | null
  /** 1-10 s; the bridge's default is 3. */
  wave_seconds?: number
  /** 0-100; null = the robot's own level. */
  volume?: number | null
}

/** SET_GREETER: the whole setting, replacing the one on the robot, which
 * keeps it across a reboot (a restart never turns it on by itself). */
export interface SetGreeterParams {
  enabled: boolean
  /** The greeting; null = wave (and dance) without speech. */
  clip_id?: string | null
  dance?: GreetDance | null
  /** Someone walking past or up, within this. */
  trigger_distance_m?: number
  /** Someone standing and facing the robot, within this. */
  facing_distance_m?: number
  /** Anyone closer than this: wave and speak only, no dance. */
  dance_min_distance_m?: number
  /** The same person is not greeted again within this. */
  cooldown_s?: number
  min_battery_pct?: number
  /** Greet a person who waves at the robot (0.0.38). Absent from an older
   * robot's setting, which reads as true -- the schema's default. */
  greet_on_wave?: boolean
}

export const GREETER_PHASES = ['off', 'watching', 'greeting', 'cooldown', 'blocked'] as const
export type GreeterPhase = typeof GREETER_PHASES[number]

/** StateUpdate.greeter / RobotState.greeter. Absent (or null) from a bridge
 * older than 0.0.36, which has no greeter at all. */
export interface GreeterStatus {
  enabled: boolean
  phase: GreeterPhase
  /** Why it is not watching: "lying_down", "mission_running",
   * "operator_control", "estop", "battery", "no_detection", "no_depth"... */
  blocked_reason?: string | null
  /** ISO, UTC. */
  last_greeted_at?: string | null
  greetings_today: number
  /** The setting as the robot holds it. */
  setting?: SetGreeterParams | null
}

/** A setting with every field filled: what the console's form edits. */
export type GreeterSetting = Required<SetGreeterParams>

/** The schema's defaults (SetGreeterParams). */
export const DEFAULT_GREETER_SETTING: GreeterSetting = {
  enabled: false,
  clip_id: null,
  dance: 'groove',
  trigger_distance_m: 3.0,
  facing_distance_m: 4.0,
  dance_min_distance_m: 1.5,
  cooldown_s: 300,
  min_battery_pct: 30,
  greet_on_wave: true,
}

/** The schema's bounds (Field ge/le), so the form cannot send what the
 * backend would refuse. */
export const GREETER_BOUNDS = {
  trigger_distance_m: { min: 1.0, max: 6.0 },
  facing_distance_m: { min: 1.0, max: 6.0 },
  dance_min_distance_m: { min: 0.5, max: 5.0 },
  cooldown_s: { min: 30, max: 3600 },
  min_battery_pct: { min: 10, max: 100 },
} as const satisfies Record<string, { min: number; max: number }>

/** GreetParams.wave_seconds' bounds and default. */
export const GREET_WAVE_SECONDS = { min: 1.0, max: 10.0, default: 3.0 } as const
