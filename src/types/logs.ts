/**
 * Mirrors shared/schemas/logs.py (schema 0.0.22). Hand-maintained -- change
 * both together; `src/missions/missionTasks.test.ts` reads that file and fails
 * on drift (skipped, with a warning, while the shared/ clone beside this repo
 * predates logs.py).
 *
 * The robot's own log, as Systems › Logs shows it. Two topics under
 * `roverhub/{site}/{robot}/`: `logs/request` (backend -> edge; the console asks
 * through POST /robots/{id}/logs/request, never on the broker) and `logs`
 * (edge -> backend and browser, QoS 0, not retained): the live stream
 * (`request_id` null) and the answers to requests (the last batch of an answer
 * has `done`). Nothing is stored in the cloud: history is the device's journal.
 */

export const LOG_SOURCES = ['bridge', 'nav'] as const
export type LogSource = typeof LOG_SOURCES[number]

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const
export type LogLevel = typeof LOG_LEVELS[number]

/** Mirrors `MAX_LOG_MESSAGE_CHARS`. */
export const MAX_LOG_MESSAGE_CHARS = 2000
/** Mirrors `MAX_LOG_BATCH_LINES`. */
export const MAX_LOG_BATCH_LINES = 200
/** Mirrors `MAX_LOG_HISTORY_HOURS`: how far back a request may reach. */
export const MAX_LOG_HISTORY_HOURS = 24
/** Mirrors `MAX_LOG_HISTORY_LINES`: lines in one answer, oldest dropped first. */
export const MAX_LOG_HISTORY_LINES = 5000

export interface LogLine {
  /** ISO 8601 with milliseconds and an offset, from the device's clock. */
  at: string
  source: LogSource
  level: LogLevel
  /** The Python logger, the ROS node, or "systemd"; null when unparsed. */
  logger?: string | null
  message: string
  /** How many identical consecutive lines this one stands for (>= 1). `at`
   * is the first of them and `last_at` the last. */
  repeat: number
  last_at?: string | null
}

export interface LogBatch {
  robot_id: string
  site_id: string
  /** null for the live stream; the request's id for an answer. */
  request_id?: string | null
  lines: LogLine[]
  /** The last batch of an answer. Always false on the live stream. */
  done: boolean
  /** The answer hit MAX_LOG_HISTORY_LINES and dropped its oldest lines. */
  truncated: boolean
  /** Set (on the done batch) when the device could not read its journal. */
  error?: string | null
}

export interface LogRequest {
  request_id: string
  since: string
  sources: LogSource[]
}

/** What the console asks for (POST /robots/{id}/logs/request). */
export interface RobotLogsQuery {
  /** 0 < sinceHours <= MAX_LOG_HISTORY_HOURS. */
  sinceHours: number
  /** Omitted means both. */
  sources?: LogSource[]
}

/** The backend's answer to that POST: the id the device's batches will carry. */
export interface RobotLogsTicket {
  requestId: string
  since: string
}
