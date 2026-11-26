// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { useSessionStore } from '@/store/useSessionStore'
import { RobotLink } from './NameLink'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('RobotLink', () => {
  it("names the robot in Fleet's address and leaves LiveOps' selection alone", () => {
    useSessionStore.setState({ selectedRobotId: 'rover-jetson', selectionPending: false })
    const host = document.createElement('div')
    const root = createRoot(host)
    act(() => root.render(<RobotLink siteId="s" robotId="rover-pi">Rover Pi</RobotLink>))
    act(() => { (host.querySelector('a,button') as HTMLElement).click() })
    expect(window.location.hash).toBe('#/site/s/fleet/rover-pi')
    expect(useSessionStore.getState().selectedRobotId).toBe('rover-jetson')
    act(() => root.unmount())
  })
})
