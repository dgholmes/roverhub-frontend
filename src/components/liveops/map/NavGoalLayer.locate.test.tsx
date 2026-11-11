// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'

// The hook draws nothing on a Leaflet map here; the layers are stubbed as in
// NavGoalLayer.test.tsx, and no floor grid is fetched.
vi.mock('leaflet', () => ({ default: { divIcon: (o: unknown) => ({ divIcon: o }) } }))
vi.mock('react-leaflet', () => ({
  CircleMarker: function CircleMarker() { return null },
  Polyline: function Polyline() { return null },
  Marker: function Marker() { return null },
  useMap: () => null,
  useMapEvents: () => null,
}))
vi.mock('@/missions/useFloorGrids', () => ({ useFloorGrids: () => ({}) }))

import { getCommandAvailability } from '@/liveops/commandPolicy'
import { NOTICE_LONG_MS } from '@/liveops/navLocate'
import { mockMaps } from '@/mocks/maps'
import { initialRobots } from '@/mocks/mockRobots'
import { useDriveSpeedStore } from '@/store/useDriveSpeedStore'
import { useLiveOpsStore, type CommandOutcome } from '@/store/useLiveOpsStore'
import type { Command, CommandType, RobotState } from '@/types'
import type { RobotPosition } from '@/types/robotState'
import type { SiteMap } from '@/types/maps'
import { NavBar, useNavGoal } from './NavGoalLayer'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const MAP: SiteMap = { ...mockMaps[0], zones: [] }
const FLOOR = MAP.floors[0]
const POSITION: RobotPosition = {
  x_m: 0, y_m: 0, z_m: 0, heading_deg: 0, provider: 'slam', quality: 'localized',
  accuracy_m: 0.1, freshness: 'live', updated_at: '2026-11-11T00:00:00Z',
}
const robotNamed = (robot_id: string): RobotState => ({
  ...initialRobots[1], robot_id, control_owner: null, active_run: null, nav_goal: null,
  abstract_state: 'STAND', sdk_state: 'balance_stand', position: POSITION,
})
const ROBOT = robotNamed('rover-pi')

// Each send waits for the test to answer it, as the robot would.
type Send = { robotId: string; type: CommandType; params?: Record<string, unknown>; answer: (c: Partial<Command>) => Promise<void> }
let sends: Send[]
let api: ReturnType<typeof useNavGoal>
let container: HTMLDivElement
let root: Root

function Probe({ robot }: { robot: RobotState }) {
  api = useNavGoal(robot, MAP, FLOOR)
  return <NavBar {...api.bar} />
}
const render = (robot: RobotState) => act(() => root.render(<Probe robot={robot} />))
const barText = () => container.textContent ?? ''

beforeEach(() => {
  vi.useFakeTimers()
  sends = []
  useLiveOpsStore.setState({
    dispatchCommand: vi.fn(),
    dispatchCommandAsync: (robotId, type, label, params) => new Promise<CommandOutcome>((resolve) => {
      sends.push({
        robotId, type, params,
        answer: async (over) => {
          const command = { command_id: `c${sends.length}`, robot_id: robotId, type, label, stages: [], initiated_by: 'op', current_stage: 'execution_completed', ...over } as Command
          await act(async () => { resolve({ result: command.current_stage === 'execution_completed' ? 'completed' : 'failed', command }) })
        },
      })
    }),
  })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  render(ROBOT)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

/** Set position: press at the origin, drag east, let go. */
function setPosition() {
  act(() => api.tools.onToggle('setPosition'))
  act(() => api.input.onPress([0, 0]))
  act(() => api.input.onDrag([1, 0]))
  act(() => api.input.onRelease([1, 0]))
}

const CORRECTED = { locate: { outcome: 'corrected', reason: null, x_m: 1.43, y_m: -0.79, heading_deg: -52.5, moved_m: 1.8, turned_deg: -75.6, fit: 0.85 } }
const CORRECTED_TEXT = 'The lidar placed the robot 1.8 m away and turned it 76° from where you put it.'

describe('useNavGoal: what the lidar said about a Set position', () => {
  it('is a robot that may be placed and sent (the fixture is what the tests assume)', () => {
    expect(getCommandAvailability(ROBOT, 'RESET_POSITION').enabled).toBe(true)
    expect(getCommandAvailability(ROBOT, 'NAV_GOTO').enabled).toBe(true)
  })

  it('sends RESET_POSITION and shows the lidar’s correction in the bar once the robot answers', async () => {
    setPosition()
    expect(sends).toHaveLength(1)
    expect(sends[0]).toMatchObject({ robotId: 'rover-pi', type: 'RESET_POSITION', params: { x_m: 0, y_m: 0, heading_deg: 0, map_id: MAP.map_id, floor_id: '0' } })
    expect(barText()).toBe('')
    await sends[0].answer({ result: CORRECTED })
    expect(barText()).toContain(CORRECTED_TEXT)
  })

  it('stays for a while, then goes by itself', async () => {
    setPosition()
    await sends[0].answer({ result: CORRECTED })
    act(() => { vi.advanceTimersByTime(NOTICE_LONG_MS - 100) })
    expect(barText()).toContain(CORRECTED_TEXT)
    act(() => { vi.advanceTimersByTime(200) })
    expect(barText()).toBe('')
  })

  it('goes at the operator’s next map action', async () => {
    setPosition()
    await sends[0].answer({ result: { locate: { outcome: 'unconfirmed', reason: 'ambiguous', fit: null } } })
    expect(barText()).toContain('could not confirm')
    act(() => api.tools.onToggle('setPosition'))
    expect(barText()).not.toContain('could not confirm')
  })

  it('shows nothing new for an older bridge that sends no locate', async () => {
    setPosition()
    await sends[0].answer({})
    expect(barText()).toBe('')
    setPosition()
    await sends[1].answer({ result: { snapshot_id: 'nope' } })
    expect(barText()).toBe('')
  })

  it('never shows a late answer to an older Set position over a newer one', async () => {
    setPosition()
    setPosition()
    await sends[0].answer({ result: CORRECTED })
    expect(barText()).toBe('')
    await sends[1].answer({ result: { locate: { ...CORRECTED.locate, outcome: 'confirmed' } } })
    expect(barText()).toContain('Position confirmed by the lidar.')
  })

  it('drops the notice when another robot is shown', async () => {
    setPosition()
    await sends[0].answer({ result: CORRECTED })
    render(robotNamed('rover-jetson'))
    expect(barText()).toBe('')
  })
})

describe('useNavGoal: a walk refused because the robot is not sure where it is', () => {
  function walk() {
    act(() => api.tools.onToggle('go'))
    act(() => api.input.onTap([2, 1]))
    act(() => api.bar.onWalk())
  }

  it('words the refusal in the bar, with Set position beside it', async () => {
    walk()
    expect(sends[0].type).toBe('NAV_GOTO')
    await sends[0].answer({ current_stage: 'execution_failed', failure_reason: 'REJECTED_NOT_LOCALISED: fit 0.21 at the believed pose' })
    expect(barText()).toContain('The robot is not sure where it is: the lidar does not match the map there. Set its position again.')
    expect(barText()).not.toContain('REJECTED_')
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Set position')!
    act(() => button.click())
    expect(api.ui.mode).toBe('setPosition')
    expect(barText()).not.toContain('not sure where it is')
  })

  it('leaves any other refusal to the command toast, as before', async () => {
    walk()
    await sends[0].answer({ current_stage: 'execution_failed', failure_reason: 'REJECTED_NAV_REFUSED: operator_has_control' })
    expect(barText()).toBe('')
  })
})

describe('useNavGoal: a walk carries the operator’s Speed tier as its top speed', () => {
  afterEach(() => useDriveSpeedStore.setState({ speeds: {} }))

  function tapAndShow() {
    act(() => api.tools.onToggle('go'))
    act(() => api.input.onTap([2, 1]))
  }

  it('shows Normal’s 0.35 m/s by default and sends it as max_speed_mps', () => {
    useDriveSpeedStore.setState({ speeds: {} })
    render(ROBOT)
    tapAndShow()
    expect(barText()).toContain('up to 0.35 m/s')
    act(() => api.bar.onWalk())
    expect(sends[0]).toMatchObject({ type: 'NAV_GOTO', params: { max_speed_mps: 0.35, map_id: MAP.map_id, floor_id: '0' } })
  })

  it('uses THIS robot’s setting, not another’s', () => {
    useDriveSpeedStore.setState({ speeds: { 'rover-pi': { tier: 'slow', customPct: 60 }, 'rover-jetson': { tier: 'fast', customPct: 60 } } })
    render(ROBOT)
    tapAndShow()
    expect(barText()).toContain('up to 0.20 m/s')
    act(() => api.bar.onWalk())
    expect(sends[0].params).toMatchObject({ max_speed_mps: 0.2 })
  })

  it('follows a change of tier made while the pin waits', () => {
    useDriveSpeedStore.setState({ speeds: {} })
    render(ROBOT)
    tapAndShow()
    act(() => useDriveSpeedStore.getState().setCustomPct('rover-pi', 70)) // 0.425, rounded up
    expect(barText()).toContain('up to 0.43 m/s')
    act(() => api.bar.onWalk())
    expect(sends[0].params).toMatchObject({ max_speed_mps: 0.43 })
  })
})
