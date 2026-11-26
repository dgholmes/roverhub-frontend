import type { DeckEntry } from './commandDeck'

/**
 * Fit the deck's controls to the row it actually has.
 *
 * `deckEntries` declares which controls exist and, given `wide` or `narrow`,
 * which of them a row keeps. Two sets cannot serve the three rows a handheld
 * has: measured on 2026-11-26, the wide set needs 739 px and the row is 909 in
 * tablet landscape, 626 on a phone in landscape and 518 in tablet portrait. So
 * the wide set fitted exactly one of them, the scroller absorbed the rest in
 * silence, and the operator saw a control sliced down the middle with a working
 * "More" button beside it.
 *
 * This module turns the two sets into one ladder. The row starts as the wide
 * set; `dropped` controls come off its end, in reverse declaration order, and
 * join the menu; past the last droppable one the deck falls back to the narrow
 * set, where the posture slot shows one button instead of three. The shell
 * measures and walks the ladder down until the row fits.
 *
 * ⚠️ **Which rung the deck is on is a function of the row's width, not of what
 * the labels happen to say.** Avoidance on and Avoidance off are different
 * widths; so are Switch to X-shape and Switch to normal. Re-fitting on those
 * would move controls under a thumb that is already reaching for one, which is
 * the deck's own standing rule against. The shell re-fits on a width change and
 * on the set of controls changing, and lets the scroller and its fade carry any
 * few pixels a label adds in between.
 */

/** What the row keeps at every width: the phone set's own primaries. */
export function pinnedKeys(narrowEntries: readonly DeckEntry[]): Set<string> {
  return new Set(narrowEntries.filter((e) => e.tier === 'primary').map((e) => e.key))
}

/** How many of a wide row's controls may be given up before the fallback. */
export function droppableCount(wideEntries: readonly DeckEntry[], pinned: ReadonlySet<string>): number {
  return wideEntries.filter((e) => e.tier === 'primary' && !pinned.has(e.key)).length
}

/** The last rung: past this, the row is the narrow set and cannot shrink. */
export function lastRung(wideEntries: readonly DeckEntry[], pinned: ReadonlySet<string>): number {
  return droppableCount(wideEntries, pinned) + 1
}

export interface DeckSplit {
  /** What the row draws, in declaration order. */
  row: DeckEntry[]
  /** What the "..." menu draws, in declaration order. */
  more: DeckEntry[]
}

/**
 * The row and the menu at rung `dropped`.
 *
 * Rung 0 is the wide set whole. Each rung takes one more droppable control off
 * the row's end — the end, because the declaration order is the order an
 * operator reaches for them, so the last is the one they miss least. Any rung
 * past the last droppable one is the narrow set, posture split and all.
 */
export function splitDeck(
  wideEntries: readonly DeckEntry[],
  narrowEntries: readonly DeckEntry[],
  pinned: ReadonlySet<string>,
  dropped: number,
): DeckSplit {
  if (dropped > droppableCount(wideEntries, pinned)) {
    return {
      row: narrowEntries.filter((e) => e.tier === 'primary'),
      more: narrowEntries.filter((e) => e.tier !== 'primary'),
    }
  }

  let toDrop = Math.max(0, dropped)
  const row: DeckEntry[] = []
  const droppedKeys = new Set<string>()
  for (let i = wideEntries.length - 1; i >= 0; i -= 1) {
    const e = wideEntries[i]
    if (e.tier !== 'primary') continue
    if (toDrop > 0 && !pinned.has(e.key)) {
      toDrop -= 1
      droppedKeys.add(e.key)
      continue
    }
    row.unshift(e)
  }
  return {
    row,
    more: wideEntries.filter((e) => e.tier !== 'primary' || droppedKeys.has(e.key)),
  }
}

/**
 * What the deck is made of right now, as a string.
 *
 * The shell re-fits when this changes and when the row's width does, and at no
 * other time. It names the controls, never their labels, so Avoidance turning
 * off does not move anything, while a mission starting — which really does
 * change what is on the row — does.
 */
export function deckSignature(wideEntries: readonly DeckEntry[]): string {
  return wideEntries.map((e) => e.key + ':' + (e.postureActions?.join('+') ?? '')).join('|')
}
