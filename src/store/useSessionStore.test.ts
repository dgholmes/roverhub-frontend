import { beforeEach, describe, expect, it } from 'vitest'
import { useSessionStore } from './useSessionStore'

beforeEach(() => {
  useSessionStore.setState({ selectedRobotId: null, cameraFit: 'fit', speakVolume: 100 })
})

/** Robots are discovered at runtime now (see realDataProvider), so nothing knows
 * a valid robot id at startup. selectedRobotId used to be seeded with the mock
 * 'zaezae-x1-001', which matched no real robot -- so every consumer fell through
 * to its `?? robots[0]` fallback, and the displayed robot changed whenever the
 * array order did. */
describe('reconcileSelectedRobot', () => {
  it('starts with nothing selected rather than a mock robot id', () => {
    expect(useSessionStore.getState().selectedRobotId).toBeNull()
  })

  it('selects the first robot once one is discovered', () => {
    useSessionStore.getState().reconcileSelectedRobot(['robot-a', 'robot-b'])
    expect(useSessionStore.getState().selectedRobotId).toBe('robot-a')
  })

  it('leaves a valid selection alone when a second robot appears', () => {
    useSessionStore.getState().reconcileSelectedRobot(['robot-a'])
    useSessionStore.getState().setSelectedRobot('robot-a')
    useSessionStore.getState().reconcileSelectedRobot(['robot-a', 'robot-b'])
    expect(useSessionStore.getState().selectedRobotId).toBe('robot-a')
  })

  it('respects an operator picking the second robot and does not snap back', () => {
    useSessionStore.getState().reconcileSelectedRobot(['robot-a', 'robot-b'])
    useSessionStore.getState().setSelectedRobot('robot-b')
    // Simulates the telemetry stream continuing to call reconcile at ~10Hz.
    for (let i = 0; i < 20; i++) useSessionStore.getState().reconcileSelectedRobot(['robot-a', 'robot-b'])
    expect(useSessionStore.getState().selectedRobotId).toBe('robot-b')
  })

  it('does not write to the store when the selection is already valid', () => {
    useSessionStore.getState().reconcileSelectedRobot(['robot-a'])
    let writes = 0
    const unsubscribe = useSessionStore.subscribe(() => {
      writes += 1
    })
    // Called on every telemetry frame, so a write here would re-render every
    // subscriber continuously.
    for (let i = 0; i < 10; i++) useSessionStore.getState().reconcileSelectedRobot(['robot-a'])
    unsubscribe()
    expect(writes).toBe(0)
  })

  it('re-selects when the selected robot disappears from the fleet', () => {
    useSessionStore.getState().reconcileSelectedRobot(['robot-a', 'robot-b'])
    useSessionStore.getState().setSelectedRobot('robot-b')
    useSessionStore.getState().reconcileSelectedRobot(['robot-a'])
    expect(useSessionStore.getState().selectedRobotId).toBe('robot-a')
  })

  it('clears the selection only when there are no robots at all', () => {
    useSessionStore.getState().reconcileSelectedRobot(['robot-a'])
    useSessionStore.getState().reconcileSelectedRobot([])
    expect(useSessionStore.getState().selectedRobotId).toBeNull()
  })

  it('recovers from a stale selection that matches no robot', () => {
    // e.g. a session that had the old mock id, or a robot renamed out from under it
    useSessionStore.setState({ selectedRobotId: 'zaezae-x1-001' })
    useSessionStore.getState().reconcileSelectedRobot(['robot-a'])
    expect(useSessionStore.getState().selectedRobotId).toBe('robot-a')
  })
})

describe('cameraFit', () => {
  it("defaults to 'fit' so no field of view is cropped away silently", () => {
    // The feed is 4:3 in a wide pane. 'fill' crops the top and bottom, which is
    // the ground ahead, obstacles and the robot's own feet -- losing that
    // without being asked is the worse default for teleoperation.
    expect(useSessionStore.getState().cameraFit).toBe('fit')
  })

  it('switches to fill and back', () => {
    useSessionStore.getState().setCameraFit('fill')
    expect(useSessionStore.getState().cameraFit).toBe('fill')
    useSessionStore.getState().setCameraFit('fit')
    expect(useSessionStore.getState().cameraFit).toBe('fit')
  })

  it('is independent of robot selection churn', () => {
    // It lives in session state so it survives navigating out of LiveOps and
    // back; telemetry-driven reconciliation must not disturb it.
    useSessionStore.getState().setCameraFit('fill')
    useSessionStore.getState().reconcileSelectedRobot(['robot-a', 'robot-b'])
    useSessionStore.getState().reconcileSelectedRobot([])
    expect(useSessionStore.getState().cameraFit).toBe('fill')
  })
})

describe('speakVolume', () => {
  it('defaults to full volume', () => {
    expect(useSessionStore.getState().speakVolume).toBe(100)
  })

  it('is shared session state, so one setting governs every audio path', () => {
    // Previously a per-tab local value, which meant the Play tab and the Say tab
    // each had their own volume and neither applied to Shout.
    useSessionStore.getState().setSpeakVolume(40)
    expect(useSessionStore.getState().speakVolume).toBe(40)
  })

  it('clamps out-of-range values', () => {
    useSessionStore.getState().setSpeakVolume(500)
    expect(useSessionStore.getState().speakVolume).toBe(100)
    useSessionStore.getState().setSpeakVolume(-10)
    expect(useSessionStore.getState().speakVolume).toBe(0)
  })

  it('rounds fractional values, since the wire carries a whole percent', () => {
    useSessionStore.getState().setSpeakVolume(42.7)
    expect(useSessionStore.getState().speakVolume).toBe(43)
  })
})
