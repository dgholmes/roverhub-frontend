import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Command } from '@/types'
import type { SurveyStatus } from '@/types/survey'
import { MockDataProvider } from './mockDataProvider'

/** The survey through the mock provider's own command path, as demo mode runs it. */

let provider: MockDataProvider
beforeEach(() => {
  vi.useFakeTimers()
  provider = new MockDataProvider()
})
afterEach(() => {
  provider.dispose()
  vi.useRealTimers()
})

const ROBOT = 'zaezae-x1-001'

describe('MockDataProvider survey', () => {
  it('starts a survey on START_SURVEY and refuses tap-to-walk while it records', async () => {
    const states: string[] = []
    provider.subscribeSurveyStatus(ROBOT, (s: SurveyStatus) => states.push(s.state))
    const start: Command[] = []
    provider.dispatchCommand(ROBOT, 'START_SURVEY', 'Start survey', (c) => start.push(c),
      { survey_id: 's1', name: 'Office', floor_index: 0, map_id: null, cameras: 'off' })
    await vi.advanceTimersByTimeAsync(4000)
    expect(start[start.length - 1].current_stage).toBe('execution_completed')
    expect(states).toContain('recording')

    const nav: Command[] = []
    provider.dispatchCommand(ROBOT, 'NAV_GOTO', 'Go', (c) => nav.push(c), { x_m: 1, y_m: 1 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(nav[nav.length - 1].current_stage).toBe('execution_failed')
    expect(nav[nav.length - 1].failure_reason).toMatch(/REJECTED_SURVEY_ACTIVE/)
  })

  it('saves the survey as a draft map that Maps lists', async () => {
    let last: SurveyStatus | null = null
    provider.subscribeSurveyStatus(ROBOT, (s) => { last = s })
    provider.dispatchCommand(ROBOT, 'START_SURVEY', 'Start', () => {}, { survey_id: 's1', name: 'Demo office', floor_index: 0, map_id: null, cameras: 'off' })
    await vi.advanceTimersByTimeAsync(10_000)
    provider.dispatchCommand(ROBOT, 'STOP_SURVEY', 'Save', () => {}, { survey_id: 's1', save: true })
    await vi.advanceTimersByTimeAsync(30_000)
    expect(last!.state).toBe('done')
    const maps = await provider.listMaps('site-north-yard')
    const made = maps.find((m) => m.map_id === last!.map_id)
    expect(made).toMatchObject({ name: 'Demo office', status: 'draft' })
  })
})
