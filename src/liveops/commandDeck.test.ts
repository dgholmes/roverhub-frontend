import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { initialRobots } from '@/mocks/mockRobots'
import type { TaskBarButton, TaskBarModel, TaskBarSlot } from '@/liveops/taskBar'
import type { RobotState } from '@/types'
import { DECK_KINDS, UNWIRED_COMMANDS, deckEntries, type DeckEntry, type DeckKind } from './commandDeck'

/** No real robot can have an empty applicable-posture set: `capabilitiesFor`
 * falls back to quad for an unknown type, so every robot has a stand, sit and
 * safe-stop target, and an unrecognised `sdk_state` deliberately returns all
 * three. The deck's rule -- no applicable posture action, no posture entry --
 * still has to hold if one ever does, so this one robot id gets an empty set
 * while every other call runs the real module. */
const NO_POSTURE = 'robot-with-no-posture-targets'

vi.mock('@/liveops/postureContext', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/liveops/postureContext')>()
  return {
    ...actual,
    applicablePostureActions: (r: RobotState) =>
      (r.robot_id === NO_POSTURE ? [] : actual.applicablePostureActions(r)),
  }
})

const robot = (over: Partial<RobotState> = {}): RobotState => ({ ...initialRobots[1], ...over })

const model = (buttons: TaskBarButton[], slot: TaskBarSlot = 'none'): TaskBarModel => ({
  slot, title: '', tag: null, tagTone: 'neutral', detail: null, progress: null, buttons,
})

/** Every `buttons` combination `taskBarModel` can return, so the matrix below
 * exercises the deck the way the bar does rather than the way this test guesses. */
const MODELS: TaskBarButton[][] = [
  ['takeControl'],
  ['release'],
  ['takeControl', 'stopMission'],
  ['releaseResume', 'stopMission'],
  ['retry', 'takeControl', 'stopMission'],
  ['stopMission'],
  ['takeControl', 'viewRun', 'dismiss'],
]

const kindsOf = (entries: DeckEntry[]): DeckKind[] => entries.map((e) => e.kind)
const keysOf = (entries: DeckEntry[], tier: DeckEntry['tier']): string[] =>
  entries.filter((e) => e.tier === tier).map((e) => e.key)

// ── The anti-drift guard (design §7.2, anti-goal #2) ────────────────────────
//
// The hazard this file exists for: an operator control is added to the desktop
// bar as hand-written JSX, nobody adds it to the deck, and the touch dock
// silently lacks it -- exactly how `RealDataProvider`'s hand-maintained
// WIRED_COMMAND_TYPES mirror goes wrong.
//
// So this does not restate what the bar renders; it reads CurrentTaskBar.tsx
// and derives it. Every PascalCase component the bar *imports* must either be
// rendered inside the file's `deck-controls` region -- where the one
// `switch (entry.kind)` lives -- or be named below as an anchored exception
// with its reason. A new control reaches the bar through an import, so a new
// import that is neither fails this test by default, which is the direction
// the default should fail in.
const SRC = readFileSync(new URL('../components/liveops/mission/CurrentTaskBar.tsx', import.meta.url), 'utf8')

/** Named value imports, PascalCase: `import type` lines, inline `type X`
 * specifiers, SCREAMING_SNAKE consts, hooks and icon packages are not controls. */
function importedComponents(src: string): string[] {
  const names: string[] = []
  for (const m of src.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+'([^']+)'/g)) {
    const [, typeOnly, body, module] = m
    if (typeOnly || module === 'react' || module === 'lucide-react') continue
    for (const raw of body.split(',')) {
      const name = raw.trim()
      if (!name || name.startsWith('type ')) continue
      // PascalCase: starts upper AND contains a lower-case letter, so
      // UNWIRED_COMMANDS and friends are not mistaken for components.
      if (/^[A-Z]/.test(name) && /[a-z]/.test(name)) names.push(name)
    }
  }
  return names
}

/** Imported, PascalCase, and not a robot control: dialog scaffolding and kit. */
const NOT_A_CONTROL = new Set([
  'Dialog', 'DialogContent', 'DialogDescription', 'DialogFooter', 'DialogHeader', 'DialogTitle',
  'Badge', 'Button', 'ErrorBoundary',
])

/** Controls the bar renders outside the deck, each for a stated reason. The
 * touch shell renders its own counterpart of each; none may be dropped here
 * without a deliberate edit to this list. */
const ANCHORED: Record<string, string> = {
  EStopButton:
    'anchored outside the command group and never gated by control ownership; '
    + 'every shell draws it in its own chrome (design §7.2.5)',
  SpeedControl:
    'a local setting, not a command; on touch it lives in the drive strip',
  CommandOverflowMenu:
    'the presentation of the overflow tier, not a control of its own',
}

const region = (): string => {
  const start = SRC.indexOf('deck-controls:begin')
  const end = SRC.indexOf('deck-controls:end')
  expect(start, 'CurrentTaskBar.tsx must mark its deck-controls region').toBeGreaterThan(-1)
  expect(end).toBeGreaterThan(start)
  return SRC.slice(start, end)
}

describe('commandDeck', () => {
  it('every control the desktop bar renders has a deck entry', () => {
    const deckRegion = region()

    // 1. Every control component the bar imports is rendered from the deck.
    const imported = importedComponents(SRC)
    expect(imported.length).toBeGreaterThan(5)
    for (const name of imported) {
      if (NOT_A_CONTROL.has(name) || name in ANCHORED) continue
      expect(deckRegion, `<${name}> is rendered by CurrentTaskBar but not from a commandDeck kind`)
        .toContain(`<${name}`)
    }

    // 2. The exception lists cannot rot: everything they excuse must still be
    //    imported, so a removed control takes its excuse with it.
    for (const name of [...NOT_A_CONTROL, ...Object.keys(ANCHORED)]) {
      expect(imported, `${name} is excused in commandDeck.test.ts but no longer imported`)
        .toContain(name)
    }

    // 3. The region handles exactly the kinds the deck can emit -- neither a
    //    kind with no renderer nor a renderer for a kind that never arrives.
    const handled = new Set([...deckRegion.matchAll(/case '([A-Za-z]+)':/g)].map((m) => m[1]))
    expect([...handled].sort()).toEqual([...DECK_KINDS].sort())

    // 4. DECK_KINDS is what deckEntries actually produces, not a wish list.
    const emitted = new Set<DeckKind>()
    for (const buttons of MODELS) {
      for (const width of ['wide', 'narrow'] as const) {
        for (const k of kindsOf(deckEntries(model(buttons), robot(), width))) emitted.add(k)
      }
    }
    expect([...emitted].sort()).toEqual([...DECK_KINDS].sort())
  })

  it('narrow keeps control, posture and safe stop primary', () => {
    // Safe stop is one of the posture targets (postureActionsFor: stand, sit,
    // safe stop), so the posture entry is what carries it.
    const entries = deckEntries(model(['takeControl']), robot(), 'narrow')
    expect(keysOf(entries, 'primary')).toEqual(['control', 'posture'])
  })

  it('narrow demotes speak, led, avoidance, leg switch and stop mission', () => {
    const entries = deckEntries(model(['takeControl', 'stopMission']), robot(), 'narrow')
    const overflow = keysOf(entries, 'overflow')
    for (const key of ['speak', 'led', 'avoidance', 'legSwitch', 'stopMission']) {
      expect(overflow).toContain(key)
    }
    expect(keysOf(entries, 'primary')).toEqual(['control', 'posture'])
  })

  it('wide promotes everything except the four unwired commands', () => {
    // Three, not four, on this build: RESUME became wired on 2026-11-11 and is
    // the `retry` entry. PAUSE, RETURN and DOCK are what remain undispatchable.
    const entries = deckEntries(model(['takeControl', 'stopMission']), robot(), 'wide')
    expect(keysOf(entries, 'overflow')).toEqual([...UNWIRED_COMMANDS])
    expect(keysOf(entries, 'primary')).toEqual([
      'control', 'stopMission', 'posture', 'legSwitch', 'avoidance', 'led', 'speak',
    ])
    expect(entries.filter((e) => e.kind === 'command').every((e) => e.tier === 'overflow')).toBe(true)
  })

  // ── Existence by run phase and by posture (design 2026-11-24 §6.4) ───────

  it('a running mission drops posture and the leg switch, and keeps the rest', () => {
    const running = deckEntries(model(['takeControl', 'stopMission'], 'running'), robot(), 'wide')
      .map((e) => e.key)
    expect(running).toContain('control')
    expect(running).toContain('stopMission')
    // Both are refused by the bridge for the length of a run, so they cannot
    // apply -- the one case where hiding is right.
    expect(running).not.toContain('posture')
    expect(running).not.toContain('legSwitch')
    // Announcing yourself to a corridor mid-patrol is exactly when these are
    // wanted, so they stay.
    expect(running).toContain('speak')
    expect(running).toContain('led')
    expect(running).toContain('avoidance')
  })

  it('a paused run keeps posture: the operator is standing the robot up to look', () => {
    expect(deckEntries(model(['releaseResume', 'stopMission'], 'paused'), robot(), 'wide')
      .map((e) => e.key)).toContain('posture')
    expect(deckEntries(model(['retry', 'takeControl', 'stopMission'], 'paused'), robot(), 'wide')
      .map((e) => e.key)).toContain('posture')
  })

  it('no applicable posture action means no posture entry', () => {
    const entries = deckEntries(model(['takeControl']), robot({ robot_id: NO_POSTURE }), 'wide')
    expect(entries.map((e) => e.key)).not.toContain('posture')
    // and nothing else goes with it
    expect(entries.map((e) => e.key)).toContain('legSwitch')
  })

  it('the posture slot does not move as the robot stands up', () => {
    const idle = model(['takeControl'])
    const down = deckEntries(idle, robot({ sdk_state: 'stand_down', posture: 'upright' }), 'wide')
    const up = deckEntries(idle, robot({ sdk_state: 'balance_stand', posture: 'upright' }), 'wide')
    const fallen = deckEntries(idle, robot({ sdk_state: 'stand_down', posture: 'fallen' }), 'wide')
    const at = (entries: DeckEntry[]) => entries.findIndex((e) => e.key === 'posture')
    expect(at(down)).toBeGreaterThan(-1)
    expect(at(up)).toBe(at(down))
    expect(at(fallen)).toBe(at(down))
    // and the deck is the same width whichever way the robot is facing
    expect(up.map((e) => e.key)).toEqual(down.map((e) => e.key))
    expect(fallen.map((e) => e.key)).toEqual(down.map((e) => e.key))
  })

  it('entries follow taskBarModel: releaseResume replaces takeControl when paused', () => {
    const paused = deckEntries(model(['releaseResume', 'stopMission']), robot(), 'wide')
    expect(kindsOf(paused)).toContain('releaseResume')
    expect(kindsOf(paused)).not.toContain('control')

    const running = deckEntries(model(['takeControl', 'stopMission']), robot(), 'wide')
    expect(kindsOf(running)).toContain('control')
    expect(kindsOf(running)).not.toContain('releaseResume')

    // A model with neither offers no control toggle at all (another operator
    // holds the paused run), and the retry entry appears only when asked for.
    const otherOperator = deckEntries(model(['stopMission']), robot(), 'wide')
    expect(kindsOf(otherOperator)).not.toContain('control')
    expect(kindsOf(otherOperator)).not.toContain('retry')
    expect(kindsOf(deckEntries(model(['retry', 'takeControl', 'stopMission']), robot(), 'wide')))
      .toContain('retry')
  })
})
