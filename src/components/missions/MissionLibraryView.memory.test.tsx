// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { mockMaps } from '@/mocks/maps'
import { viewKey } from '@/lib/viewMemory'
import type { MissionLibraryEntry } from '@/types'
import type { SiteMap } from '@/types/maps'

/**
 * The library's type chip and map filter are the viewer's own conveniences,
 * so a reload keeps them per site in view memory (2026-11-26). The search box
 * and the previewed mission are not kept: one is typed for the moment, the
 * other only previews.
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('./RoutePreviewMap', () => ({ RoutePreviewMap: () => <i data-preview="route" /> }))
vi.mock('./visual-program/ProgramPreview', () => ({ ProgramPreview: () => <i data-preview="program" /> }))

import { MissionLibraryView } from './MissionLibraryView'

const office: SiteMap = { ...mockMaps[0], map_id: 'map-office', name: 'Office 3F' }
const carPark: SiteMap = { ...mockMaps[0], map_id: 'map-car-park', name: 'Car park B1' }
const mission = (over: Partial<MissionLibraryEntry>): MissionLibraryEntry => ({
  mission_id: 'm', name: 'M', type: 'patrol', kind: 'route', version: 1, creator: 'x', updated_at: '2026-11-01T00:00:00Z',
  map_id: office.map_id, site_id: 's1', waypoints: [], segments: [], ...over,
})
const nightPatrol = mission({ mission_id: 'a', name: 'Night patrol', updated_at: '2026-11-04T00:00:00Z' })
const carLoop = mission({ mission_id: 'b', name: 'Car park loop', map_id: carPark.map_id, type: 'inspection', updated_at: '2026-11-03T00:00:00Z' })
const greeting = mission({ mission_id: 'c', name: 'Greeting', kind: 'program', updated_at: '2026-11-02T00:00:00Z' })
const ALL = [nightPatrol, carLoop, greeting]
const MAPS = [office, carPark]

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  localStorage.clear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function render(missions = ALL, maps: SiteMap[] | null = MAPS, siteId = 's1') {
  act(() => root.render(
    <MissionLibraryView siteId={siteId} missions={missions} maps={maps} onOpen={() => {}} onSchedule={() => {}} onShowTasks={() => {}} />,
  ))
}
function reload(missions = ALL, maps: SiteMap[] | null = MAPS, siteId = 's1') {
  act(() => root.unmount())
  root = createRoot(host)
  render(missions, maps, siteId)
}
const names = () => [...host.querySelectorAll('[role="option"]')].map((c) => c.querySelector('[title]')?.getAttribute('title'))
const mapFilter = () => host.querySelector<HTMLSelectElement>(`select[aria-label="${i18n.t('missions.library.mapFilter')}"]`)!
const chip = (label: string) => [...host.querySelectorAll<HTMLButtonElement>(`[role="group"] button`)].find((b) => b.textContent === label)!
const pickMap = (key: string) => act(() => {
  mapFilter().value = key
  mapFilter().dispatchEvent(new Event('change', { bubbles: true }))
})

describe('the library filters across a reload', () => {
  it('keep the map filter', () => {
    render()
    pickMap(`map:${carPark.map_id}`)
    expect(names()).toEqual(['Car park loop'])
    reload()
    expect(mapFilter().value).toBe(`map:${carPark.map_id}`)
    expect(names()).toEqual(['Car park loop'])
  })

  it('keep the type chip', () => {
    render()
    act(() => chip(i18n.t('missions.tasks.form.kind.program')).click())
    expect(names()).toEqual(['Greeting'])
    reload()
    expect(names()).toEqual(['Greeting'])
  })

  it('are kept per site', () => {
    render()
    pickMap(`map:${carPark.map_id}`)
    reload(ALL, MAPS, 's2')
    expect(names()).toEqual(['Night patrol', 'Car park loop', 'Greeting'])
  })

  it('wait for the missions and maps rather than dropping the choice while they load', () => {
    render()
    pickMap(`map:${carPark.map_id}`)
    act(() => chip(i18n.t('command.taskBar.missionType.inspection')).click())
    reload([], null)
    expect(names()).toEqual([])
    render()
    expect(names()).toEqual(['Car park loop'])
  })

  it('show everything when the remembered chip or map is no longer offered', () => {
    localStorage.setItem(viewKey('missions', 's1', 'library', 'type'), JSON.stringify('type:escort'))
    localStorage.setItem(viewKey('missions', 's1', 'library', 'map'), JSON.stringify('map:map-deleted'))
    render()
    expect(names()).toEqual(['Night patrol', 'Car park loop', 'Greeting'])
  })
})
