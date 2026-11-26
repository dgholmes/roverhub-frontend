// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { useSessionStore } from '@/store/useSessionStore'
import { MAP_SLOT } from '@/liveops/gridSlots'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The map and the cameras are stand-ins: what is pinned here is which robot
// the map is given and how it is asked to draw, not Leaflet or video.
vi.mock('@/components/liveops/map/MapCanvas', () => ({
  MapCanvas: (p: { robot: { robot_id: string }; variant?: string; planOnly?: boolean }) => (
    <span data-testid="map" data-robot={p.robot.robot_id} data-variant={p.variant} data-plan-only={String(!!p.planOnly)} />
  ),
}))
vi.mock('@/liveops/useSiteMap', () => ({ useSiteMap: () => ({ map: undefined, floorIndex: 0, onFloorChange: () => {} }) }))
vi.mock('./CameraFeedLayer', () => ({ CameraFeedLayer: () => <span data-testid="camera" /> }))
vi.mock('@/org/useSiteRobots', async () => {
  const { initialRobots } = await import('@/mocks/mockRobots')
  return { useSiteRobots: () => initialRobots.slice(0, 3) }
})

import { PatrolGridView } from './PatrolGridView'
import { initialRobots } from '@/mocks/mockRobots'

const [atlas, rex, bolt] = initialRobots
const key = () => `rh.liveops.grid.${useSessionStore.getState().activeSiteId}`

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  localStorage.clear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  act(() => useSessionStore.getState().setSelectedRobot(atlas.robot_id))
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  localStorage.clear()
})

const render = () => act(() => root.render(<PatrolGridView />))
const maps = () => [...host.querySelectorAll('[data-testid="map"]')]
const cameras = () => host.querySelectorAll('[data-testid="camera"]').length
const selects = () => [...host.querySelectorAll('select')]
const saved = () => JSON.parse(localStorage.getItem(key()) ?? 'null') as unknown
const buttonNamed = (name: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent === name || b.getAttribute('aria-label') === name)

function choose(select: HTMLSelectElement, value: string) {
  act(() => {
    select.value = value
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

describe('PatrolGridView map tile', () => {
  it('offers Map beside the robots in an empty slot, and choosing it puts the map there', () => {
    localStorage.setItem(key(), JSON.stringify([atlas.robot_id, null, null, null]))
    render()
    const picker = selects()[0]
    const options = [...picker.options].map((o) => o.textContent)
    expect(options).toContain(i18n.t('grid.map'))
    expect(options).toContain(rex.name)
    choose(picker, MAP_SLOT)
    expect(maps()).toHaveLength(1)
    expect(saved()).toEqual([atlas.robot_id, MAP_SLOT, null, null])
  })

  it('draws the selected robot, as the full interactive map, flat Plan only', () => {
    localStorage.setItem(key(), JSON.stringify([atlas.robot_id, MAP_SLOT, null, null]))
    render()
    const [m] = maps()
    expect(m.getAttribute('data-robot')).toBe(atlas.robot_id)
    expect(m.getAttribute('data-variant')).toBe('full')
    expect(m.getAttribute('data-plan-only')).toBe('true')
    expect(host.textContent).toContain(i18n.t('grid.mapTitle', { name: atlas.name }))
  })

  it('follows the robot whose slot is selected', () => {
    localStorage.setItem(key(), JSON.stringify([atlas.robot_id, rex.robot_id, MAP_SLOT, null]))
    render()
    const rexSlot = [...host.querySelectorAll('[role="button"]')]
      .find((el) => el.getAttribute('aria-label') === i18n.t('grid.slotAria', { name: rex.name })) as HTMLElement
    act(() => rexSlot.click())
    expect(maps()[0].getAttribute('data-robot')).toBe(rex.robot_id)
  })

  it('loads an old saved layout (robot ids only) unchanged, with no map', () => {
    localStorage.setItem(key(), JSON.stringify([rex.robot_id, null, bolt.robot_id, null]))
    render()
    expect(maps()).toHaveLength(0)
    expect(cameras()).toBe(2)
    expect(saved()).toEqual([rex.robot_id, null, bolt.robot_id, null])
  })

  it('shows only one map tile: choosing Map again moves it', () => {
    localStorage.setItem(key(), JSON.stringify([MAP_SLOT, null, null, null]))
    render()
    choose(selects()[0], MAP_SLOT) // the first empty slot is slot 1
    expect(maps()).toHaveLength(1)
    expect(saved()).toEqual([null, MAP_SLOT, null, null])
  })

  it('Add map fills a free slot and goes away once the map is on the grid', () => {
    localStorage.setItem(key(), JSON.stringify([atlas.robot_id, rex.robot_id, null, null]))
    render()
    act(() => buttonNamed(i18n.t('grid.addMap'))!.click())
    expect(saved()).toEqual([atlas.robot_id, rex.robot_id, MAP_SLOT, null])
    expect(buttonNamed(i18n.t('grid.addMap'))).toBeUndefined()
  })

  it('clears with its remove button, and opens the followed robot in Cockpit', () => {
    localStorage.setItem(key(), JSON.stringify([MAP_SLOT, null, null, null]))
    render()
    act(() => buttonNamed(i18n.t('grid.openCockpit', { name: atlas.name }))!.click())
    expect(useSessionStore.getState().viewMode).toBe('cockpit')
    act(() => buttonNamed(i18n.t('grid.removeMap'))!.click())
    expect(maps()).toHaveLength(0)
    expect(saved()).toEqual([null, null, null, null])
  })
})
