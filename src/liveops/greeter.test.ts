import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/realtime/mqttClient', () => ({ connectBroker: vi.fn(() => ({ on: vi.fn() })) }))

import i18n from '@/i18n'
import { WIRED_COMMAND_TYPES } from '@/lib/realtime/realDataProvider'
import { DEFAULT_GREETER_SETTING, type GreeterStatus } from '@/types'
import {
  addGreeting, DEFAULT_GREETINGS, editGreeting, greeterChip, greeterParams, isSavedGreetings,
  readGreeterStatus, removeGreeting, savedGreetingsKey, settingOf,
} from './greeter'

beforeAll(async () => { await i18n.changeLanguage('en') })

const status = (over: Partial<GreeterStatus> = {}): GreeterStatus => ({
  enabled: true, phase: 'watching', blocked_reason: null, last_greeted_at: null, greetings_today: 0, setting: null, ...over,
})

describe('the wired set', () => {
  // RealDataProvider's set is a hand-kept mirror of the Python one: a type
  // missing here silently goes to the mock instead of the robot.
  it('sends GREET and SET_GREETER to the robot, not to the mock', () => {
    expect(WIRED_COMMAND_TYPES.has('GREET')).toBe(true)
    expect(WIRED_COMMAND_TYPES.has('SET_GREETER')).toBe(true)
  })
})

describe('readGreeterStatus', () => {
  it('reads a full status', () => {
    const raw = {
      enabled: true, phase: 'blocked', blocked_reason: 'no_depth', last_greeted_at: '2026-11-26T01:00:00Z',
      greetings_today: 4, setting: { ...DEFAULT_GREETER_SETTING, enabled: true, clip_id: 'c1' },
    }
    expect(readGreeterStatus(raw)).toEqual(raw)
  })

  it('reads nothing, a phase it does not know, or junk as no greeter', () => {
    expect(readGreeterStatus(undefined)).toBeNull()
    expect(readGreeterStatus(null)).toBeNull()
    expect(readGreeterStatus({ enabled: true, phase: 'dancing' })).toBeNull()
    expect(readGreeterStatus('watching')).toBeNull()
  })

  it('defaults the optional fields', () => {
    expect(readGreeterStatus({ enabled: false, phase: 'off' })).toEqual(status({ enabled: false, phase: 'off' }))
  })
})

describe('greeterChip', () => {
  it.each([
    ['off', 'neutral', false],
    ['watching', 'green', true],
    ['greeting', 'accent', false],
    ['cooldown', 'neutral', false],
    ['blocked', 'amber', false],
  ] as const)('%s is %s, dot %s', (phase, tone, dot) => {
    const chip = greeterChip(status({ phase }))
    expect(chip.tone).toBe(tone)
    expect(chip.dot).toBe(dot)
    expect(i18n.t(chip.labelKey)).not.toBe(chip.labelKey)
  })

  it.each([
    'lying_down', 'mission_running', 'operator_control', 'estop', 'battery', 'no_detection', 'no_depth',
    'nav_goal', 'robot_unreachable', 'fallen', 'not_standing', 'feed_unavailable',
  ])(
    'words the blocked reason %s in English and Korean', async (reason) => {
      const chip = greeterChip(status({ phase: 'blocked', blocked_reason: reason }))
      expect(chip.reason && 'key' in chip.reason).toBe(true)
      const key = (chip.reason as { key: `greeter.reason.${string}` }).key as 'greeter.reason.estop'
      const en = i18n.t(key)
      expect(en).not.toBe(key)
      await i18n.changeLanguage('ko')
      expect(i18n.t(key)).not.toBe(key)
      expect(i18n.t(key)).not.toBe(en)
      await i18n.changeLanguage('en')
    },
  )

  it('shows a reason it does not know as the robot said it', () => {
    expect(greeterChip(status({ phase: 'blocked', blocked_reason: 'too_dark' })).reason).toEqual({ raw: 'too_dark' })
  })

  it('has no reason unless blocked', () => {
    expect(greeterChip(status({ phase: 'watching', blocked_reason: 'estop' })).reason).toBeNull()
  })
})

describe('saved greetings', () => {
  it('starts with Korean and English defaults that pass validation', () => {
    expect(isSavedGreetings([...DEFAULT_GREETINGS])).toBe(true)
    expect(DEFAULT_GREETINGS.some((g) => /[가-힣]/.test(g.text))).toBe(true)
    expect(DEFAULT_GREETINGS.some((g) => /^[A-Za-z]/.test(g.text))).toBe(true)
  })

  it('rejects what storage might hand back broken', () => {
    expect(isSavedGreetings(null)).toBe(false)
    expect(isSavedGreetings([{ id: 1, text: 'hi' }])).toBe(false)
    expect(isSavedGreetings('hello')).toBe(false)
  })

  it('adds, edits and removes, ignoring blanks and duplicates', () => {
    const list = addGreeting([], '  Hello  ', 1)
    expect(list).toEqual([{ id: 'g-1', text: 'Hello' }])
    expect(addGreeting(list, 'Hello', 2)).toHaveLength(1)
    expect(addGreeting(list, '   ', 2)).toHaveLength(1)
    expect(editGreeting(list, 'g-1', 'Hi')[0].text).toBe('Hi')
    expect(editGreeting(list, 'g-1', '  ')[0].text).toBe('Hello')
    expect(removeGreeting(list, 'g-1')).toEqual([])
  })

  it('keeps each operator\'s own list', () => {
    expect(savedGreetingsKey('a')).not.toBe(savedGreetingsKey('b'))
  })
})

describe('the setting', () => {
  it('starts from the schema defaults on a robot with no setting', () => {
    expect(settingOf(status({ enabled: false, phase: 'off' }))).toEqual(DEFAULT_GREETER_SETTING)
    expect(DEFAULT_GREETER_SETTING).toMatchObject({
      dance: 'groove', trigger_distance_m: 3, facing_distance_m: 4, dance_min_distance_m: 1.5, cooldown_s: 300, min_battery_pct: 30,
    })
  })

  it('starts from what the robot holds', () => {
    const held = { ...DEFAULT_GREETER_SETTING, enabled: true, dance: null, cooldown_s: 600 }
    expect(settingOf(status({ setting: held }))).toEqual(held)
  })

  it('sends every field, bounded as the schema bounds it', () => {
    const p = greeterParams({ ...DEFAULT_GREETER_SETTING, enabled: true, trigger_distance_m: 9, cooldown_s: 5, min_battery_pct: 40.4 }, 'clip-1')
    expect(p).toEqual({
      enabled: true, clip_id: 'clip-1', dance: 'groove', trigger_distance_m: 6, facing_distance_m: 4,
      dance_min_distance_m: 1.5, cooldown_s: 30, min_battery_pct: 40,
    })
  })
})

describe('the robot is 재재 (2026-11-27)', () => {
  it('renames the old Korean preset in a saved list and leaves the rest alone', async () => {
    const { withRenamedGreetings, DEFAULT_GREETINGS } = await import('@/liveops/greeter')
    expect(DEFAULT_GREETINGS[0].text).toBe('안녕하세요, 재재입니다')
    const saved = [{ id: 'ko-hello', text: '안녕하세요, 로버허브입니다' }, { id: 'mine', text: '로버허브 좋아요' }]
    expect(withRenamedGreetings(saved)).toEqual([
      { id: 'ko-hello', text: '안녕하세요, 재재입니다' }, { id: 'mine', text: '로버허브 좋아요' }])
    const fresh = [{ id: 'x', text: 'Hello' }]
    expect(withRenamedGreetings(fresh)).toBe(fresh)
  })
})

