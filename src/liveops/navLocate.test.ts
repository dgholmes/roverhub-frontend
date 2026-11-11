import { afterEach, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import type { Command } from '@/types'
import {
  NOTICE_LONG_MS, NOTICE_SHORT_MS, isNotLocalisedRefusal, locateNotice, navCommandNotice, noticeShowMs, notLocalisedText,
  readLocate, type LocateResult,
} from './navLocate'

// The contract's own example, as the bridge is written against it.
const CONTRACT = {
  locate: { outcome: 'corrected', reason: null, x_m: 1.43, y_m: -0.79, heading_deg: -52.5, moved_m: 1.8, turned_deg: -75.6, fit: 0.85 },
}

const locate = (over: Partial<LocateResult> = {}): LocateResult => ({
  outcome: 'confirmed', reason: null, x_m: 1, y_m: 2, heading_deg: 30, moved_m: 0.1, turned_deg: 2, fit: 0.9, ...over,
})
const withLocate = (over: Record<string, unknown>) => ({ locate: { ...CONTRACT.locate, ...over } })

afterEach(async () => { await i18n.changeLanguage('en') })

describe('readLocate', () => {
  it('reads the contract example key for key', () => {
    expect(readLocate(CONTRACT)).toEqual({
      outcome: 'corrected', reason: null, x_m: 1.43, y_m: -0.79, heading_deg: -52.5, moved_m: 1.8, turned_deg: -75.6, fit: 0.85,
    })
  })

  it('reads each outcome', () => {
    expect(readLocate(withLocate({ outcome: 'confirmed' }))?.outcome).toBe('confirmed')
    expect(readLocate(withLocate({ outcome: 'unconfirmed', reason: 'poor_fit', fit: null }))).toMatchObject({
      outcome: 'unconfirmed', reason: 'poor_fit', fit: null,
    })
  })

  it('is absent when there is no locate: an older bridge, or a robot without navigation', () => {
    expect(readLocate(undefined)).toBeNull()
    expect(readLocate(null)).toBeNull()
    expect(readLocate({})).toBeNull()
    expect(readLocate({ snapshot_id: 's1', camera: 'front' })).toBeNull()
    expect(readLocate({ locate: null })).toBeNull()
  })

  it('is absent when the result or locate is not an object', () => {
    for (const bad of ['locate', 3, true, [CONTRACT]]) expect(readLocate(bad), String(bad)).toBeNull()
    for (const bad of ['corrected', 3, [CONTRACT.locate]]) expect(readLocate({ locate: bad })).toBeNull()
  })

  it('is absent for an outcome this build does not know', () => {
    expect(readLocate(withLocate({ outcome: 'maybe' }))).toBeNull()
    expect(readLocate(withLocate({ outcome: undefined }))).toBeNull()
    expect(readLocate(withLocate({ outcome: 'CORRECTED' }))).toBeNull()
  })

  it('is absent when a number is malformed: a string, NaN, Infinity, a negative distance', () => {
    expect(readLocate(withLocate({ moved_m: '1.8' }))).toBeNull()
    expect(readLocate(withLocate({ turned_deg: Number.NaN }))).toBeNull()
    expect(readLocate(withLocate({ x_m: Number.POSITIVE_INFINITY }))).toBeNull()
    expect(readLocate(withLocate({ heading_deg: true }))).toBeNull()
    expect(readLocate(withLocate({ fit: 'good' }))).toBeNull()
    expect(readLocate(withLocate({ moved_m: -0.5 }))).toBeNull()
    // Malformed is malformed whatever the outcome.
    expect(readLocate(withLocate({ outcome: 'unconfirmed', moved_m: 'n/a' }))).toBeNull()
  })

  it('is absent when a confirmed or corrected placement leaves out where it put the robot', () => {
    for (const outcome of ['confirmed', 'corrected']) {
      for (const key of ['x_m', 'y_m', 'heading_deg', 'moved_m', 'turned_deg']) {
        expect(readLocate(withLocate({ outcome, [key]: null })), `${outcome} ${key}`).toBeNull()
        expect(readLocate(withLocate({ outcome, [key]: undefined })), `${outcome} ${key}`).toBeNull()
      }
    }
  })

  it('lets unconfirmed leave its pose and fit out, since nothing is said about them', () => {
    const r = readLocate({ locate: { outcome: 'unconfirmed', reason: 'no_scan' } })
    expect(r).toEqual({
      outcome: 'unconfirmed', reason: 'no_scan', x_m: null, y_m: null, heading_deg: null, moved_m: null, turned_deg: null, fit: null,
    })
  })

  it('reads a fit that is null or left out as null', () => {
    expect(readLocate(withLocate({ fit: null }))?.fit).toBeNull()
    expect(readLocate(withLocate({ fit: undefined }))?.fit).toBeNull()
  })

  it('reads a reason this build does not know as no reason, keeping the warning', () => {
    expect(readLocate(withLocate({ outcome: 'unconfirmed', reason: 'cosmic_rays' }))).toMatchObject({ outcome: 'unconfirmed', reason: null })
    expect(readLocate(withLocate({ outcome: 'unconfirmed', reason: 7 }))?.reason).toBeNull()
  })
})

describe('locateNotice', () => {
  it('confirmed: a green line', () => {
    expect(locateNotice(locate({ outcome: 'confirmed' }))).toEqual({ tone: 'green', text: 'Position confirmed by the lidar.' })
  })

  it('corrected, moved and turned: both, with the real numbers, the angle whole and unsigned', () => {
    expect(locateNotice(readLocate(CONTRACT)!)).toEqual({
      tone: 'neutral',
      text: 'The lidar placed the robot 1.8 m away and turned it 76° from where you put it.',
    })
  })

  it('corrected, moved only: says only the distance', () => {
    expect(locateNotice(locate({ outcome: 'corrected', moved_m: 0.64, turned_deg: -9.9 })).text)
      .toBe('The lidar placed the robot 0.6 m from where you put it.')
  })

  it('corrected, turned only: says only the turn', () => {
    expect(locateNotice(locate({ outcome: 'corrected', moved_m: 0.24, turned_deg: -42.4 })).text)
      .toBe('The lidar turned the robot 42° from where you put it.')
    expect(locateNotice(locate({ outcome: 'corrected', moved_m: 0, turned_deg: 180 })).text)
      .toBe('The lidar turned the robot 180° from where you put it.')
  })

  it('corrected at exactly the thresholds counts them as notable', () => {
    expect(locateNotice(locate({ outcome: 'corrected', moved_m: 0.25, turned_deg: 10 })).text)
      .toBe('The lidar placed the robot 0.3 m away and turned it 10° from where you put it.')
  })

  it('corrected by less than either threshold still says both: the bridge did move it', () => {
    expect(locateNotice(locate({ outcome: 'corrected', moved_m: 0.12, turned_deg: 4.4 })).text)
      .toBe('The lidar placed the robot 0.1 m away and turned it 4° from where you put it.')
  })

  it('unconfirmed: amber, and asks the operator to check the arrow', () => {
    expect(locateNotice(locate({ outcome: 'unconfirmed', reason: null }))).toEqual({
      tone: 'amber',
      text: 'The lidar could not confirm this position. Check the robot’s arrow before sending it anywhere.',
    })
  })

  it.each([
    ['no_scan', 'The lidar could not confirm this position. The lidar is not sending a scan. Check the robot’s arrow before sending it anywhere.'],
    ['ambiguous', 'The lidar could not confirm this position. This area looks alike in several places: try nearer a corner or doorway. Check the robot’s arrow before sending it anywhere.'],
    ['poor_fit', 'The lidar could not confirm this position. The surroundings do not match the map here. Check the robot’s arrow before sending it anywhere.'],
  ] as const)('unconfirmed, %s: one extra sentence the operator can act on', (reason, text) => {
    expect(locateNotice(locate({ outcome: 'unconfirmed', reason }))).toEqual({ tone: 'amber', text })
  })

  it.each(['no_map', 'unavailable'] as const)('unconfirmed, %s: the plain warning, nothing to act on from here', (reason) => {
    expect(locateNotice(locate({ outcome: 'unconfirmed', reason })).text)
      .toBe('The lidar could not confirm this position. Check the robot’s arrow before sending it anywhere.')
  })

  it('has Korean for every outcome and reason, different from the English', async () => {
    const cases: LocateResult[] = [
      locate({ outcome: 'confirmed' }),
      readLocate(CONTRACT)!,
      locate({ outcome: 'corrected', moved_m: 0.64, turned_deg: 1 }),
      locate({ outcome: 'corrected', moved_m: 0, turned_deg: 42 }),
      locate({ outcome: 'unconfirmed', reason: null }),
      locate({ outcome: 'unconfirmed', reason: 'no_scan' }),
      locate({ outcome: 'unconfirmed', reason: 'ambiguous' }),
      locate({ outcome: 'unconfirmed', reason: 'poor_fit' }),
    ]
    const en = cases.map((c) => locateNotice(c).text)
    await i18n.changeLanguage('ko')
    const ko = cases.map((c) => locateNotice(c).text)
    ko.forEach((text, i) => {
      expect(text).toBeTruthy()
      expect(text).not.toBe(en[i])
      expect(text).not.toMatch(/\{\{|liveops\./)
    })
    expect(ko[1]).toContain('1.8m')
    expect(ko[1]).toContain('76°')
  })
})

describe('the not-localised refusal', () => {
  it('is recognised by its code, bare or with a detail', () => {
    expect(isNotLocalisedRefusal('REJECTED_NOT_LOCALISED')).toBe(true)
    expect(isNotLocalisedRefusal('REJECTED_NOT_LOCALISED: scan fit 0.31 at the believed pose')).toBe(true)
    expect(isNotLocalisedRefusal('  REJECTED_NOT_LOCALISED: x')).toBe(true)
  })

  it('is not any other refusal, or a longer code that starts the same', () => {
    expect(isNotLocalisedRefusal('REJECTED_NAV_REFUSED: localization_lost')).toBe(false)
    expect(isNotLocalisedRefusal('REJECTED_NOT_LOCALISED_YET')).toBe(false)
    expect(isNotLocalisedRefusal('No response from the robot after 15s.')).toBe(false)
    expect(isNotLocalisedRefusal(undefined)).toBe(false)
    expect(isNotLocalisedRefusal(null)).toBe(false)
  })

  it('is worded, in English and Korean, and asks for Set position', async () => {
    expect(notLocalisedText('REJECTED_NOT_LOCALISED: x')).toBe(
      'The robot is not sure where it is: the lidar does not match the map there. Set its position again.',
    )
    expect(notLocalisedText('REJECTED_ESTOP')).toBeNull()
    await i18n.changeLanguage('ko')
    expect(notLocalisedText('REJECTED_NOT_LOCALISED')).toMatch(/위치를 다시 지정/)
  })
})

describe('navCommandNotice', () => {
  const cmd = (over: Partial<Command>): Pick<Command, 'type' | 'current_stage' | 'failure_reason' | 'result'> => ({
    type: 'RESET_POSITION', current_stage: 'execution_completed', ...over,
  })

  it('a Set position with a locate: what the lidar said', () => {
    expect(navCommandNotice(cmd({ result: CONTRACT }))).toEqual({
      tone: 'neutral', text: 'The lidar placed the robot 1.8 m away and turned it 76° from where you put it.',
    })
  })

  it('a Set position without one changes nothing: no notice, as before', () => {
    expect(navCommandNotice(cmd({}))).toBeNull()
    expect(navCommandNotice(cmd({ result: {} }))).toBeNull()
    expect(navCommandNotice(cmd({ result: withLocate({ outcome: 'sideways' }) }))).toBeNull()
  })

  it('only a Set position that completed: a failed one has the toast', () => {
    expect(navCommandNotice(cmd({ current_stage: 'execution_failed', result: CONTRACT }))).toBeNull()
    expect(navCommandNotice(cmd({ current_stage: 'timed_out' }))).toBeNull()
  })

  it('a walk refused REJECTED_NOT_LOCALISED: red, with Set position beside it', () => {
    expect(navCommandNotice(cmd({ type: 'NAV_GOTO', current_stage: 'execution_failed', failure_reason: 'REJECTED_NOT_LOCALISED: fit 0.2' }))).toEqual({
      tone: 'red',
      text: 'The robot is not sure where it is: the lidar does not match the map there. Set its position again.',
      setPosition: true,
    })
  })

  it('no notice for any other walk outcome', () => {
    expect(navCommandNotice(cmd({ type: 'NAV_GOTO', current_stage: 'execution_failed', failure_reason: 'REJECTED_NAV_REFUSED: estop' }))).toBeNull()
    expect(navCommandNotice(cmd({ type: 'NAV_GOTO', current_stage: 'execution_completed' }))).toBeNull()
    // Another command type carrying the same text is not the walk's refusal.
    expect(navCommandNotice(cmd({ type: 'NAV_CANCEL', current_stage: 'execution_failed', failure_reason: 'REJECTED_NOT_LOCALISED' }))).toBeNull()
  })
})

describe('noticeShowMs', () => {
  it('keeps a confirmation as long as "Arrived", and anything to act on longer', () => {
    expect(noticeShowMs({ tone: 'green' })).toBe(NOTICE_SHORT_MS)
    for (const tone of ['neutral', 'amber', 'red'] as const) expect(noticeShowMs({ tone })).toBe(NOTICE_LONG_MS)
    expect(NOTICE_LONG_MS).toBeGreaterThan(NOTICE_SHORT_MS)
  })
})
