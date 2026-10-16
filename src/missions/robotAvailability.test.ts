import { describe, expect, it } from 'vitest'
import { initialRobots } from '@/mocks/mockRobots'
import type { Mission, RobotState } from '@/types'
import { robotAvailability } from './robotAvailability'

const base: RobotState = {
  ...initialRobots[1],
  abstract_state: 'STAND',
  posture: 'upright',
  control_owner: null,
  battery: { percent: 90, est_runtime_min: 200, charging: false },
  bridge: initialRobots[1].bridge ? { ...initialRobots[1].bridge, last_heartbeat_at: new Date().toISOString() } : undefined,
}
const r = (patch: Partial<RobotState>): RobotState => ({ ...base, ...patch })
const mission = (status: Mission['status']) => ({ mission_id: 'm', name: 'Patrol', status } as Mission)

describe('robotAvailability', () => {
  it('a reachable, idle, upright robot is available', () => {
    expect(robotAvailability(base).status).toBe('available')
  })
  it('an unreachable robot is offline whatever else is true', () => {
    const off = r({ connectivity: { ...base.connectivity, edge_to_cloud: 'offline', bridge_state: 'offline' }, posture: 'fallen' })
    expect(robotAvailability(off).status).toBe('offline')
  })
  it('a running or paused mission makes it on a mission, and says which', () => {
    const a = robotAvailability(base, mission('active'))
    expect(a.status).toBe('onMission')
    expect(a.mission?.name).toBe('Patrol')
    expect(robotAvailability(base, mission('paused')).status).toBe('onMission')
    expect(robotAvailability(base, mission('completed')).status).toBe('available')
    expect(robotAvailability(r({ abstract_state: 'AUTO_MISSION' })).status).toBe('onMission')
  })
  it('someone driving it makes it in use', () => {
    expect(robotAvailability(r({ control_owner: 'operator-dev' })).status).toBe('inUse')
    expect(robotAvailability(r({ abstract_state: 'MANUAL' })).status).toBe('inUse')
  })
  it('a fallen robot needs attention even mid-mission; a low battery does not outrank a mission', () => {
    expect(robotAvailability(r({ posture: 'fallen' }), mission('active')).status).toBe('attention')
    const low = r({ battery: { percent: 12, est_runtime_min: 20, charging: false } })
    expect(robotAvailability(low).attention?.kind).toBe('batteryLow')
    expect(robotAvailability(low, mission('active')).status).toBe('onMission')
  })
})
