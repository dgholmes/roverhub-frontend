// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { recall, remember, viewKey } from '@/lib/viewMemory'
import { DISCOVERY_GRACE_MS, initialSelectedRobot, initialViewMode } from './useSessionStore'

/** 2026-11-26: a reload on a fresh tab fell back to the offline rover-pi
 * instead of the rover-jetson the operator had selected, and they took it for
 * a lost connection. The selection lived in sessionStorage, which a new tab or
 * a reopened browser pane does not have; the LiveOps layout and camera fit
 * were not kept at all. These load the store module afresh, as a reload does. */

const isString = (v: unknown): v is string => typeof v === 'string'

// Every reload imports the store's module graph afresh: well under a second
// alone, but past the 5 s default while the rest of the suite is collecting
// in parallel (two tests timed out in the first full run, 2026-11-26). The
// same load, and the same answer, as mocks/mockRunSimulation.test.ts.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

async function reload(url: string) {
  window.history.replaceState(null, '', url)
  vi.resetModules()
  const mod = await import('./useSessionStore')
  return mod.useSessionStore
}

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
})

describe('initialSelectedRobot with a remembered robot', () => {
  it('falls back to the robot remembered for the site', () => {
    expect(initialSelectedRobot('', null, 'rover-jetson')).toBe('rover-jetson')
  })

  it('puts the address, then this tab, ahead of it', () => {
    expect(initialSelectedRobot('?robot=a', 'b', 'c')).toBe('a')
    expect(initialSelectedRobot('', 'b', 'c')).toBe('b')
  })
})

describe('initialViewMode with a remembered layout', () => {
  it('prefers the remembered layout to the build default', () => {
    expect(initialViewMode('', 'map', 'grid')).toBe('grid')
  })

  it('still lets ?view= win', () => {
    expect(initialViewMode('?view=split', 'map', 'grid')).toBe('split')
  })

  it('ignores an unknown remembered layout', () => {
    expect(initialViewMode('', 'map', 'bogus')).toBe('map')
    expect(initialViewMode('', undefined, 'bogus')).toBe('stacked')
  })
})

describe('the selected robot survives a reload in a new tab', () => {
  it('opens on the robot last chosen at the site in the address, and waits for it', async () => {
    remember(viewKey('robot', 'site-b'), 'rover-jetson')
    const store = await reload('/#/site/site-b/liveops')
    expect(store.getState().selectedRobotId).toBe('rover-jetson')
    expect(store.getState().selectionPending).toBe(true)
    // SiteShell's mount: the hash's site differs from the module-load default.
    store.getState().setActiveSite('site-b')
    store.getState().reconcileSelectedRobot(['rover-pi'], 0)
    store.getState().reconcileSelectedRobot(['rover-pi'], 5000)
    expect(store.getState().selectedRobotId).toBe('rover-jetson')
    store.getState().reconcileSelectedRobot(['rover-pi', 'rover-jetson'], 6000)
    expect(store.getState().selectedRobotId).toBe('rover-jetson')
    expect(store.getState().selectionPending).toBe(false)
  })

  it('lets this tab beat the remembered robot, also through the first move onto the site', async () => {
    remember(viewKey('robot', 'site-b'), 'rover-pi')
    sessionStorage.setItem('rh.selectedRobot', 'rover-jetson')
    const store = await reload('/#/site/site-b/liveops')
    expect(store.getState().activeSiteId).not.toBe('site-b')
    store.getState().setActiveSite('site-b')
    expect(store.getState().selectedRobotId).toBe('rover-jetson')
  })

  it('lets ?robot= beat the remembered robot, also through the first move onto the site', async () => {
    remember(viewKey('robot', 'site-b'), 'rover-pi')
    const store = await reload('/?robot=rover-jetson#/site/site-b/liveops')
    store.getState().setActiveSite('site-b')
    store.getState().setActiveSite('site-b')
    expect(store.getState().selectedRobotId).toBe('rover-jetson')
  })

  it('ignores the remembered robot on a route that names no site', async () => {
    remember(viewKey('robot', 'site-b'), 'rover-jetson')
    const store = await reload('/#/org/dashboard')
    expect(store.getState().selectedRobotId).toBeNull()
  })

  it('falls back to the first robot when the remembered one no longer exists', async () => {
    remember(viewKey('robot', 'site-b'), 'gone-robot')
    const store = await reload('/#/site/site-b/liveops')
    store.getState().setActiveSite('site-b')
    store.getState().reconcileSelectedRobot(['rover-pi'], 1000)
    expect(store.getState().selectedRobotId).toBe('gone-robot')
    store.getState().reconcileSelectedRobot(['rover-pi'], 1000 + DISCOVERY_GRACE_MS)
    expect(store.getState().selectedRobotId).toBe('rover-pi')
    expect(recall(viewKey('robot', 'site-b'), isString)).toBe('rover-pi')
  })
})

describe('remembering the selected robot per site', () => {
  it('remembers a choice for the active site, and keeps the tab and the address on it', async () => {
    const store = await reload('/#/site/site-b/liveops')
    store.getState().setActiveSite('site-b')
    store.getState().setSelectedRobot('rover-jetson')
    expect(recall(viewKey('robot', 'site-b'), isString)).toBe('rover-jetson')
    expect(sessionStorage.getItem('rh.selectedRobot')).toBe('rover-jetson')
    expect(new URLSearchParams(window.location.search).get('robot')).toBe('rover-jetson')
  })

  it("switching site moves to the robot remembered there, and back", async () => {
    const store = await reload('/#/site/site-a/liveops')
    store.getState().setActiveSite('site-a')
    store.getState().setSelectedRobot('a-1')
    store.getState().setActiveSite('site-b')
    store.getState().setSelectedRobot('b-1')
    store.getState().setActiveSite('site-a')
    expect(store.getState().selectedRobotId).toBe('a-1')
    expect(store.getState().selectionPending).toBe(true)
    store.getState().setActiveSite('site-b')
    expect(store.getState().selectedRobotId).toBe('b-1')
  })

  it('leaves a site with nothing remembered to reconciliation, without overwriting the old site', async () => {
    const store = await reload('/#/site/site-a/liveops')
    store.getState().setActiveSite('site-a')
    store.getState().reconcileSelectedRobot(['a-1'], 0)
    store.getState().setActiveSite('site-c')
    expect(store.getState().selectedRobotId).toBe('a-1')
    store.getState().reconcileSelectedRobot(['c-1'], 1)
    expect(store.getState().selectedRobotId).toBe('c-1')
    expect(recall(viewKey('robot', 'site-c'), isString)).toBe('c-1')
    expect(recall(viewKey('robot', 'site-a'), isString)).toBe('a-1')
  })

  it('does not adopt a site robot chosen before reconciliation re-picked at another site', async () => {
    // Reconciliation picked at site-c, so going back to site-a must not keep
    // site-c's robot on the grounds that the selection "belongs" to site-a.
    const store = await reload('/#/site/site-a/liveops')
    store.getState().setActiveSite('site-a')
    store.getState().setSelectedRobot('a-1')
    store.getState().setActiveSite('site-c')
    store.getState().reconcileSelectedRobot(['c-1'], 0)
    store.getState().setActiveSite('site-a')
    expect(store.getState().selectedRobotId).toBe('a-1')
  })
})

describe('LiveOps layout and camera fit survive a reload', () => {
  it('reopens on the layout last chosen', async () => {
    let store = await reload('/')
    store.getState().setViewMode('grid')
    store = await reload('/')
    expect(store.getState().viewMode).toBe('grid')
  })

  it('lets ?view= beat the remembered layout', async () => {
    remember(viewKey('liveops', 'layout'), 'grid')
    const store = await reload('/?view=split')
    expect(store.getState().viewMode).toBe('split')
  })

  it('ignores a remembered layout this build does not know', async () => {
    remember(viewKey('liveops', 'layout'), 'bogus')
    const store = await reload('/')
    // Whatever the build default is (a developer's .env may set one).
    expect(store.getState().viewMode).toBe(initialViewMode('', import.meta.env.VITE_DEFAULT_VIEW))
  })

  it('reopens on the camera fit last chosen', async () => {
    let store = await reload('/')
    store.getState().setCameraFit('fill')
    store = await reload('/')
    expect(store.getState().cameraFit).toBe('fill')
  })

  it("reads anything but 'fit' or 'fill' as the default 'fit'", async () => {
    remember(viewKey('liveops', 'cameraFit'), 'stretch')
    const store = await reload('/')
    expect(store.getState().cameraFit).toBe('fit')
  })
})
