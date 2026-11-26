// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { useSessionStore } from '@/store/useSessionStore'
import { openRobot } from './navigation'

beforeEach(() => {
  window.location.hash = ''
  useSessionStore.setState({ selectedRobotId: 'rover-jetson', selectionPending: false })
})

describe('openRobot', () => {
  it('opens a robot in Fleet by naming it, and the tab when one is given', () => {
    openRobot('s', 'rover-pi', 'Fleet', 'motors')
    expect(window.location.hash).toBe('#/site/s/fleet/rover-pi/motors')
    openRobot('s', 'rover-pi')
    expect(window.location.hash).toBe('#/site/s/fleet/rover-pi')
    expect(useSessionStore.getState().activeSiteId).toBe('s')
  })

  it('leaves LiveOps\' robot alone when browsing in Fleet, and sets it for LiveOps', () => {
    openRobot('s', 'rover-pi', 'Fleet')
    expect(useSessionStore.getState().selectedRobotId).toBe('rover-jetson')
    openRobot('s', 'rover-pi', 'LiveOps')
    expect(useSessionStore.getState().selectedRobotId).toBe('rover-pi')
    expect(window.location.hash).toBe('#/site/s/liveops')
  })
})
