import { describe, expect, it } from 'vitest'
import { RESOURCES } from './index'

const flat = (o: object, p = ''): [string, string][] =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'string' ? [[`${p}${k}`, v] as [string, string]] : flat(v as object, `${p}${k}.`))

describe('Missions copy', () => {
  it('says 미션 for a mission throughout the Korean Missions strings, never 임무', () => {
    const missions = (RESOURCES.ko.translation as unknown as { missions: object }).missions
    expect(flat(missions).filter(([, v]) => v.includes('임무')).map(([k]) => k)).toEqual([])
  })

  it('does not tell the operator to open the mission from the badge that shows inside the editor', () => {
    for (const code of ['en', 'ko'] as const) {
      const check = (RESOURCES[code].translation as unknown as { missions: { check: Record<string, string> } }).missions.check
      expect(check.zonesNotChecked).not.toMatch(/Open the mission|임무를 열어|미션을 열어/)
    }
  })
})
