// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { hashForSiteWorkspace } from '@/app/routes'
import { mockMaps } from '@/mocks/maps'
import type { MissionLibraryEntry } from '@/types'
import type { SiteMap } from '@/types/maps'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The views and the editor are stood in: what this pins is what New mission
// does with the site's maps, and the map the new mission is drawn on.
vi.mock('./MissionLibraryView', () => ({ MissionLibraryView: () => <i data-view="library" /> }))
vi.mock('./ScheduleRunsView', () => ({ ScheduleRunsView: () => <i data-view="runs" /> }))
vi.mock('./TaskListView', () => ({ TaskListView: () => <i data-view="tasks" /> }))
vi.mock('./ScheduleCalendar', () => ({ ScheduleCalendar: () => <i data-view="calendar" /> }))
vi.mock('./MissionEditor', () => ({
  MissionEditor: (p: { initial: MissionLibraryEntry }) => (
    <i data-view="editor" data-kind={p.initial.kind} data-map={p.initial.map_id} />
  ),
}))
const seam = vi.hoisted(() => ({ maps: null as SiteMap[] | null, shown: undefined as SiteMap | undefined }))
vi.mock('@/missions/useMissionMap', () => ({
  useSiteMapFor: () => ({ map: seam.shown }),
  useSiteMaps: () => ({ maps: seam.maps, shown: seam.shown }),
}))
vi.mock('@/missions/useMissionStore', async () => {
  const { create } = await import('zustand')
  const useMissionStore = create(() => ({
    siteId: null as string | null, missions: [] as unknown[], loading: false, error: null,
    load: async (siteId: string) => { useMissionStore.setState({ siteId, loading: false, missions: [] }) },
    save: vi.fn(), remove: vi.fn(),
  }))
  return { useMissionStore }
})

import { MissionsWorkspace } from './MissionsWorkspace'

const SITE = 's1'
const base: SiteMap = mockMaps[0]
const office: SiteMap = { ...base, map_id: 'map-office', name: 'Office 3F', updated_at: '2026-11-01T00:00:00Z' }
const carPark: SiteMap = { ...base, map_id: 'map-car-park', name: 'Car park B1', updated_at: '2026-11-10T00:00:00Z' }

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  seam.maps = null
  seam.shown = undefined
  window.history.replaceState(null, '', hashForSiteWorkspace(SITE, 'Missions'))
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const button = (text: string) => [...host.querySelectorAll('button')].find((b) => b.textContent === text)!
const editor = () => host.querySelector('[data-view="editor"]')
const chooser = () => host.querySelector('[role="alertdialog"]')

async function newMission() {
  await act(async () => root.render(<MissionsWorkspace siteId={SITE} />))
  await act(async () => button(i18n.t('missions.library.newMission')).click())
}

describe('New mission and the site\'s maps', () => {
  it('asks which map when the site has two, with the shown map ticked', async () => {
    seam.maps = [office, carPark]
    seam.shown = office
    await newMission()
    expect(editor()).toBeNull()
    expect(chooser()).not.toBeNull()
    const ticked = host.querySelector<HTMLInputElement>('input[type="radio"]:checked')!
    expect(ticked.value).toBe(office.map_id)
  })

  it('draws on the map chosen', async () => {
    seam.maps = [office, carPark]
    seam.shown = office
    await newMission()
    const car = [...host.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find((r) => r.value === carPark.map_id)!
    await act(async () => car.click())
    await act(async () => button(i18n.t('missions.library.chooser.start')).click())
    expect(editor()?.getAttribute('data-map')).toBe(carPark.map_id)
  })

  it('goes back to the library on Cancel, making nothing', async () => {
    seam.maps = [office, carPark]
    await newMission()
    await act(async () => button(i18n.t('missions.library.chooser.cancel')).click())
    expect(chooser()).toBeNull()
    expect(editor()).toBeNull()
    expect(host.querySelector('[data-view="library"]')).not.toBeNull()
  })

  it('skips the question when the site has one map, and draws on it', async () => {
    seam.maps = [office]
    seam.shown = office
    await newMission()
    expect(chooser()).toBeNull()
    expect(editor()?.getAttribute('data-map')).toBe(office.map_id)
  })

  it('draws on the plain grid when the site has no maps', async () => {
    seam.maps = []
    await newMission()
    expect(editor()?.getAttribute('data-map')).toBe('')
  })

  it("does not ask for New program, which keeps today's default", async () => {
    seam.maps = [office, carPark]
    seam.shown = office
    await act(async () => root.render(<MissionsWorkspace siteId={SITE} />))
    await act(async () => button(i18n.t('missions.library.newProgram')).click())
    expect(chooser()).toBeNull()
    expect(editor()?.getAttribute('data-kind')).toBe('program')
  })
})
