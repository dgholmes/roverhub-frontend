import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Command, PerceptionStatus } from '@/types'
import { checkboxParams, detectionView, switchParams } from '@/liveops/detection'
import { MockDataProvider } from './mockDataProvider'

/** The AI detection switch through the mock provider's own command path, as demo mode runs it. */

let provider: MockDataProvider
beforeEach(() => {
  vi.useFakeTimers()
  provider = new MockDataProvider()
})
afterEach(() => {
  provider.dispose()
  vi.useRealTimers()
})

const ATLAS = 'zaezae-x1-001'
const SCOUT = 'zaezae-x1-004'
const OLD = 'zaezae-x1-003'

function send(robotId: string, params: Record<string, unknown>): Command[] {
  const updates: Command[] = []
  provider.dispatchCommand(robotId, 'SET_DETECTION', 'Set AI detection', (c) => updates.push(c), params)
  return updates
}

describe('MockDataProvider AI detection', () => {
  it('has a perception status for the robots that have one, and none for the others', () => {
    expect(detectionView(provider.getPerceptionStatus(ATLAS)).kind).toBe('on')
    expect(detectionView(provider.getPerceptionStatus(SCOUT)).kind).toBe('off')
    expect(provider.getPerceptionStatus(OLD)).toBeUndefined()
  })

  it('switches detection off with the usual simulated ack, and tells subscribers', async () => {
    const seen: PerceptionStatus[] = []
    provider.subscribePerceptionStatus(ATLAS, (s) => seen.push(s))
    expect(seen).toHaveLength(1)
    const view = detectionView(provider.getPerceptionStatus(ATLAS))
    if (view.kind !== 'on') throw new Error('Atlas starts on')
    const updates = send(ATLAS, { ...switchParams(view.setting, false) })
    await vi.advanceTimersByTimeAsync(4000)
    expect(updates[updates.length - 1].current_stage).toBe('execution_completed')
    expect(seen).toHaveLength(2)
    expect(detectionView(seen[1])).toMatchObject({ kind: 'off', setting: { selected: ['base.person', 'base.pose', 'base.fall'] } })
  })

  it('ticks Falls on Scout: the remembered selection grows and detection stays off', async () => {
    const view = detectionView(provider.getPerceptionStatus(SCOUT))
    if (view.kind !== 'off') throw new Error('Scout starts off')
    send(SCOUT, { ...checkboxParams(view.setting, 'base.fall') })
    await vi.advanceTimersByTimeAsync(4000)
    expect(provider.getPerceptionStatus(SCOUT)).toMatchObject({ enabled: false, selected: ['base.person', 'base.pose', 'base.fall'] })
  })

  it('refuses a robot with no perception, as the bridge would', async () => {
    const updates = send(OLD, { enabled: true })
    await vi.advanceTimersByTimeAsync(4000)
    const last = updates[updates.length - 1]
    expect(last.current_stage).toBe('execution_failed')
    expect(last.failure_reason).toMatch(/^REJECTED_DETECTION_UNAVAILABLE/)
  })

  it('a survey holds detection off while it is busy', async () => {
    const seen: PerceptionStatus[] = []
    provider.subscribePerceptionStatus(ATLAS, (s) => seen.push(s))
    provider.dispatchCommand(ATLAS, 'START_SURVEY', 'Start survey', () => {},
      { survey_id: 's1', name: 'Office', floor_index: 0, map_id: null, cameras: 'off' })
    await vi.advanceTimersByTimeAsync(4000)
    expect(detectionView(seen[seen.length - 1])).toMatchObject({ kind: 'survey', setting: { enabled: true } })
    expect(detectionView(provider.getPerceptionStatus(ATLAS)).kind).toBe('survey')
  })
})
