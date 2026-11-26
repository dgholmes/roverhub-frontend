import { describe, expect, it } from 'vitest'
import { initialRobots } from '@/mocks/mockRobots'
import type { TaskBarButton, TaskBarModel, TaskBarSlot } from '@/liveops/taskBar'
import type { RobotState } from '@/types'
import { deckEntries, type DeckEntry } from './commandDeck'
import { deckSignature, droppableCount, lastRung, pinnedKeys, splitDeck } from './deckFit'

/**
 * The ladder the touch dock walks down until its control row fits.
 *
 * It is tested against the real `deckEntries` rather than invented entries:
 * what matters is which of the controls the console actually declares come off
 * the row first, and in what order.
 */

const robot = (over: Partial<RobotState> = {}): RobotState => ({ ...initialRobots[1], ...over })

const model = (buttons: TaskBarButton[], slot: TaskBarSlot = 'none'): TaskBarModel => ({
  slot, title: '', tag: null, tagTone: 'neutral', detail: null, progress: null, buttons,
})

const idle = model(['takeControl'])
const wide = (r = robot()) => deckEntries(idle, r, 'wide')
const narrow = (r = robot()) => deckEntries(idle, r, 'narrow')
const pinned = (r = robot()) => pinnedKeys(narrow(r))
const keys = (entries: DeckEntry[]) => entries.map((e) => e.key)

/** The row at every rung, from the whole wide set down to the narrow one. */
const ladder = (r = robot()) => {
  const w = wide(r), n = narrow(r), p = pinned(r)
  const rungs: string[][] = []
  for (let i = 0; i <= lastRung(w, p); i += 1) rungs.push(keys(splitDeck(w, n, p, i).row))
  return rungs
}

describe('pinnedKeys', () => {
  it('is what a phone keeps: the control toggle and a posture button', () => {
    // Not a list restated here -- the phone set is `deckEntries`' own answer at
    // `narrow`, and this reads it back so the two cannot drift.
    expect([...pinned()]).toEqual(keys(narrow().filter((e) => e.tier === 'primary')))
    expect([...pinned()]).toContain('control')
    expect([...pinned()]).toContain('posture')
  })
})

describe('splitDeck', () => {
  it('rung 0 is the wide set whole, with nothing given up', () => {
    const w = wide(), n = narrow(), p = pinned()
    const { row, more } = splitDeck(w, n, p, 0)
    expect(keys(row)).toEqual(keys(w.filter((e) => e.tier === 'primary')))
    expect(keys(more)).toEqual(keys(w.filter((e) => e.tier === 'overflow')))
  })

  it('gives up one control per rung, from the end of the row', () => {
    const rungs = ladder()
    // Each rung is the one above it minus exactly one control...
    for (let i = 1; i < rungs.length - 1; i += 1) {
      expect(rungs[i].length, `rung ${i}`).toBe(rungs[i - 1].length - 1)
      // ...and it is one the rung above had, never a new one.
      expect(rungs[i - 1]).toEqual(expect.arrayContaining(rungs[i]))
    }
  })

  it('gives up the last control first, because that is the one reached for least', () => {
    const w = wide(), n = narrow(), p = pinned()
    const full = keys(splitDeck(w, n, p, 0).row)
    const one = keys(splitDeck(w, n, p, 1).row)
    // Speak is declared last, so it is the first to go.
    expect(full[full.length - 1]).toBe('speak')
    expect(one).not.toContain('speak')
    expect(one[one.length - 1]).toBe('led')
  })

  it('never gives up a pinned control, however far down the ladder', () => {
    const w = wide(), n = narrow(), p = pinned()
    for (let i = 0; i <= droppableCount(w, p); i += 1) {
      for (const key of p) {
        expect(keys(splitDeck(w, n, p, i).row), `rung ${i} dropped ${key}`).toContain(key)
      }
    }
  })

  it('keeps the declaration order on the row and in the menu', () => {
    const w = wide(), n = narrow(), p = pinned()
    const order = keys(w)
    for (let i = 0; i <= droppableCount(w, p); i += 1) {
      const { row, more } = splitDeck(w, n, p, i)
      for (const list of [keys(row), keys(more)]) {
        const positions = list.map((k) => order.indexOf(k))
        expect([...positions].sort((a, b) => a - b), `rung ${i}`).toEqual(positions)
      }
      // Every control is in exactly one of the two, always.
      expect([...keys(row), ...keys(more)].sort()).toEqual([...order].sort())
    }
  })

  it('falls back to the phone set past the last control it can give up', () => {
    const w = wide(), n = narrow(), p = pinned()
    const floor = splitDeck(w, n, p, lastRung(w, p))
    expect(keys(floor.row)).toEqual(keys(n.filter((e) => e.tier === 'primary')))
    // The posture slot splits there: the row keeps the one button the robot's
    // own posture calls for and the rest go to the menu. That is the whole
    // point of the last rung -- it is not just one more control given up.
    const rowPosture = floor.row.find((e) => e.key === 'posture')
    const widePosture = w.find((e) => e.key === 'posture')
    expect(widePosture?.postureActions?.length).toBeGreaterThan(1)
    expect(rowPosture?.postureActions).toHaveLength(1)
    expect(keys(floor.more)).toContain('posture-more')
  })

  it('stays at the phone set below the last rung rather than emptying the row', () => {
    const w = wide(), n = narrow(), p = pinned()
    const floor = keys(splitDeck(w, n, p, lastRung(w, p)).row)
    expect(keys(splitDeck(w, n, p, lastRung(w, p) + 5).row)).toEqual(floor)
    expect(floor.length).toBeGreaterThan(0)
  })

  it('ends up at the phone set the deck already declared, one rung at a time', () => {
    // The ladder's two ends are the console's two existing answers: nothing is
    // invented in between, only taken away in order.
    const rungs = ladder()
    expect(rungs[0]).toEqual(keys(wide().filter((e) => e.tier === 'primary')))
    expect(rungs[rungs.length - 1]).toEqual(keys(narrow().filter((e) => e.tier === 'primary')))
  })
})

describe('deckSignature', () => {
  it('changes when the controls change', () => {
    const idleDeck = deckSignature(deckEntries(idle, robot(), 'wide'))
    const running = deckSignature(deckEntries(model(['takeControl', 'stopMission'], 'running'), robot(), 'wide'))
    expect(running).not.toBe(idleDeck)
  })

  it('changes when the posture slot does, because that is a control appearing', () => {
    const down = deckSignature(deckEntries(idle, robot({ sdk_state: 'stand_down', posture: 'upright' }), 'wide'))
    const up = deckSignature(deckEntries(idle, robot({ sdk_state: 'balance_stand', posture: 'upright' }), 'wide'))
    expect(down).not.toBe(up)
  })

  it('is the same deck whatever the labels say', () => {
    // Avoidance on and off are different widths and the same control. Re-fitting
    // on that would move a control under a thumb already reaching for it, which
    // is the rule this signature exists to keep.
    const a = deckSignature(deckEntries(idle, robot({ obstacle_avoidance: true }), 'wide'))
    const b = deckSignature(deckEntries(idle, robot({ obstacle_avoidance: false }), 'wide'))
    expect(a).toBe(b)
  })
})
