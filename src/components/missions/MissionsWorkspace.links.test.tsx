// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hashForMissionEditor, hashForMissionsSchedule, hashForSiteWorkspace } from '@/app/routes'
import type { MissionLibraryEntry } from '@/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The views and the editor are stood in: what this pins is which one the
// address opens, and what a dead link does.
vi.mock('./MissionLibraryView', () => ({ MissionLibraryView: () => <i data-view="library" /> }))
vi.mock('./ScheduleRunsView', () => ({ ScheduleRunsView: () => <i data-view="runs" /> }))
vi.mock('./TaskListView', () => ({ TaskListView: () => <i data-view="tasks" /> }))
vi.mock('./ScheduleCalendar', () => ({ ScheduleCalendar: () => <i data-view="calendar" /> }))
vi.mock('@/components/maps/MapCurationPanel', () => ({ MapCurationPanel: () => <i data-view="maps" /> }))
vi.mock('./MissionEditor', () => ({
  MissionEditor: (p: { initial: MissionLibraryEntry; initialTab: string }) => (
    <i data-view="editor" data-mission={p.initial.mission_id} data-tab={p.initialTab} />
  ),
}))
vi.mock('@/missions/useMissionMap', () => ({ useSiteMapFor: () => ({ map: undefined }) }))

const SITE = 's1'
const store = vi.hoisted(() => ({ missions: [] as unknown[] }))
vi.mock('@/missions/useMissionStore', async () => {
  const { create } = await import('zustand')
  const useMissionStore = create(() => ({
    siteId: null as string | null, missions: [] as unknown[], loading: false, error: null,
    load: async (siteId: string) => { useMissionStore.setState({ siteId, loading: false, missions: store.missions }) },
    save: vi.fn(), remove: vi.fn(),
  }))
  return { useMissionStore }
})

import { MissionsWorkspace } from './MissionsWorkspace'

const mission = { mission_id: 'm1', kind: 'route', name: 'Loop', waypoints: [], segments: [] } as unknown as MissionLibraryEntry

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  store.missions = [mission]
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const shown = () => host.querySelector('[data-view]')?.getAttribute('data-view')

async function renderAt(hash: string) {
  window.history.replaceState(null, '', hash)
  await act(async () => root.render(<MissionsWorkspace siteId={SITE} />))
}

describe('the Missions address', () => {
  it('opens Schedule and its Calendar from a link', async () => {
    await renderAt(hashForMissionsSchedule(SITE, 'calendar'))
    expect(shown()).toBe('calendar')
  })

  it('opens the mission and tab a link names', async () => {
    await renderAt(hashForMissionEditor(SITE, 'm1', 'settings'))
    const editor = host.querySelector('[data-view="editor"]')
    expect(editor?.getAttribute('data-mission')).toBe('m1')
    expect(editor?.getAttribute('data-tab')).toBe('settings')
  })

  it('falls back to the library, quietly and in place, for a mission that no longer exists', async () => {
    await renderAt(hashForMissionEditor(SITE, 'deleted-long-ago'))
    expect(shown()).toBe('library')
    expect(window.location.hash).toBe(hashForSiteWorkspace(SITE, 'Missions'))
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  it('follows Back and Forward between views', async () => {
    await renderAt(hashForSiteWorkspace(SITE, 'Missions'))
    expect(shown()).toBe('library')
    await act(async () => {
      window.history.pushState(null, '', hashForMissionsSchedule(SITE, 'tasks'))
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(shown()).toBe('tasks')
    await act(async () => {
      window.history.replaceState(null, '', hashForSiteWorkspace(SITE, 'Missions'))
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(shown()).toBe('library')
  })
})
