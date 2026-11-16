import { LOG_LEVELS, LOG_SOURCES, MAX_LOG_MESSAGE_CHARS, type LogBatch, type LogLevel, type LogLine, type LogSource } from '@/types/logs'

/**
 * Systems › Logs, the parts with no React in them: one list made of the
 * robot's history and its live lines, the filters over it, the follow-live
 * rule, and the request's progress. useRobotLogs drives these; tests drive
 * them directly.
 */

/** Lines held in memory per robot view. The oldest go first. */
export const LOG_BUFFER_CAP = 10_000
/** How long a request may go without a batch before the console stops
 * waiting: no batch at all reads as "no answer", a stalled answer as done. */
export const LOG_ANSWER_TIMEOUT_MS = 10_000
/** The ranges the page offers, in hours. */
export const LOG_RANGES = [1, 6, 24] as const
export type LogRange = typeof LOG_RANGES[number]

/** A line as the page holds it: parsed time, its identity, arrival order. */
export interface LogEntry extends LogLine {
  /** `at` in epoch milliseconds. */
  t: number
  /** at + source + message: the same line from history and from the live
   * stream is one line. */
  key: string
  /** Arrival order, which breaks ties between lines logged in the same ms. */
  seq: number
}

let nextSeq = 0

export function logKey(line: Pick<LogLine, 'at' | 'source' | 'message'>): string {
  return `${line.at}\u0000${line.source}\u0000${line.message}`
}

const SOURCES = new Set<string>(LOG_SOURCES)
const LEVELS = new Set<string>(LOG_LEVELS)

/** A wire line, checked: anything malformed is dropped rather than shown as
 * a row of blanks. Unknown extra fields are ignored. */
export function parseLogLine(raw: unknown): LogLine | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.at !== 'string' || !Number.isFinite(Date.parse(r.at))) return null
  if (typeof r.source !== 'string' || !SOURCES.has(r.source)) return null
  if (typeof r.level !== 'string' || !LEVELS.has(r.level)) return null
  if (typeof r.message !== 'string') return null
  const repeat = typeof r.repeat === 'number' && Number.isFinite(r.repeat) && r.repeat >= 1 ? Math.floor(r.repeat) : 1
  return {
    at: r.at,
    source: r.source as LogSource,
    level: r.level as LogLevel,
    logger: typeof r.logger === 'string' ? r.logger : null,
    message: r.message.slice(0, MAX_LOG_MESSAGE_CHARS),
    repeat,
    last_at: typeof r.last_at === 'string' && Number.isFinite(Date.parse(r.last_at)) ? r.last_at : null,
  }
}

/** A wire batch, checked; null when it is not one. */
export function parseLogBatch(raw: unknown): LogBatch | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.robot_id !== 'string' || !Array.isArray(r.lines)) return null
  return {
    robot_id: r.robot_id,
    site_id: typeof r.site_id === 'string' ? r.site_id : '',
    request_id: typeof r.request_id === 'string' && r.request_id ? r.request_id : null,
    lines: r.lines.map(parseLogLine).filter((l): l is LogLine => l !== null),
    done: r.done === true,
    truncated: r.truncated === true,
    error: typeof r.error === 'string' && r.error.trim() ? r.error : null,
  }
}

function lastTime(e: { last_at?: string | null }): number {
  return e.last_at ? Date.parse(e.last_at) : Number.NEGATIVE_INFINITY
}

/**
 * `existing` with `incoming` merged in: sorted by time (oldest first), one
 * entry per at+source+message, at most `cap` entries (the oldest dropped).
 *
 * A line seen twice is kept once, with the larger fold: history and the live
 * stream overlap by about a second, and history may carry a line the live
 * stream already showed (already folded, with its full count).
 *
 * `live` is how the bridge folds as it goes: it sends a line at once with
 * repeat 1, holds the identical lines after it, and later sends them as one
 * extra row with repeat > 1 whose at/last_at cover only the held ones. Such a
 * row is added into the line before it from the same source when that line is
 * identical (level, logger, message) -- counts summed, its last_at taken --
 * rather than shown as a second row. Its `at` can be older than lines already
 * shown, so the line before it is found by time, not by position.
 *
 * Returns `existing` itself when nothing changed, so React can skip the render.
 */
export function mergeLogLines(existing: LogEntry[], incoming: LogLine[], cap = LOG_BUFFER_CAP, live = false): LogEntry[] {
  if (incoming.length === 0) return existing
  let index: Map<string, number> | null = null
  let out: LogEntry[] | null = null
  let unsorted = false
  const sortOut = (list: LogEntry[]) => {
    list.sort((a, b) => a.t - b.t || a.seq - b.seq)
    index = new Map(list.map((e, i) => [e.key, i]))
    unsorted = false
  }
  for (const line of incoming) {
    const t = Date.parse(line.at)
    if (!Number.isFinite(t)) continue
    const key = logKey(line)
    if (!index) index = new Map(existing.map((e, i) => [e.key, i]))
    const at: number | undefined = index.get(key)
    const list: LogEntry[] = out ?? existing
    if (at !== undefined) {
      const held = list[at]
      if (line.repeat > held.repeat || (line.repeat === held.repeat && lastTime(line) > lastTime(held))) {
        if (!out) out = existing.slice()
        out[at] = { ...held, repeat: line.repeat, last_at: line.last_at ?? held.last_at ?? null, logger: line.logger ?? held.logger ?? null, level: line.level }
      }
      continue
    }
    if (live && line.repeat > 1) {
      if (unsorted && out) sortOut(out)
      let i = list.length - 1
      while (i >= 0 && (list[i].t > t || list[i].source !== line.source)) i--
      const before = i >= 0 ? list[i] : null
      if (before && before.level === line.level && (before.logger ?? null) === (line.logger ?? null) && before.message === line.message) {
        if (!out) out = existing.slice()
        out[i] = { ...before, repeat: before.repeat + line.repeat, last_at: line.last_at ?? line.at }
        continue
      }
    }
    if (!out) out = existing.slice()
    const last = out[out.length - 1]
    if (last && t < last.t) unsorted = true
    index!.set(key, out.length)
    out.push({ ...line, t, key, seq: nextSeq++ })
  }
  if (!out) return existing
  if (unsorted) out.sort((a, b) => a.t - b.t || a.seq - b.seq)
  return out.length > cap ? out.slice(out.length - cap) : out
}

// --- Filters ---------------------------------------------------------------

/** The three level chips. Debug lines (the device sends none today) ride
 * with Info rather than vanishing. */
export type LevelChip = 'info' | 'warn' | 'error'
export const LEVEL_CHIPS: LevelChip[] = ['info', 'warn', 'error']
export function levelChip(level: LogLevel): LevelChip {
  return level === 'debug' ? 'info' : level
}

export interface LogFilter {
  sources: Record<LogSource, boolean>
  levels: Record<LevelChip, boolean>
  /** Case-insensitive, over the message and the logger. Blank matches all. */
  query: string
}

/** Bridge on, Nav2 off (its warnings are thousands an hour on a bad day),
 * every level on, no search. */
export const DEFAULT_LOG_FILTER: LogFilter = {
  sources: { bridge: true, nav: false },
  levels: { info: true, warn: true, error: true },
  query: '',
}

export function filterLogLines(lines: LogEntry[], filter: LogFilter): LogEntry[] {
  const q = filter.query.trim().toLowerCase()
  return lines.filter((l) =>
    filter.sources[l.source]
    && filter.levels[levelChip(l.level)]
    && (!q || l.message.toLowerCase().includes(q) || (l.logger ?? '').toLowerCase().includes(q)))
}

// --- Follow live -----------------------------------------------------------

/** Following: the list keeps the newest line in view. Not following: the
 * operator scrolled up; `anchorT` is the newest line they had when they did,
 * and anything after it is "new". */
export type FollowState = { following: true } | { following: false; anchorT: number }

export type FollowEvent =
  | { type: 'scrolled'; atBottom: boolean; newestT: number | null }
  | { type: 'jump' }

export const FOLLOWING: FollowState = { following: true }

export function followReducer(state: FollowState, event: FollowEvent): FollowState {
  if (event.type === 'jump') return FOLLOWING
  if (event.atBottom) return state.following ? state : FOLLOWING
  if (!state.following) return state
  return { following: false, anchorT: event.newestT ?? Number.NEGATIVE_INFINITY }
}

/** Lines in `visible` (sorted) newer than the operator has seen. */
export function unseenCount(visible: LogEntry[], state: FollowState): number {
  if (state.following) return 0
  let n = 0
  for (let i = visible.length - 1; i >= 0 && visible[i].t > state.anchorT; i--) n++
  return n
}

// --- The request -----------------------------------------------------------

export type LogsPhase =
  /** Asked; nothing back yet. */
  | { kind: 'loading' }
  /** The answer is arriving. */
  | { kind: 'receiving' }
  /** The answer is complete (or stalled, and treated as complete). */
  | { kind: 'ready' }
  /** The backend refused: the robot is not online (409). */
  | { kind: 'offline'; detail: string | null }
  /** The request could not be made, or the backend refused it otherwise. */
  | { kind: 'requestFailed'; detail: string }
  /** The request went out and the robot never answered. */
  | { kind: 'noAnswer' }
  /** The robot answered that it could not read its journal. */
  | { kind: 'deviceError'; error: string }

export interface LogsState {
  lines: LogEntry[]
  /** The request this view is waiting on; null while its POST is in flight. */
  requestId: string | null
  phase: LogsPhase
  truncated: boolean
  /** Answer batches that arrived before the POST said which id is ours. */
  early: LogBatch[]
}

export type LogsEvent =
  | { type: 'reset' }
  | { type: 'ticket'; requestId: string }
  | { type: 'refused'; status: number | null; detail: string }
  | { type: 'batch'; batch: LogBatch }
  | { type: 'timeout' }

export const INITIAL_LOGS_STATE: LogsState = { lines: [], requestId: null, phase: { kind: 'loading' }, truncated: false, early: [] }

/** Early answer batches kept while the POST is in flight (a whole answer is
 * at most 25 batches). */
const EARLY_MAX = 60

function applyAnswer(state: LogsState, batch: LogBatch): LogsState {
  const lines = mergeLogLines(state.lines, batch.lines)
  const truncated = state.truncated || batch.truncated
  const phase: LogsPhase = !batch.done ? { kind: 'receiving' }
    : batch.error ? { kind: 'deviceError', error: batch.error }
    : { kind: 'ready' }
  return { ...state, lines, truncated, phase }
}

export function logsReducer(state: LogsState, event: LogsEvent): LogsState {
  switch (event.type) {
    case 'reset':
      return INITIAL_LOGS_STATE
    case 'ticket': {
      let next: LogsState = { ...state, requestId: event.requestId, early: [] }
      for (const b of state.early) if (b.request_id === event.requestId) next = applyAnswer(next, b)
      return next
    }
    case 'refused':
      return {
        ...state, early: [],
        phase: event.status === 409 ? { kind: 'offline', detail: event.detail || null } : { kind: 'requestFailed', detail: event.detail },
      }
    case 'timeout':
      if (state.phase.kind === 'loading') return { ...state, phase: { kind: 'noAnswer' } }
      if (state.phase.kind === 'receiving') return { ...state, phase: { kind: 'ready' } }
      return state
    case 'batch': {
      const b = event.batch
      if (!b.request_id) {
        const lines = mergeLogLines(state.lines, b.lines, LOG_BUFFER_CAP, true)
        return lines === state.lines ? state : { ...state, lines }
      }
      if (state.requestId === null) {
        // Ours, possibly, if the robot answered before the backend's reply
        // reached us. Kept until the ticket says.
        if (state.phase.kind !== 'loading') return state
        return { ...state, early: [...state.early, b].slice(-EARLY_MAX) }
      }
      if (b.request_id !== state.requestId) return state // another console's request
      return applyAnswer(state, b)
    }
  }
}

/** Whether the request is still waiting on the robot (the timer runs). */
export function isWaiting(phase: LogsPhase): boolean {
  return phase.kind === 'loading' || phase.kind === 'receiving'
}

// --- Display ---------------------------------------------------------------

const pad = (n: number, w = 2) => String(n).padStart(w, '0')

/** HH:MM:SS.cc in the viewer's local time. */
export function formatLogTime(t: number): string {
  const d = new Date(t)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(Math.floor(d.getMilliseconds() / 10))}`
}

/** The viewer's local calendar day, as a comparable key. */
export function localDayKey(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export type LogRow =
  | { kind: 'day'; key: string; t: number }
  | { kind: 'line'; entry: LogEntry }

/** The visible lines with a date row wherever the day changes, and before the
 * first line when that is not today. */
export function withDayDividers(lines: LogEntry[], now: number = Date.now()): LogRow[] {
  const rows: LogRow[] = []
  const today = localDayKey(now)
  let day: string | null = null
  for (const entry of lines) {
    const k = localDayKey(entry.t)
    if (k !== day && (day !== null || k !== today)) rows.push({ kind: 'day', key: `day-${k}`, t: entry.t })
    day = k
    rows.push({ kind: 'line', entry })
  }
  return rows
}
