// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { mockMaps } from '@/mocks/maps'
import type { MissionLibraryEntry } from '@/types'
import type { SiteMap } from '@/types/maps'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The preview needs a live Leaflet map and the block canvas: stood in.
vi.mock('./RoutePreviewMap', () => ({ RoutePreviewMap: () => <i data-preview="route" /> }))
vi.mock('./visual-program/ProgramPreview', () => ({ ProgramPreview: () => <i data-preview="program" /> }))

import { MissionLibraryView } from './MissionLibraryView'

const base: SiteMap = mockMaps[0]
const office: SiteMap = { ...base, map_id: 'map-office', name: 'Office 3F' }
const carPark: SiteMap = { ...base, map_id: 'map-car-park', name: 'Car park B1' }

const mission = (over: Partial<MissionLibraryEntry>): MissionLibraryEntry => ({
  mission_id: 'm', name: 'M', type: 'patrol', kind: 'route', version: 1, creator: 'x', updated_at: '2026-11-01T00:00:00Z',
  map_id: office.map_id, site_id: 's1', waypoints: [], segments: [], ...over,
})
const nightPatrol = mission({ mission_id: 'a', name: 'Night patrol', updated_at: '2026-11-04T00:00:00Z' })
const carLoop = mission({ mission_id: 'b', name: 'Car park loop', map_id: carPark.map_id, updated_at: '2026-11-03T00:00:00Z' })
const greeting = mission({ mission_id: 'c', name: 'Greeting', kind: 'program', map_id: office.map_id, updated_at: '2026-11-02T00:00:00Z' })
const lost = mission({ mission_id: 'd', name: 'Old loop', map_id: 'map-deleted', updated_at: '2026-11-01T00:00:00Z' })

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
})

function render(missions: MissionLibraryEntry[], maps: SiteMap[] | null) {
  act(() => root.render(
    <MissionLibraryView siteId="s1" missions={missions} maps={maps} onOpen={() => {}} onSchedule={() => {}} onShowTasks={() => {}} />,
  ))
}
const card = (name: string) => [...host.querySelectorAll('[role="option"]')].find((c) => c.textContent?.includes(name))!
const chip = (name: string) => card(name).querySelector('[data-map-chip]')
const names = () => [...host.querySelectorAll('[role="option"]')].map((c) => c.querySelector('[title]')?.getAttribute('title'))
const mapFilter = () => host.querySelector<HTMLSelectElement>(`select[aria-label="${i18n.t('missions.library.mapFilter')}"]`)

describe('every mission card shows its map', () => {
  it('names the map, says "No map" for none (and for a program), and "Missing map" for an id the site does not have', () => {
    render([nightPatrol, carLoop, greeting, lost], [office, carPark])
    expect(chip('Night patrol')?.textContent).toBe('Office 3F')
    expect(chip('Car park loop')?.textContent).toBe('Car park B1')
    expect(chip('Greeting')?.textContent).toBe(i18n.t('missions.library.mapChip.none'))
    expect(chip('Old loop')?.textContent).toBe(i18n.t('missions.library.mapChip.missing'))
    expect(chip('Old loop')?.getAttribute('data-map-chip')).toBe('missing')
  })

  it('shows no chip before the site\'s maps are known, rather than calling every map missing', () => {
    render([nightPatrol, lost], null)
    expect(chip('Old loop')).toBeNull()
    expect(chip('Night patrol')).toBeNull()
  })
})

describe('the map filter', () => {
  it('is offered only when the missions span two or more maps', () => {
    render([nightPatrol, mission({ mission_id: 'e', name: 'Lobby' })], [office, carPark])
    expect(mapFilter()).toBeNull()
    render([nightPatrol, carLoop], [office, carPark])
    expect(mapFilter()).not.toBeNull()
  })

  it("shows one map's missions", () => {
    render([nightPatrol, carLoop, greeting, lost], [office, carPark])
    const select = mapFilter()!
    act(() => {
      select.value = `map:${carPark.map_id}`
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(names()).toEqual(['Car park loop'])
  })
})
