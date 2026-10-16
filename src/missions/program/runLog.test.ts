import { describe, expect, it } from 'vitest'
import type { RunLogEntry } from './run'
import { addLogEntry, type LogLine } from './runLog'

const e = (blockId: string, result: RunLogEntry['result'], at = 0, extra: Partial<RunLogEntry> = {}): RunLogEntry =>
  ({ at, blockId, label: blockId, result, ...extra })

function fold(entries: RunLogEntry[]): LogLine[] {
  return entries.reduce<LogLine[]>((lines, x, i) => addLogEntry(lines, x, i), [])
}

describe('addLogEntry', () => {
  it('turns a start and its result into one row', () => {
    const lines = fold([e('a', 'started', 0), e('a', 'done', 900), e('b', 'started', 1000)])
    expect(lines.map((l) => [l.blockId, l.result, l.at])).toEqual([['a', 'done', 0], ['b', 'running', 1000]])
  })
  it('keeps a repeat open while its body runs, and repeats the body rows', () => {
    const lines = fold([
      e('r', 'started'), e('m', 'started'), e('m', 'done'), e('m', 'started'), e('m', 'done'), e('r', 'done'),
    ])
    expect(lines.map((l) => `${l.blockId}:${l.result}`)).toEqual(['r:done', 'm:done', 'm:done'])
  })
  it('records the reason a step ended the run, and adds a row for a step that never started', () => {
    const lines = fold([e('a', 'started'), e('a', 'failed', 5, { reason: 'commandFailed' }), e('b', 'skipped', 6, { reason: 'stopped' })])
    expect(lines.map((l) => [l.result, l.reason])).toEqual([['failed', 'commandFailed'], ['skipped', 'stopped']])
  })
})
