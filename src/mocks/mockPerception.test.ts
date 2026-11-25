import { describe, expect, it } from 'vitest'
import type { PerceptionStatus } from '@/types'
import { detectionView } from '@/liveops/detection'
import { initialRobots } from './mockRobots'
import { MockPerception } from './mockPerception'

const ATLAS = 'zaezae-x1-001'
const REX = 'zaezae-x1-002'
const OLD = 'zaezae-x1-003'
const SCOUT = 'zaezae-x1-004'
const robot = (id: string) => initialRobots.find((r) => r.robot_id === id)!

describe('MockPerception', () => {
  it('seeds a status per mock robot that covers each view the switch shows', () => {
    const p = new MockPerception(initialRobots)
    expect(detectionView(p.get(ATLAS))).toMatchObject({ kind: 'on', running: ['base.person', 'base.pose', 'base.fall'] })
    expect(detectionView(p.get(SCOUT))).toMatchObject({ kind: 'off', setting: { enabled: false, selected: ['base.person'] } })
    expect(detectionView(p.get(REX))).toEqual({ kind: 'olderRobot' })
    expect(detectionView(p.get(OLD))).toEqual({ kind: 'notInstalled' })
  })

  it('publishes what perception would: every detector listed, the unchosen ones unavailable', () => {
    const p = new MockPerception(initialRobots)
    p.apply(ATLAS, { enabled: true, detectors: ['base.person'] })
    const s = p.get(ATLAS)!
    expect(s).toMatchObject({ enabled: true, selected: ['base.person'], off_reason: null, source_state: 'live', site_id: robot(ATLAS).site_id })
    expect(s.detectors.map((d) => [d.detector_id, d.status])).toEqual([
      ['base.person', 'running'], ['base.pose', 'unavailable'], ['base.fall', 'unavailable'],
    ])
  })

  it('applies needs, and None means all', () => {
    const p = new MockPerception(initialRobots)
    p.apply(SCOUT, { enabled: true, detectors: ['base.fall'] })
    expect(p.get(SCOUT)!.selected).toEqual(['base.person', 'base.pose', 'base.fall'])
    p.apply(SCOUT, { enabled: true })
    expect(p.get(SCOUT)!.selected).toEqual(['base.person', 'base.pose', 'base.fall'])
  })

  it('switched off: nothing runs, the camera is not read, the selection is kept', () => {
    const p = new MockPerception(initialRobots)
    p.apply(ATLAS, { enabled: false, detectors: ['base.person', 'base.pose'] })
    const s = p.get(ATLAS)!
    expect(s).toMatchObject({ enabled: false, off_reason: 'switched_off', source_state: 'unavailable', selected: ['base.person', 'base.pose'] })
    expect(s.detectors.every((d) => d.status === 'unavailable')).toBe(true)
  })

  it("a survey's hold wins over the setting while it lasts, then detection comes back as set", () => {
    const p = new MockPerception(initialRobots)
    const seen: PerceptionStatus[] = []
    p.feed.subscribe(ATLAS, (s) => seen.push(s))
    p.setSurveyHold(ATLAS, true)
    expect(p.get(ATLAS)).toMatchObject({ enabled: true, off_reason: 'survey', source_state: 'unavailable' })
    p.setSurveyHold(ATLAS, true) // no change, no new status
    p.apply(ATLAS, { enabled: true, detectors: ['base.person'] }) // set during the survey
    expect(p.get(ATLAS)).toMatchObject({ off_reason: 'survey', selected: ['base.person'] })
    p.setSurveyHold(ATLAS, false)
    expect(p.get(ATLAS)).toMatchObject({ enabled: true, off_reason: null, source_state: 'live', selected: ['base.person'] })
    expect(seen.map((s) => s.off_reason)).toEqual([null, 'survey', 'survey', null])
  })

  it('refuses as the bridge would', () => {
    const p = new MockPerception(initialRobots)
    expect(p.refusal(robot(ATLAS), { enabled: true, detectors: ['base.fall'] })).toBeNull()
    expect(p.refusal(robot(ATLAS), { enabled: false })).toBeNull()
    expect(p.refusal(robot(ATLAS), { enabled: 'yes' })).toMatch(/^REJECTED_INVALID_PARAMS/)
    expect(p.refusal(robot(ATLAS), { enabled: true, detectors: [] })).toMatch(/^REJECTED_INVALID_PARAMS/)
    expect(p.refusal(robot(ATLAS), { enabled: true, detectors: ['base.person', 'base.person'] })).toMatch(/^REJECTED_INVALID_PARAMS/)
    expect(p.refusal(robot(ATLAS), { enabled: true, detectors: ['base.vehicle'] })).toMatch(/^REJECTED_INVALID_PARAMS/)
    expect(p.refusal({ ...robot(ATLAS), abstract_state: 'E_STOP' }, { enabled: true })).toMatch(/^REJECTED_ESTOP/)
    expect(p.refusal(robot(OLD), { enabled: true })).toMatch(/^REJECTED_DETECTION_UNAVAILABLE/)
    expect(p.refusal(robot(REX), { enabled: true })).toMatch(/^REJECTED_DETECTION_UNAVAILABLE/)
  })
})
