import { describe, expect, it } from 'vitest'
import type { RunLogEntry } from './runReasons'
import { addLogEntry, type RunLogLine } from './runLog'

const e = (blockId: string, result: RunLogEntry['result'], at = 0, extra: Partial<RunLogEntry> = {}): RunLogEntry =>
  ({ at, blockId, label: blockId, result, ...extra })

function fold(entries: RunLogEntry[]): RunLogLine[] {
  return entries.reduce<RunLogLine[]>((lines, x, i) => addLogEntry(lines, x, i), [])
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
  it('fills a failed step in, and adds a row for a step that never started', () => {
    const lines = fold([e('a', 'started'), e('a', 'failed', 5), e('b', 'skipped', 6)])
    expect(lines.map((l) => [l.blockId, l.result])).toEqual([['a', 'failed'], ['b', 'skipped']])
  })
})
