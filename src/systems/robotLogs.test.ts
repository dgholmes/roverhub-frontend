import { describe, expect, it } from 'vitest'
import type { LogBatch, LogLine } from '@/types/logs'
import {
  DEFAULT_LOG_FILTER, FOLLOWING, INITIAL_LOGS_STATE, filterLogLines, followReducer, formatLogTime, logsReducer,
  mergeLogLines, parseLogBatch, parseLogLine, unseenCount, withDayDividers, type LogEntry, type LogFilter, type LogsState,
} from './robotLogs'

const T0 = Date.parse('2026-11-13T05:00:46.960Z')
const iso = (ms: number) => new Date(T0 + ms).toISOString()
const line = (ms: number, message: string, over: Partial<LogLine> = {}): LogLine =>
  ({ at: iso(ms), source: 'bridge', level: 'info', logger: 'robot_bridge.nav_goals', message, repeat: 1, last_at: null, ...over })
const messages = (xs: LogEntry[]) => xs.map((x) => x.message)
const batch = (over: Partial<LogBatch> = {}): LogBatch =>
  ({ robot_id: 'rover-jetson', site_id: 'site-dev', request_id: null, lines: [], done: false, truncated: false, error: null, ...over })

describe('mergeLogLines', () => {
  it('keeps one list sorted by time, oldest first, whatever order lines arrive in', () => {
    let list = mergeLogLines([], [line(2_000, 'b'), line(5_000, 'd')])
    list = mergeLogLines(list, [line(1_000, 'a'), line(3_000, 'c')])
    expect(messages(list)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('keeps arrival order between lines logged at the same instant', () => {
    const list = mergeLogLines([], [line(0, 'nav goal stopped'), line(0, 're-checking')])
    expect(messages(list)).toEqual(['nav goal stopped', 're-checking'])
  })

  it('is one line when history and the live stream both carry it (same at, source and message)', () => {
    const live = mergeLogLines([], [line(1_000, 'nav goal 2 accepted')])
    const both = mergeLogLines(live, [line(0, 'command received: NAV_GOTO'), line(1_000, 'nav goal 2 accepted')])
    expect(messages(both)).toEqual(['command received: NAV_GOTO', 'nav goal 2 accepted'])
  })

  it('tells lines apart by source and time, not by message alone', () => {
    const list = mergeLogLines([], [line(0, 'same'), line(0, 'same', { source: 'nav' }), line(10, 'same')])
    expect(list).toHaveLength(3)
  })

  it('keeps the larger fold when a folded line comes again', () => {
    const amcl = (repeat: number, last: number) => line(0, 'AMCL cannot publish a pose', { source: 'nav', level: 'warn', repeat, last_at: iso(last) })
    let list = mergeLogLines([], [amcl(400, 60_000)])
    list = mergeLogLines(list, [amcl(412, 90_000)])
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ repeat: 412, last_at: iso(90_000) })
    // An older copy never shrinks it.
    list = mergeLogLines(list, [amcl(3, 1_000)])
    expect(list[0].repeat).toBe(412)
  })

  it("adds the bridge's later fold row into the identical line before it (live)", () => {
    const amcl = (ms: number, over: Partial<LogLine> = {}) =>
      line(ms, 'AMCL cannot publish a pose', { source: 'nav', level: 'warn', logger: 'amcl', ...over })
    // Sent at once with repeat 1; a bridge line and another nav line follow.
    let list = mergeLogLines([], [amcl(0), line(500, 'command received: NAV_GOTO')], undefined, true)
    // The held repeats arrive later as one row, older than the bridge line already shown.
    list = mergeLogLines(list, [amcl(100, { repeat: 411, last_at: iso(60_000) })], undefined, true)
    expect(messages(list)).toEqual(['AMCL cannot publish a pose', 'command received: NAV_GOTO'])
    expect(list[0]).toMatchObject({ repeat: 412, last_at: iso(60_000), at: iso(0) })
    // History then carries the same line already folded: one row, the full count.
    list = mergeLogLines(list, [amcl(0, { repeat: 412, last_at: iso(60_000) })])
    expect(list).toHaveLength(2)
    expect(list[0].repeat).toBe(412)
  })

  it('shows a fold row by itself when the line before it from that source differs', () => {
    let list = mergeLogLines([], [line(0, 'a', { source: 'nav' }), line(50, 'b', { source: 'nav' })], undefined, true)
    list = mergeLogLines(list, [line(100, 'a', { source: 'nav', repeat: 3, last_at: iso(200) })], undefined, true)
    expect(list.map((e) => [e.message, e.repeat])).toEqual([['a', 1], ['b', 1], ['a', 3]])
    // Not live (history), a repeat row is never summed into another.
    const history = mergeLogLines([], [line(0, 'x'), line(100, 'x', { repeat: 4 })])
    expect(history.map((e) => e.repeat)).toEqual([1, 4])
  })

  it('returns the same array when nothing changed, so React can skip the render', () => {
    const list = mergeLogLines([], [line(0, 'a')])
    expect(mergeLogLines(list, [])).toBe(list)
    expect(mergeLogLines(list, [line(0, 'a')])).toBe(list)
  })

  it('holds at most the cap, dropping the oldest', () => {
    const many = Array.from({ length: 30 }, (_, i) => line(i * 1_000, `line ${i}`))
    const list = mergeLogLines([], many, 10)
    expect(list).toHaveLength(10)
    expect(list[0].message).toBe('line 20')
    expect(list[9].message).toBe('line 29')
    // A line older than everything kept goes straight out again.
    expect(messages(mergeLogLines(list, [line(-5_000, 'ancient')], 10))).not.toContain('ancient')
  })

  it('holds 10,000 lines by default', () => {
    const many = Array.from({ length: 10_050 }, (_, i) => line(i, `l${i}`))
    const list = mergeLogLines([], many)
    expect(list).toHaveLength(10_000)
    expect(list[0].message).toBe('l50')
  })
})

describe('parsing the wire', () => {
  it('drops malformed lines and keeps the rest', () => {
    const b = parseLogBatch({
      robot_id: 'rover-jetson', site_id: 'site-dev', request_id: 'abc', done: true, truncated: true,
      lines: [line(0, 'ok'), { ...line(0, 'bad time'), at: 'yesterday' }, { ...line(0, 'bad level'), level: 'fatal' }, { at: iso(0) }, null],
    })
    expect(b).toMatchObject({ request_id: 'abc', done: true, truncated: true, error: null })
    expect(b!.lines.map((l) => l.message)).toEqual(['ok'])
  })

  it('reads a missing repeat as 1 and a blank request id as the live stream', () => {
    expect(parseLogLine({ at: iso(0), source: 'nav', level: 'warn', message: 'x' })).toMatchObject({ repeat: 1, logger: null })
    expect(parseLogBatch({ robot_id: 'r', lines: [], request_id: '' })!.request_id).toBeNull()
  })

  it('refuses something that is not a batch', () => {
    expect(parseLogBatch({ robot_id: 'r' })).toBeNull()
    expect(parseLogBatch('nope')).toBeNull()
  })
})

describe('filterLogLines', () => {
  const list = mergeLogLines([], [
    line(0, 'command received: NAV_GOTO', { logger: 'robot_bridge.command_sender' }),
    line(1, 'nav stopped: localization_lost', { level: 'warn' }),
    line(2, 'Traceback (most recent call last):', { level: 'error', logger: 'robot_bridge.robot_link' }),
    line(3, 'AMCL cannot publish a pose', { source: 'nav', level: 'warn', logger: 'amcl' }),
    line(4, 'debug detail', { level: 'debug' }),
  ])
  const f = (over: Partial<LogFilter>) => messages(filterLogLines(list, { ...DEFAULT_LOG_FILTER, ...over }))

  it('shows the bridge and hides Nav2 by default', () => {
    expect(f({})).not.toContain('AMCL cannot publish a pose')
    expect(f({})).toHaveLength(4)
    expect(f({ sources: { bridge: true, nav: true } })).toContain('AMCL cannot publish a pose')
    expect(f({ sources: { bridge: false, nav: true } })).toEqual(['AMCL cannot publish a pose'])
  })

  it('filters by level, with debug riding on Info', () => {
    expect(f({ levels: { info: false, warn: true, error: true } })).toEqual(['nav stopped: localization_lost', 'Traceback (most recent call last):'])
    expect(f({ levels: { info: false, warn: false, error: true } })).toEqual(['Traceback (most recent call last):'])
    expect(f({ levels: { info: true, warn: false, error: false } })).toEqual(['command received: NAV_GOTO', 'debug detail'])
  })

  it('searches message and logger, ignoring case and surrounding spaces', () => {
    expect(f({ query: '  nav_goto ' })).toEqual(['command received: NAV_GOTO'])
    expect(f({ query: 'ROBOT_LINK' })).toEqual(['Traceback (most recent call last):'])
    expect(f({ query: 'amcl' })).toEqual([]) // Nav2 is off
    expect(f({ query: 'amcl', sources: { bridge: true, nav: true } })).toEqual(['AMCL cannot publish a pose'])
  })
})

describe('follow live', () => {
  const visible = mergeLogLines([], [line(0, 'a'), line(1_000, 'b'), line(2_000, 'c')])

  it('follows until the operator scrolls up, then counts what arrives after', () => {
    let s = FOLLOWING
    expect(unseenCount(visible, s)).toBe(0)
    s = followReducer(s, { type: 'scrolled', atBottom: false, newestT: visible[2].t })
    expect(s.following).toBe(false)
    expect(unseenCount(visible, s)).toBe(0)
    const more = mergeLogLines(visible, [line(3_000, 'd'), line(4_000, 'e'), line(500, 'older history')])
    expect(unseenCount(more, s)).toBe(2) // history filled in above does not count as new
    // More scrolling up keeps the original mark.
    expect(followReducer(s, { type: 'scrolled', atBottom: false, newestT: more[more.length - 1].t })).toBe(s)
  })

  it('follows again when the operator reaches the bottom or jumps', () => {
    const away = followReducer(FOLLOWING, { type: 'scrolled', atBottom: false, newestT: 0 })
    expect(followReducer(away, { type: 'scrolled', atBottom: true, newestT: 0 })).toEqual(FOLLOWING)
    expect(followReducer(away, { type: 'jump' })).toEqual(FOLLOWING)
    expect(followReducer(FOLLOWING, { type: 'scrolled', atBottom: true, newestT: 0 })).toBe(FOLLOWING)
  })
})

describe('the request', () => {
  const run = (...events: Parameters<typeof logsReducer>[1][]): LogsState => events.reduce(logsReducer, INITIAL_LOGS_STATE)

  it('loads, receives, and is ready on the done batch', () => {
    let s = run({ type: 'ticket', requestId: 'r1' })
    expect(s.phase.kind).toBe('loading')
    s = logsReducer(s, { type: 'batch', batch: batch({ request_id: 'r1', lines: [line(0, 'a')] }) })
    expect(s.phase.kind).toBe('receiving')
    s = logsReducer(s, { type: 'batch', batch: batch({ request_id: 'r1', lines: [line(1, 'b')], done: true }) })
    expect(s.phase.kind).toBe('ready')
    expect(messages(s.lines)).toEqual(['a', 'b'])
  })

  it('merges live lines at any time and ignores other consoles\' answers', () => {
    const s = run(
      { type: 'batch', batch: batch({ lines: [line(5, 'live')] }) },
      { type: 'ticket', requestId: 'r1' },
      { type: 'batch', batch: batch({ request_id: 'someone-else', lines: [line(1, 'theirs')], done: true }) },
    )
    expect(messages(s.lines)).toEqual(['live'])
    expect(s.phase.kind).toBe('loading')
  })

  it('keeps an answer that arrives before the POST reply, and drops the rest when the reply names another', () => {
    const s = run(
      { type: 'batch', batch: batch({ request_id: 'r1', lines: [line(0, 'early')] }) },
      { type: 'batch', batch: batch({ request_id: 'other', lines: [line(0, 'not ours')] }) },
      { type: 'batch', batch: batch({ request_id: 'r1', lines: [], done: true }) },
      { type: 'ticket', requestId: 'r1' },
    )
    expect(messages(s.lines)).toEqual(['early'])
    expect(s.phase.kind).toBe('ready')
    expect(s.early).toEqual([])
  })

  it('reads silence before any answer as no answer, and a stalled answer as complete', () => {
    expect(run({ type: 'ticket', requestId: 'r1' }, { type: 'timeout' }).phase.kind).toBe('noAnswer')
    expect(run(
      { type: 'ticket', requestId: 'r1' },
      { type: 'batch', batch: batch({ request_id: 'r1', lines: [line(0, 'a')] }) },
      { type: 'timeout' },
    ).phase.kind).toBe('ready')
    // A late answer still lands.
    const late = run({ type: 'ticket', requestId: 'r1' }, { type: 'timeout' },
      { type: 'batch', batch: batch({ request_id: 'r1', lines: [line(0, 'late')], done: true }) })
    expect(late.phase.kind).toBe('ready')
  })

  it('says the robot is offline on 409, and anything else as a failed request', () => {
    expect(run({ type: 'refused', status: 409, detail: 'rover-jetson is offline, so its log can\'t be read' }).phase)
      .toEqual({ kind: 'offline', detail: 'rover-jetson is offline, so its log can\'t be read' })
    expect(run({ type: 'refused', status: 503, detail: 'could not send the log request to the broker (rc=4); the robot was not asked' }).phase)
      .toEqual({ kind: 'requestFailed', detail: 'could not send the log request to the broker (rc=4); the robot was not asked' })
  })

  it('carries the device\'s error and the truncated flag', () => {
    const s = run({ type: 'ticket', requestId: 'r1' },
      { type: 'batch', batch: batch({ request_id: 'r1', lines: [line(0, 'a')], truncated: true }) },
      { type: 'batch', batch: batch({ request_id: 'r1', done: true, error: 'journalctl: permission denied' }) })
    expect(s.phase).toEqual({ kind: 'deviceError', error: 'journalctl: permission denied' })
    expect(s.truncated).toBe(true)
  })

  it('starts over on reset', () => {
    const s = run({ type: 'batch', batch: batch({ lines: [line(0, 'a')] }) }, { type: 'reset' })
    expect(s).toEqual(INITIAL_LOGS_STATE)
  })
})

describe('display', () => {
  it('shows local time to the hundredth, with leading zeros', () => {
    const t = new Date(2026, 10, 13, 4, 5, 6, 789).getTime()
    expect(formatLogTime(t)).toBe('04:05:06.78')
  })

  it('puts a date row where the day changes, and before the first line only when it is not today', () => {
    const at = (d: number, h: number) => new Date(2026, 10, d, h).getTime()
    const entries = mergeLogLines([], [
      { ...line(0, 'yesterday'), at: new Date(at(12, 23)).toISOString() },
      { ...line(0, 'today'), at: new Date(at(13, 1)).toISOString() },
    ])
    const rows = withDayDividers(entries, at(13, 9))
    expect(rows.map((r) => r.kind)).toEqual(['day', 'line', 'day', 'line'])
    expect(withDayDividers(entries.slice(1), at(13, 9)).map((r) => r.kind)).toEqual(['line'])
  })
})
