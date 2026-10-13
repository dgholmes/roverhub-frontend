import { describe, expect, it } from 'vitest'
import { initialRobots } from '@/mocks/mockRobots'
import type { RobotState } from '@/types'
import { bySeverity, robotAttention } from './attention'

const base = initialRobots.find((r) => r.robot_id === 'zaezae-x1-002')!
const robot = (patch: Partial<RobotState>): RobotState => ({ ...base, ...patch })

describe('robotAttention', () => {
  it('is null for a healthy robot', () => {
    expect(robotAttention(robot({}))).toBeNull()
  })
  it('flags a fallen robot as critical', () => {
    expect(robotAttention(robot({ posture: 'fallen' }))).toMatchObject({ severity: 'critical', text: 'fallen' })
  })
  it('ranks a fall above a low battery', () => {
    const r = robot({ posture: 'fallen', battery: { percent: 5, est_runtime_min: 0, charging: false } })
    expect(robotAttention(r)?.text).toBe('fallen')
  })
  it('flags a silent edge device', () => {
    const r = robot({ bridge: { bridge_id: 'b', schema_version: '0.0.8', last_heartbeat_at: new Date(Date.now() - 120_000).toISOString(), mission_active: false } })
    expect(robotAttention(r)).toMatchObject({ severity: 'warning', place: 'edge' })
  })
  it('flags a low battery that is not charging', () => {
    expect(robotAttention(robot({ battery: { percent: 12, est_runtime_min: 0, charging: false } }))?.text).toBe('battery 12%')
  })
  it('does not treat an unknown battery as low', () => {
    expect(robotAttention(robot({ battery: { percent: null, est_runtime_min: 0, charging: false } }))).toBeNull()
  })
  it('names the hot motor', () => {
    const atlas = initialRobots.find((r) => r.robot_id === 'zaezae-x1-001')!
    expect(robotAttention(atlas)).toMatchObject({ text: 'FL knee 58 °C', place: 'motors' })
  })
})

describe('bySeverity', () => {
  it('puts critical before warning before nothing', () => {
    const c = { severity: 'critical' as const, text: '', place: 'status' as const }
    const w = { severity: 'warning' as const, text: '', place: 'status' as const }
    expect([null, w, c].sort(bySeverity)).toEqual([c, w, null])
  })
})
