// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'

// The shells stand in: what is pinned here is the address AppShell routes on.
vi.mock('./SiteShell', () => ({
  SiteShell: ({ siteId, workspace }: { siteId: string; workspace: string }) => <i data-site={siteId} data-ws={workspace} />,
}))
vi.mock('./OrgShell', () => ({ OrgShell: () => <i data-org="" /> }))

import { AppShell, currentRoute } from './AppShell'
import { useSessionStore } from '@/store/useSessionStore'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  window.history.replaceState(null, '', '#/')
  useSessionStore.setState({ selectedRobotId: null })
})

// Missions › Maps moved to the Map workspace on 2026-11-26. Bookmarks, links
// in old messages and the survey page's links still name it.
describe('old Missions › Maps links', () => {
  it('are replaced in place with their Map equivalent, adding no step for Back', () => {
    window.history.replaceState(null, '', '#/site/s1/missions/maps/view/m1')
    const before = window.history.length
    expect(currentRoute()).toEqual({ kind: 'site', siteId: 's1', workspace: 'Map' })
    expect(window.location.hash).toBe('#/site/s1/map/m1')
    expect(window.history.length).toBe(before)
  })

  it('open the Map workspace on load', () => {
    window.history.replaceState(null, '', '#/site/s1/missions/maps/edit/m1')
    act(() => root.render(<AppShell />))
    expect(host.querySelector('[data-ws]')?.getAttribute('data-ws')).toBe('Map')
    expect(window.location.hash).toBe('#/site/s1/map/m1/edit')
  })

  it('open the Map workspace when followed while the console is open', () => {
    window.history.replaceState(null, '', '#/site/s1/missions')
    act(() => root.render(<AppShell />))
    expect(host.querySelector('[data-ws]')?.getAttribute('data-ws')).toBe('Missions')
    act(() => {
      window.history.replaceState(null, '', '#/site/s1/missions/maps/survey/rover-pi')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(host.querySelector('[data-ws]')?.getAttribute('data-ws')).toBe('Map')
    expect(window.location.hash).toBe('#/site/s1/map/survey/rover-pi')
  })

  it('leave Missions and Schedule links alone', () => {
    window.history.replaceState(null, '', '#/site/s1/missions/schedule')
    expect(currentRoute()).toEqual({ kind: 'site', siteId: 's1', workspace: 'Missions' })
    expect(window.location.hash).toBe('#/site/s1/missions/schedule')
  })
})

// Systems folded into Fleet's robot tabs on 2026-11-26. The bell's lidar alert
// and old bookmarks still name it.
describe('old Systems links', () => {
  it('are replaced in place with the robot tab they meant, adding no step for Back', () => {
    window.history.replaceState(null, '', '#/site/s1/systems/sensors?robot=rover-pi')
    const before = window.history.length
    expect(currentRoute()).toEqual({ kind: 'site', siteId: 's1', workspace: 'Fleet' })
    expect(window.location.hash).toBe('#/site/s1/fleet/robots/rover-pi/sensors')
    expect(window.history.length).toBe(before)
  })

  it('fall back to the robot the console is showing', () => {
    useSessionStore.setState({ selectedRobotId: 'rover-jetson' })
    window.history.replaceState(null, '', '#/site/s1/systems')
    act(() => root.render(<AppShell />))
    expect(host.querySelector('[data-ws]')?.getAttribute('data-ws')).toBe('Fleet')
    expect(window.location.hash).toBe('#/site/s1/fleet/robots/rover-jetson/logs')
  })

  it('open Fleet when followed while the console is open', () => {
    window.history.replaceState(null, '', '#/site/s1/missions')
    act(() => root.render(<AppShell />))
    act(() => {
      window.history.replaceState(null, '', '#/site/s1/systems/sensors?robot=rover-pi')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(host.querySelector('[data-ws]')?.getAttribute('data-ws')).toBe('Fleet')
    expect(window.location.hash).toBe('#/site/s1/fleet/robots/rover-pi/sensors')
  })
})
