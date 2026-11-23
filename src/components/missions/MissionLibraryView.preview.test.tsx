// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import { useAuthStore } from '@/lib/auth/authStore'
import { DEV_USER, type AuthUser } from '@/lib/auth/types'
import { setUserNamesFetcherForTests } from '@/lib/auth/useUserNames'
import { mockMaps } from '@/mocks/maps'
import type { MissionLibraryEntry, MissionWaypoint } from '@/types'
import type { MapZone, SiteMap } from '@/types/maps'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The real RoutePreviewMap, over stand-ins for Leaflet and its layers: a test
// has no live Leaflet map. Each stand-in carries the props that matter.
const seen = vi.hoisted(() => ({ zones: [] as unknown[], fitKey: '' }))
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children }: { children: ReactNode }) => <div data-leaflet>{children}</div>,
}))
vi.mock('@/components/liveops/map/MapCanvas', () => ({ MAP_BOUNDS: [[-50, -50], [50, 50]] }))
vi.mock('@/components/liveops/map/GridLayer', () => ({ GridLayer: () => <i data-grid /> }))
vi.mock('@/components/liveops/map/GeofenceLayer', () => ({
  GeofenceLayer: ({ zones }: { zones: unknown[] }) => { seen.zones = zones; return null },
}))
vi.mock('@/components/liveops/map/NoGoZoneLayer', () => ({ NoGoZoneLayer: () => null }))
vi.mock('@/components/liveops/map/FloorplanLayer', () => ({
  FloorplanLayer: ({ map, floorIndex }: { map: SiteMap; floorIndex: number }) => <i data-floorplan={`${map.map_id}/${floorIndex}`} />,
}))
vi.mock('@/components/liveops/map/FloorPicker', () => ({ FloorPicker: () => <i data-floor-picker /> }))
vi.mock('./route-editor/EditableRouteLayer', () => ({ EditableRouteLayer: () => <i data-route /> }))
vi.mock('./route-editor/FitToRoute', () => ({
  FitToRoute: ({ fitKey }: { fitKey: string }) => { seen.fitKey = fitKey; return null },
}))
vi.mock('./visual-program/ProgramPreview', () => ({ ProgramPreview: () => <i data-preview="program" /> }))

import { dataProvider } from '@/lib/realtime/dataProvider'
import { MissionLibraryView } from './MissionLibraryView'

const zone = { zone_id: 'z1', kind: 'no_go', name: 'Stairs', polygon: [[0, 0], [1, 0], [1, 1]] } as unknown as MapZone
const base: SiteMap = mockMaps[0]
const office: SiteMap = {
  ...base, map_id: 'map-office', name: 'Office 3F', zones: [zone],
  floors: [base.floors[0], { ...base.floors[0], index: 1, label: 'Upper', floor_z_m: 3.2 }],
}

const wp = (id: string, z_m: number | null): MissionWaypoint => ({
  waypoint_id: id, label: id, x_m: 1, y_m: 1, z_m, heading_deg: null, tolerance_m: 0.5, actions: [], status: 'pending',
} as MissionWaypoint)

const mission = (over: Partial<MissionLibraryEntry>): MissionLibraryEntry => ({
  mission_id: 'm', name: 'M', type: 'patrol', kind: 'route', version: 1, creator: 'MinJae Joo', updated_at: '2026-11-01T00:00:00Z',
  map_id: office.map_id, site_id: 's1', waypoints: [], segments: [], ...over,
})

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  seen.zones = []
  seen.fitKey = ''
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  setUserNamesFetcherForTests(null)
  useAuthStore.setState({ status: 'off', authEnabled: false, user: DEV_USER, token: null, expiresAt: null, notice: null })
})

function render(missions: MissionLibraryEntry[], maps: SiteMap[] | null) {
  act(() => root.render(
    <MissionLibraryView siteId="s1" missions={missions} maps={maps} onOpen={() => {}} onSchedule={() => {}} onShowTasks={() => {}} />,
  ))
}
const floorplan = () => host.querySelector('[data-floorplan]')?.getAttribute('data-floorplan') ?? null
const picker = () => host.querySelector('[data-floor-picker]')
const pick = (name: string) => act(() => {
  ;[...host.querySelectorAll<HTMLElement>('[role="option"]')].find((c) => c.textContent?.includes(name))!.click()
})
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve() })

describe('the preview draws the mission\'s map', () => {
  it('draws the floorplan and the map\'s own zones for a route whose map the site has', () => {
    render([mission({ mission_id: 'a', name: 'Night patrol', waypoints: [wp('w1', null)] })], [office])
    expect(floorplan()).toBe('map-office/0')
    expect(seen.zones).toBe(office.zones)
    expect(host.querySelector('[data-grid]')).not.toBeNull()
    expect(host.querySelector('[data-route]')).not.toBeNull()
  })

  it('opens on the floor the route starts on', () => {
    render([mission({ mission_id: 'a', name: 'Upstairs', waypoints: [wp('w1', 3.2)] })], [office])
    expect(floorplan()).toBe('map-office/1')
    // One floor's route: nothing to pick.
    expect(picker()).toBeNull()
  })

  it('offers a floor picker only for a route over two floors', () => {
    render([mission({ mission_id: 'a', name: 'Both', waypoints: [wp('w1', 0), wp('w2', 3.2)] })], [office])
    expect(floorplan()).toBe('map-office/0')
    expect(picker()).not.toBeNull()
  })

  it('draws no floorplan without a map, a missing one, or before the maps are known, and keeps the sample site', () => {
    const sample = dataProvider.sampleSite().zones
    for (const [m, maps] of [
      [mission({ mission_id: 'n', name: 'No map', map_id: '' }), [office]],
      [mission({ mission_id: 'x', name: 'Lost', map_id: 'map-deleted' }), [office]],
      [mission({ mission_id: 'u', name: 'Unknown' }), null],
    ] as const) {
      render([m], maps as SiteMap[] | null)
      expect(floorplan()).toBeNull()
      expect(seen.zones).toEqual(sample)
      expect(host.querySelector('[data-grid]')).not.toBeNull()
    }
  })

  it('fits again when the mission or its map changes', () => {
    const a = mission({ mission_id: 'a', name: 'Alpha', updated_at: '2026-11-04T00:00:00Z' })
    const b = mission({ mission_id: 'b', name: 'Bravo', map_id: '', updated_at: '2026-11-03T00:00:00Z' })
    render([a, b], [office])
    const first = seen.fitKey
    pick('Bravo')
    expect(seen.fitKey).not.toBe(first)
    const second = seen.fitKey
    render([a, { ...b, map_id: office.map_id }], [office])
    expect(seen.fitKey).not.toBe(second)
  })
})

describe('the preview\'s byline', () => {
  const me = {
    user_id: 'u-me', username: 'me', display_name: 'Jin', org_role: 'member', site_roles: { '*': 'engineer' }, audit_access: false, disabled: false,
  } as AuthUser
  const byline = () => host.textContent ?? ''

  it('names the creator when the backend knows the id', async () => {
    const fetcher = vi.fn().mockResolvedValue({ 'user-56306e3a014d': 'Hana Kim' })
    setUserNamesFetcherForTests(fetcher)
    useAuthStore.setState({ status: 'signedIn', authEnabled: true, user: me, token: 't1', expiresAt: null, notice: null })
    render([mission({ mission_id: 'a', name: 'Night patrol', creator: 'user-56306e3a014d' })], [office])
    await settle()
    expect(fetcher).toHaveBeenCalledWith(['user-56306e3a014d'])
    expect(byline()).toContain('Hana Kim')
    expect(byline()).not.toContain('user-56306e3a014d')
  })

  it('shows the creator as it is when the id is not known', async () => {
    setUserNamesFetcherForTests(vi.fn().mockResolvedValue({}))
    useAuthStore.setState({ status: 'signedIn', authEnabled: true, user: me, token: 't1', expiresAt: null, notice: null })
    render([mission({ mission_id: 'a', name: 'Night patrol', creator: 'user-gone' })], [office])
    await settle()
    expect(byline()).toContain('user-gone')
  })

  it('shows a mock creator\'s plain name with sign-in off, asking nothing', async () => {
    const fetcher = vi.fn()
    setUserNamesFetcherForTests(fetcher)
    render([mission({ mission_id: 'a', name: 'Night patrol', creator: 'MinJae Joo' })], [office])
    await settle()
    expect(fetcher).not.toHaveBeenCalled()
    expect(byline()).toContain('MinJae Joo')
  })
})
