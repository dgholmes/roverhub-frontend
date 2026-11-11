import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { command as enCommand } from '@/i18n/locales/en/command'
import { command as koCommand } from '@/i18n/locales/ko/command'
import { REFUSAL_CODES, refusalOf, refusalText } from './refusals'

const t = i18n.t.bind(i18n)

// --- Every code the bridge can send has words --------------------------------
//
// The bridge's refusals are strings in Python ("REJECTED_X: detail"), and a new
// one reaches the console with no type to say it exists. So this reads the
// bridge source, the way missions/missionTasks.test.ts reads shared/schemas.
// ROVERHUB_BRIDGE_SRC points it at a checkout elsewhere (another worktree);
// without it, it looks for roverhub-edge beside this repo.

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')
const candidates = [
  process.env.ROVERHUB_BRIDGE_SRC,
  path.resolve(repoRoot, '..', 'roverhub-edge', 'robot_bridge'),
].filter((p): p is string => !!p && existsSync(p))

function bridgeCodes(dir: string): string[] {
  const codes = new Set<string>()
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.py'))) {
    for (const m of readFileSync(path.join(dir, file), 'utf8').matchAll(/\bREJECTED_[A-Z0-9_]*[A-Z0-9]\b/g)) codes.add(m[0])
  }
  return [...codes].sort()
}

const bridgeUnavailable = 'the refusal-wording test did NOT read the bridge source: no roverhub-edge/robot_bridge beside this repo '
  + `(looked under ${path.resolve(repoRoot, '..')}), and ROVERHUB_BRIDGE_SRC is not set. Only the table's own consistency was checked.`
afterAll(() => { if (candidates.length === 0) console.warn(`\n!!! ${bridgeUnavailable}\n`) })

describe.skipIf(candidates.length === 0)('every REJECTED_ code in the bridge source', () => {
  const found = [...new Set(candidates.flatMap(bridgeCodes))].sort()

  it('is found at all (the pattern still matches the bridge)', () => {
    expect(found.length).toBeGreaterThan(10)
  })

  it('is in the table', () => {
    expect(found.filter((c) => !(REFUSAL_CODES as readonly string[]).includes(c))).toEqual([])
  })
})

describe('the refusal table', () => {
  it('has words for every code in English and Korean', () => {
    for (const code of REFUSAL_CODES) {
      expect(enCommand.refusal.code[code], `en ${code}`).toBeTruthy()
      expect(koCommand.refusal.code[code], `ko ${code}`).toBeTruthy()
    }
    expect(Object.keys(enCommand.refusal.code).sort()).toEqual([...REFUSAL_CODES].sort())
  })

  // Codes the bridge gains before its source here has them: the table may run
  // ahead of the bridge (only bridge codes missing from the table fail above).
  it.each([
    ['REJECTED_BLIND_MOTION', /map/i],
    ['REJECTED_EXPIRED', /too late/i],
    ['REJECTED_NOT_BLOCKED', /blocked/i],
    ['REJECTED_CONTROL_HELD', /release/i],
  ])('words %s ahead of the bridge', (code, words) => {
    expect(refusalOf(t, `${code}: detail`)!.known).toBe(true)
    expect(refusalText(t, code)).toMatch(words)
    expect((koCommand.refusal.code as Record<string, string>)[code]).toBeTruthy()
  })

  it('is the one table: the mission start refusals read from it', () => {
    expect((enCommand.refusal.code as Record<string, string>).REJECTED_RUN_ACTIVE).toBe('the robot is already running a mission')
  })
})

describe('refusalOf', () => {
  it('words a refusal by the code before the colon, keeping the raw text', () => {
    const r = refusalOf(t, 'REJECTED_NAV_MAP_MISMATCH: the point is on map \'a\' but this robot is on \'b\'')!
    expect(r.code).toBe('REJECTED_NAV_MAP_MISMATCH')
    expect(r.known).toBe(true)
    expect(r.text).toBe(t('command.refusal.code.REJECTED_NAV_MAP_MISMATCH'))
    expect(r.text).not.toContain('REJECTED_')
    expect(r.raw).toContain('map \'a\'')
  })

  it('words a bare code, as the safety gate sends it', () => {
    expect(refusalOf(t, 'REJECTED_ESTOP')!.text).toBe(t('command.refusal.code.REJECTED_ESTOP'))
  })

  it('falls back to a generic line for a code this build does not know, and still shows the code', () => {
    const r = refusalOf(t, 'REJECTED_SOMETHING_NEW: it was refused')!
    expect(r.known).toBe(false)
    expect(r.text).toBe(t('command.refusal.unknown'))
    expect(r.code).toBe('REJECTED_SOMETHING_NEW')
    expect(refusalText(t, 'REJECTED_SOMETHING_NEW: it was refused')).toContain('REJECTED_SOMETHING_NEW')
  })

  it('words REJECTED_NAV_REFUSED with the nav stop reason the walk bar already uses', () => {
    const r = refusalOf(t, 'REJECTED_NAV_REFUSED: localization_lost')!
    expect(r.text).toBe(t('command.refusal.navRefusedBecause', { reason: t('liveops.nav.ended.reason.localizationLost') }))
    // A detail with its own detail: the head picks the words.
    expect(refusalOf(t, 'REJECTED_NAV_REFUSED: joy_unusable: remote active')!.text)
      .toBe(t('command.refusal.navRefusedBecause', { reason: t('liveops.nav.ended.reason.remoteActive') }))
    // An unknown reason still reads as the code's own words.
    expect(refusalOf(t, 'REJECTED_NAV_REFUSED: something_else')!.text).toBe(t('command.refusal.code.REJECTED_NAV_REFUSED'))
  })

  it('names the no-go zone when the bridge says which', () => {
    expect(refusalOf(t, 'REJECTED_NAV_GOAL_IN_NO_GO_ZONE: Stairwell')!.text)
      .toBe(t('command.refusal.inNoGoZoneNamed', { zone: 'Stairwell' }))
  })

  it('names the staircase when a goal lands on one (0.0.21)', () => {
    expect(refusalOf(t, 'REJECTED_NAV_GOAL_IN_STAIRS_ZONE: Main stairs')!.text)
      .toBe(t('command.refusal.inStairsZoneNamed', { zone: 'Main stairs' }))
    expect(refusalText(t, 'REJECTED_NAV_GOAL_IN_STAIRS_ZONE')).toMatch(/stairs/i)
    expect(refusalText(t, 'REJECTED_STAIRS_NOT_SUPPORTED: this robot cannot climb stairs yet (stairs_not_supported_by_sdk)'))
      .toMatch(/cannot climb stairs/)
    expect(refusalOf(t, "REJECTED_STAIRS_ZONE_UNKNOWN: 's1' (block st): ...")!.known).toBe(true)
  })

  it('leaves a reason that is not a bridge code alone', () => {
    expect(refusalOf(t, 'No response from the robot')).toBeNull()
    expect(refusalText(t, 'No response from the robot')).toBe('No response from the robot')
  })
})
