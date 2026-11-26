// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { ApiError } from '@/lib/realtime/apiError'
import type { MapFloor, SiteMap } from '@/types/maps'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { perms, provider } = vi.hoisted(() => ({
  perms: { editZones: true },
  provider: { setMapHome: vi.fn(), clearMapHome: vi.fn() },
}))
vi.mock('@/org/useCan', () => ({ useCan: (id: 'editZones') => perms[id] ?? false }))
vi.mock('@/lib/realtime/dataProvider', () => ({ dataProvider: provider }))

import { HomeSection, useHomeDraft, type HomeDraft } from './HomeSection'

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
})
