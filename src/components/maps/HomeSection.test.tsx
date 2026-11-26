// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { ApiError } from '@/lib/realtime/apiError'
import type { MapFloor, SiteMap } from '@/types/maps'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { perms, provider, robots } = vi.hoisted(() => ({
  perms: { editZones: true },
  provider: { setMapHome: vi.fn(), clearMapHome: vi.fn() },
  robots: { current: [] as unknown[] },
}))
vi.mock('@/org/useCan', () => ({ useCan: (id: 'editZones') => perms[id] ?? false }))
vi.mock('@/lib/realtime/dataProvider', () => ({ dataProvider: provider }))
// The robots as the Map page reads them (the provider's, live).
vi.mock('./useProviderRobots', () => ({ useProviderRobots: () => robots.current }))

import { homeFromRobot, HomeSection, useHomeDraft, type HomeDraft } from './HomeSection'

const floor = (home: MapFloor['home'] = null): MapFloor => ({
  index: 0, label: 'Ground', floor_z_m: 0, resolution_m: 0.05, origin_xy_m: [-10, -10], size_cells: [400, 400],
  free_cells: 1, occupied_cells: 1, unknown_cells: 1, content_hash: 'a'.repeat(64), home,
})
const siteMap = (home: MapFloor['home'] = null): SiteMap => ({
  map_id: 'map-a', site_id: 'site-office', name: 'Office', source: 'slam', extent_min: [-10, -10], extent_max: [10, 10],
  created_at: '', updated_at: 'u1', geodetic_anchor: null, floors: [floor(home)], status: 'active', zones: [],
})
const HOME = { x_m: 0.6, y_m: -0.05, yaw_rad: 0, set_at: '2026-11-26T02:00:00Z', set_by: 'u-ana' }

let host: HTMLDivElement
let root: Root
let draft: HomeDraft
const onChanged = vi.fn()
const settle = () => act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve() })
const button = (text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === text)

function Harness({ map }: { map: SiteMap }) {
  draft = useHomeDraft(map, 0)
  return <HomeSection map={map} floorIndex={0} draft={draft} onChanged={onChanged} />
}
const show = (map: SiteMap) => act(() => root.render(<Harness map={map} />))

beforeAll(async () => { await i18n.changeLanguage('en') })
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  perms.editZones = true
  robots.current = []
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.clearAllMocks()
})

describe('HomeSection', () => {
  it('Set home: a press and a drag on the map pick the pose, and Save sends it', async () => {
    const saved = siteMap(HOME)
    provider.setMapHome.mockResolvedValue(saved)
    show(siteMap())
    expect(host.textContent).toContain('No home set on this floor')
    act(() => button('Set home')!.click())
    expect(draft.picking).toBe(true)
    expect(host.textContent).toContain('Press where home is')
    act(() => { draft.onPress([1, 2]); draft.onDrag([1, 3]); draft.onRelease([1, 3]) })
    act(() => button('Save')!.click())
    await settle()
    expect(provider.setMapHome).toHaveBeenCalledWith('map-a', 0, { x_m: 1, y_m: 2, yaw_rad: Math.PI / 2 })
    expect(onChanged).toHaveBeenCalledWith(saved)
    expect(draft.picking).toBe(false)
  })

  it('asks for a heading when the press was not dragged, and sends nothing', () => {
    show(siteMap())
    act(() => button('Set home')!.click())
    act(() => { draft.onPress([1, 2]); draft.onRelease([1, 2]) })
    expect(host.textContent).toContain('Drag from home to the way the robot should face')
    expect(button('Save')).toBeUndefined()
  })

  it("shows the server's refusal as it is, and keeps picking", async () => {
    provider.setMapHome.mockRejectedValue(new ApiError(422, {
      detail: { code: 'home_not_clear', message: 'A wall or unwalked area is within 0.45 m of that spot.' },
    }, 'PUT /maps/home answered 422'))
    show(siteMap())
    act(() => button('Set home')!.click())
    act(() => { draft.onPress([1, 2]); draft.onDrag([2, 2]); draft.onRelease([2, 2]) })
    act(() => button('Save')!.click())
    await settle()
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('A wall or unwalked area is within 0.45 m of that spot.')
    expect(draft.picking).toBe(true)
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('shows a set home, and Remove clears it', async () => {
    const cleared = siteMap()
    provider.clearMapHome.mockResolvedValue(cleared)
    show(siteMap(HOME))
    expect(host.textContent).toContain('x 0.60 m · y -0.05 m · heading 0°')
    expect(button('Move home')).toBeDefined()
    act(() => button('Remove')!.click())
    await settle()
    expect(provider.clearMapHome).toHaveBeenCalledWith('map-a', 0)
    expect(onChanged).toHaveBeenCalledWith(cleared)
  })

  it('offers nothing to change without the zones capability', () => {
    perms.editZones = false
    show(siteMap(HOME))
    expect(host.textContent).toContain('x 0.60 m')
    expect(button('Move home')).toBeUndefined()
    expect(button('Remove')).toBeUndefined()
  })

  it('is the house, its pose and who set it; the hint for none is on hover', () => {
    show(siteMap(HOME))
    expect(host.querySelector('[data-home-pose]')!.textContent).toBe('x 0.60 m · y -0.05 m · heading 0°')
    expect(host.textContent).toContain('Set by u-ana')
    show(siteMap())
    const line = host.querySelector('[data-home-pose]')!.parentElement!
    expect(line.textContent).toBe('No home set on this floor')
    expect(line.getAttribute('title')).toBe('Return home in LiveOps walks the robot here.')
  })
})

// "We should be able to set home using the robot's current location too"
// (operator, 2026-11-26).
describe("Use a robot's position", () => {
  const robot = (id: string, over: { navMap?: string | null; provider?: string; quality?: string; site?: string; x?: number; y?: number; heading?: number } = {}) => ({
    robot_id: id, name: id, site_id: over.site ?? 'site-office',
    bridge: { nav_map_id: over.navMap === undefined ? 'map-a' : over.navMap, nav_map_hash: 'a'.repeat(64) },
    position: {
      x_m: over.x ?? 1.5, y_m: over.y ?? -2, z_m: 0, heading_deg: over.heading ?? 90,
      provider: over.provider ?? 'slam', quality: over.quality ?? 'localized',
    },
  })
  const offered = () => [...host.querySelectorAll<HTMLElement>('[data-home-from-robot]')].map((b) => b.dataset.homeFromRobot)

  it('is offered only for robots placed on this floor: this map, localised, at this site', () => {
    robots.current = [
      robot('rover-pi'),
      robot('rover-other-map', { navMap: 'map-b' }),
      robot('rover-no-map', { navMap: null }),
      robot('rover-odometry', { provider: 'dead_reckoning' }),
      robot('rover-lost', { quality: 'lost' }),
      robot('rover-elsewhere', { site: 'site-other' }),
    ]
    show(siteMap())
    expect(offered()).toEqual(['rover-pi'])
    expect(button("Use rover-pi's position")).toBeDefined()
  })

  it('is not offered without the zones capability', () => {
    perms.editZones = false
    robots.current = [robot('rover-pi')]
    show(siteMap())
    expect(offered()).toEqual([])
  })

  it("shows the robot's pose before saving, with its heading turned into yaw, and Save sends it", async () => {
    const saved = siteMap(HOME)
    provider.setMapHome.mockResolvedValue(saved)
    robots.current = [robot('rover-pi', { x: 1.5, y: -2, heading: 90 })]
    show(siteMap())
    act(() => button("Use rover-pi's position")!.click())
    expect(draft.picking).toBe(true)
    expect(draft.robot).toBe('rover-pi')
    expect(host.querySelector('[data-home-picked]')!.textContent).toBe("rover-pi's position: x 1.50 m · y -2.00 m · heading 90°")
    expect(provider.setMapHome).not.toHaveBeenCalled()
    act(() => button('Save')!.click())
    await settle()
    expect(provider.setMapHome).toHaveBeenCalledWith('map-a', 0, { x_m: 1.5, y_m: -2, yaw_rad: Math.PI / 2 })
    expect(onChanged).toHaveBeenCalledWith(saved)
  })

  it('turns degrees anticlockwise from +x into radians in [-pi, pi)', () => {
    expect(homeFromRobot({ x_m: 0, y_m: 0, heading_deg: 0 }).yaw_rad).toBe(0)
    expect(homeFromRobot({ x_m: 0, y_m: 0, heading_deg: 90 }).yaw_rad).toBeCloseTo(Math.PI / 2, 12)
    expect(homeFromRobot({ x_m: 0, y_m: 0, heading_deg: -45 }).yaw_rad).toBeCloseTo(-Math.PI / 4, 12)
    expect(homeFromRobot({ x_m: 0, y_m: 0, heading_deg: 270 }).yaw_rad).toBeCloseTo(-Math.PI / 2, 12)
    expect(homeFromRobot({ x_m: 0, y_m: 0, heading_deg: 180 }).yaw_rad).toBeCloseTo(-Math.PI, 12)
    expect(homeFromRobot({ x_m: 2, y_m: 3, heading_deg: 30 })).toMatchObject({ x_m: 2, y_m: 3 })
  })

  it("shows the server's 422 sentence exactly, as for a plan pick", async () => {
    provider.setMapHome.mockRejectedValue(new ApiError(422, {
      detail: { code: 'home_not_clear', message: 'A wall or unwalked area is within 0.45 m of that spot.' },
    }, 'PUT /maps/home answered 422'))
    robots.current = [robot('rover-pi')]
    show(siteMap())
    act(() => button("Use rover-pi's position")!.click())
    act(() => button('Save')!.click())
    await settle()
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('A wall or unwalked area is within 0.45 m of that spot.')
    expect(draft.picking).toBe(true)
    expect(onChanged).not.toHaveBeenCalled()
  })

  it('says so when the robot stands outside the floor, and offers no Save', () => {
    robots.current = [robot('rover-pi', { x: 50, y: 50 })]
    show(siteMap())
    act(() => button("Use rover-pi's position")!.click())
    expect(host.textContent).toContain('That spot is outside this floor.')
    expect(button('Save')).toBeUndefined()
  })

  it('while picking on the plan, the robot is one press away; Cancel drops either pick', () => {
    robots.current = [robot('rover-pi')]
    show(siteMap())
    act(() => button('Set home')!.click())
    act(() => button("Use rover-pi's position")!.click())
    expect(draft.robot).toBe('rover-pi')
    act(() => button('Cancel')!.click())
    expect(draft.picking).toBe(false)
    expect(draft.robot).toBeNull()
  })
})
