// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { create } from 'zustand'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import { mockMaps } from '@/mocks/maps'
import { ApiError } from '@/lib/realtime/apiError'
import type { RobotState } from '@/types'
import type { Site as SiteRecord } from '@/types/sites'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { provider, admin } = vi.hoisted(() => ({
  provider: {
    listSites: vi.fn(),
    createSite: vi.fn(),
    updateSite: vi.fn(),
    deleteSite: vi.fn(),
    listMaps: vi.fn(),
    mapArtifactUrl: vi.fn(() => ''),
  },
  admin: { yes: true },
}))
vi.mock('@/lib/realtime/dataProvider', () => ({ dataProvider: provider }))
vi.mock('@/org/useOrgAdmin', () => ({ useOrgAdmin: () => admin.yes }))
// The live store, cut down to what the org pages read.
vi.mock('@/store/useLiveOpsStore', () => ({
  useLiveOpsStore: create(() => ({ robots: [] as RobotState[], missions: {} })),
}))
vi.mock('./MoveRobotSite', () => ({ MoveSiteAction: () => null }))
vi.mock('@/org/navigation', () => ({ enterSite: vi.fn(), openRobot: vi.fn() }))

import { SitesPage } from './SitesPage'
import { useSessionStore } from '@/store/useSessionStore'
import { useSiteMapsStore } from '@/org/useSiteMaps'
import { hashForMap } from '@/app/routes'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'

const setRobots = (robots: RobotState[]) => useLiveOpsStore.setState({ robots } as never)

const record = (over: Partial<SiteRecord> = {}): SiteRecord => ({
  site_id: 'site-north-yard', name: 'North Yard', timezone: 'Asia/Seoul', address: '12 Harbour-ro', location: null,
  created_at: '2026-11-26T00:00:00Z', updated_at: '2026-11-26T00:00:00Z', ...over,
})
const VENUE = mockMaps[0]
/** A robot at North Yard on the venue map, current version, placed. */
const onVenue: RobotState = {
  ...initialRobots[0], robot_id: 'rvr-1', name: 'RVR-01', site_id: 'site-north-yard',
  bridge: { ...initialRobots[0].bridge!, nav_map_id: VENUE.map_id, nav_map_hash: VENUE.floors[0].content_hash, nav_localised: true },
}

let host: HTMLDivElement
let root: Root
const page = () => document.body.textContent ?? ''
const button = (name: string) =>
  [...document.body.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)
const tab = (name: string) =>
  [...document.body.querySelectorAll('[role="tab"]')].find((b) => b.textContent?.trim() === name) as HTMLElement | undefined
const click = (el: Element | undefined) => act(() => { (el as HTMLElement).click() })
const settle = () => act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve() })
const type = (id: string, value: string) => act(() => {
  const el = document.getElementById(id) as HTMLInputElement
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
const render = async () => {
  act(() => root.render(<SitesPage />))
  await settle()
}

beforeAll(async () => { await i18n.changeLanguage('en') })
beforeEach(async () => {
  for (const f of Object.values(provider)) f.mockReset()
  provider.mapArtifactUrl.mockReturnValue('')
  provider.listMaps.mockImplementation(async (siteId: string) => mockMaps.filter((m) => m.site_id === siteId))
  provider.listSites.mockResolvedValue([record(), record({ site_id: 'site-plant-3', name: 'Plant 3', address: null })])
  admin.yes = true
  setRobots([onVenue])
  useSiteMapsStore.setState({ bySite: {} })
  useSessionStore.setState({ sites: [], sitesStatus: 'idle', activeSiteId: 'site-north-yard' })
  await useSessionStore.getState().loadSites()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('Organization › Sites', () => {
  it('shows each site with its floor map, and opens on the Maps tab', async () => {
    await render()
    // North Yard has maps: its card draws one; Plant 3 has none and says so.
    const yard = document.querySelector('[data-site-card="site-north-yard"] [data-thumbnail]')!
    expect(yard.getAttribute('data-thumbnail')).toBe('sketch')
    expect(document.querySelector('[data-site-card="site-plant-3"] [data-thumbnail]')!.getAttribute('data-thumbnail')).toBe('none')
    expect(tab('Maps')!.getAttribute('aria-selected')).toBe('true')
    const row = document.querySelector(`[data-site-map="${VENUE.map_id}"]`)!
    expect(row.textContent).toContain('Venue survey')
    expect(row.textContent).toContain('Active')
    expect(row.textContent).toContain('1 floor')
    expect(row.textContent).toContain('RVR-01') // the robot that has it
    const open = [...row.querySelectorAll('a')].find((a) => a.textContent === 'Open map')!
    expect(open.getAttribute('href')).toBe(hashForMap('site-north-yard', VENUE.map_id))
    // The stale stubs are gone.
    expect(page()).not.toContain('needs site map')
    expect(page()).not.toContain('Docks')
  })

  it('Robots tab: each robot with its map, version and whether it is placed', async () => {
    await render()
    click(tab('Robots'))
    const row = document.querySelector('[data-site-robot="rvr-1"]')!
    expect(row.textContent).toContain('Venue survey')
    expect(row.textContent).toContain('Same version')
    expect(row.textContent).toContain('Placed')
  })

  it('Settings tab: Edit site saves through PATCH and shows the new name', async () => {
    provider.updateSite.mockImplementation(async (_id: string, patch: { name: string }) => record({ ...patch, address: '12 Harbour-ro' }))
    await render()
    click(tab('Settings'))
    expect(page()).toContain('12 Harbour-ro')
    click(button('Edit site'))
    type('site-name', 'North Yard 2')
    click(button('Save'))
    await settle()
    expect(provider.updateSite).toHaveBeenCalledWith('site-north-yard', {
      name: 'North Yard 2', timezone: 'Asia/Seoul', address: '12 Harbour-ro', location: null,
    })
    expect(document.querySelector('[data-site-panel]')!.textContent).toContain('North Yard 2')
  })

  it('Delete site shows the backend’s 409 reason and keeps the site', async () => {
    provider.deleteSite.mockRejectedValue(new ApiError(409, { detail: 'robots are registered at this site: rvr-1' }, 'DELETE /sites answered 409'))
    await render()
    click(tab('Settings'))
    click(button('Delete site'))
    click(button('Delete'))
    await settle()
    expect(provider.deleteSite).toHaveBeenCalledWith('site-north-yard')
    const alert = document.querySelector('[role="alert"]')!
    expect(alert.textContent).toContain('Not deleted.')
    expect(alert.textContent).toContain('robots are registered at this site: rvr-1')
    expect(useSessionStore.getState().sites.some((s) => s.id === 'site-north-yard')).toBe(true)
  })

  it('reads a structured 409 that names the robots and maps', async () => {
    provider.deleteSite.mockRejectedValue(new ApiError(409, { detail: { robots: ['rvr-1'], maps: [{ map_id: 'map-venue-survey', name: 'Venue survey' }] } }, 'x'))
    await render()
    click(tab('Settings'))
    click(button('Delete site'))
    click(button('Delete'))
    await settle()
    const alert = document.querySelector('[role="alert"]')!.textContent
    expect(alert).toContain('Robots there: rvr-1.')
    expect(alert).toContain('Maps there: Venue survey.')
  })

  it('New site persists through POST and selects the new site', async () => {
    provider.createSite.mockImplementation(async (c: { name: string; timezone: string }) => record({ site_id: 'site-west-depot', ...c, address: null }))
    await render()
    click(button('New site'))
    type('site-name', 'West Depot')
    type('site-tz', 'Asia/Seoul')
    click(button('Create site'))
    await settle()
    expect(provider.createSite).toHaveBeenCalledWith({ name: 'West Depot', timezone: 'Asia/Seoul', address: null, location: null })
    expect(document.querySelector('[data-site-card="site-west-depot"]')).not.toBeNull()
    expect(document.querySelector('[data-site-panel]')!.getAttribute('data-site-panel')).toBe('site-west-depot')
  })

  it('New site checks the timezone before asking the backend, and shows a refusal in the backend’s words', async () => {
    provider.createSite.mockRejectedValue(new ApiError(409, { detail: 'site site-west-depot already exists' }, 'x'))
    await render()
    click(button('New site'))
    type('site-name', 'West Depot')
    type('site-tz', 'Mars/Base')
    click(button('Create site'))
    await settle()
    expect(provider.createSite).not.toHaveBeenCalled()
    expect(page()).toContain('“Mars/Base” isn’t a timezone')
    type('site-tz', 'UTC')
    click(button('Create site'))
    await settle()
    expect(page()).toContain('That site ID is taken. site site-west-depot already exists')
  })

  it('a site known only from its robots can be saved as a site under the same id', async () => {
    setRobots([onVenue, { ...onVenue, robot_id: 'rvr-9', name: 'RVR-09', site_id: 'site-yard' }])
    provider.createSite.mockImplementation(async (c: { site_id: string; name: string }) => record({ ...c, timezone: 'UTC' }))
    await render()
    click(document.querySelector('[data-site-card="site-yard"]') ?? undefined)
    click(tab('Settings'))
    expect(page()).toContain('known only because a robot reports to it')
    expect(button('Delete site')).toBeUndefined()
    click(button('Save as a site'))
    type('site-name', 'The Yard')
    click(button('Create site'))
    await settle()
    expect(provider.createSite).toHaveBeenCalledWith(expect.objectContaining({ site_id: 'site-yard', name: 'The Yard' }))
  })

  it('is read-only to someone who is not an org owner or admin, and says so', async () => {
    admin.yes = false
    await render()
    expect(button('New site')!.disabled).toBe(true)
    click(tab('Settings'))
    expect(button('Edit site')!.disabled).toBe(true)
    expect(button('Delete site')!.disabled).toBe(true)
    expect(page()).toContain('Only organization owners and admins can create, edit or delete sites.')
  })

  it('says when the sites could not be loaded, and still lists the sites robots report', async () => {
    provider.listSites.mockRejectedValue(new ApiError(404, null, 'GET /sites answered 404'))
    useSessionStore.setState({ sites: [] })
    await useSessionStore.getState().loadSites()
    await render()
    expect(page()).toContain('Sites could not be loaded (GET /sites answered 404)')
    expect(document.querySelector('[data-site-card="site-north-yard"]')).not.toBeNull()
    provider.listSites.mockResolvedValue([record()])
    click(button('Try again'))
    await settle()
    expect(page()).not.toContain('Sites could not be loaded')
  })
})
