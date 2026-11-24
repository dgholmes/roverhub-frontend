import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import i18n from '@/i18n'
import { BATTERY_UNKNOWN_LABEL } from '@/liveops/batteryDisplay'
import { initialRobots } from '@/mocks/mockRobots'
import type { MissionLibraryEntry, RobotState } from '@/types'

const shell = vi.hoisted(() => ({ touch: false }))
vi.mock('@/lib/useTouchShell', () => ({
  useTouchShell: () => ({ touch: shell.touch, orientation: 'portrait', big: false }),
}))
// Leaflet has no DOM here; the preview keeps its real root marker.
vi.mock('leaflet', () => ({ default: { CRS: { Simple: {} } } }))
vi.mock('react-leaflet', () => ({ MapContainer: ({ children }: { children: ReactNode }) => <div>{children}</div> }))
vi.mock('@/components/liveops/map/MapCanvas', () => ({ MAP_BOUNDS: [[-50, -50], [50, 50]] }))
vi.mock('@/components/liveops/map/GridLayer', () => ({ GridLayer: () => null }))
vi.mock('@/components/liveops/map/GeofenceLayer', () => ({ GeofenceLayer: () => null }))
vi.mock('@/components/liveops/map/NoGoZoneLayer', () => ({ NoGoZoneLayer: () => null }))
vi.mock('@/components/liveops/map/FloorplanLayer', () => ({ FloorplanLayer: () => null }))
vi.mock('@/components/liveops/map/FloorPicker', () => ({ FloorPicker: () => null }))
vi.mock('@/components/missions/route-editor/EditableRouteLayer', () => ({ EditableRouteLayer: () => null }))
vi.mock('@/components/missions/route-editor/FitToRoute', () => ({ FitToRoute: () => null }))
vi.mock('@/components/missions/visual-program/ProgramPreview', () => ({ ProgramPreview: () => null }))

vi.mock('@/org/useSiteRobots', () => ({ useSiteRobots: () => initialRobots.map(unknownBattery) }))

import { FleetRobotsView } from './FleetRobotsView'
import { FleetWorkspace } from '@/components/fleet/FleetWorkspace'
import { useSessionStore } from '@/store/useSessionStore'
import { MissionLibraryView } from '@/components/missions/MissionLibraryView'

function unknownBattery (r: RobotState): RobotState { return { ...r, battery: { ...r.battery, percent: null } } }
const robots = initialRobots.map(unknownBattery)

function renderFleet({ touch, selected }: { touch: boolean; selected: string | null }) {
  shell.touch = touch
  return renderToStaticMarkup(<FleetRobotsView robots={robots} selectedRobotId={selected} onSelect={() => {}} />)
}

const mission: MissionLibraryEntry = {
  mission_id: 'm1', name: 'Lobby patrol', type: 'patrol', kind: 'route', version: 1, creator: 'x',
  updated_at: '2026-11-01T00:00:00Z', map_id: null, site_id: 's1', waypoints: [], segments: [],
} as unknown as MissionLibraryEntry

function renderLibrary({ touch }: { touch: boolean }) {
  shell.touch = touch
  return renderToStaticMarkup(
    <MissionLibraryView siteId="s1" missions={[mission]} onOpen={() => {}} onSchedule={() => {}} onShowTasks={() => {}} />,
  )
}

beforeEach(() => { shell.touch = false })

describe('two-pane pages at phone width', () => {
  const id = robots[0].robot_id

  it('shows the roster and no inspector until a robot is tapped', () => {
    const html = renderFleet({ touch: true, selected: null })
    expect(html).toContain('data-fleet-roster')
    expect(html).not.toContain('data-robot-inspector')
  })

  it('shows the inspector full-width with a way back once one is tapped', () => {
    const html = renderFleet({ touch: true, selected: id })
    expect(html).toContain('data-robot-inspector')
    expect(html).not.toContain('data-fleet-roster')
    expect(html).toContain(i18n.t('touch.back.fleet'))
  })

  it('keeps both panes side by side on a fine pointer', () => {
    const html = renderFleet({ touch: false, selected: id })
    expect(html).toContain('data-fleet-roster')
    expect(html).toContain('data-robot-inspector')
    expect(html).not.toContain(i18n.t('touch.back.fleet'))
  })

  it('keeps an unknown battery unknown in the roster', () => {
    expect(renderFleet({ touch: true, selected: null })).toContain(BATTERY_UNKNOWN_LABEL)
  })

  it('gives the mission library the whole width with no preview pane', () => {
    const html = renderLibrary({ touch: true })
    expect(html).not.toContain('width:340px')
    expect(html).not.toContain('data-route-preview')
    expect(html).toContain('Lobby patrol')
  })

  it('keeps the mission library list and preview side by side on a fine pointer', () => {
    const html = renderLibrary({ touch: false })
    expect(html).toContain('width:340px')
    expect(html).toContain('data-route-preview')
  })

  it('explains an empty fleet on touch instead of showing a bare roster', () => {
    shell.touch = true
    const html = renderToStaticMarkup(<FleetRobotsView robots={[]} selectedRobotId={null} onSelect={() => {}} />)
    expect(html).toContain(i18n.t('fleet.roster.noRobotsTitle'))
  })

  describe('Robots/Docks tabs', () => {
    const tabs = () => i18n.t('fleet.tabs.docks')
    const renderWorkspace = (touch: boolean, selected: string | null) => {
      shell.touch = touch
      useSessionStore.setState({ selectedRobotId: selected })
      return renderToStaticMarkup(<FleetWorkspace />)
    }
    // On touch the tabs going with the roster is pinned in
    // `fleet/FleetWorkspace.touch.test.tsx`, which mounts and taps a robot:
    // the workspace no longer seeds its selection from the session store
    // there, so a seeded id cannot open the inspector from markup alone.
    it('stay with the roster on touch whatever the session has selected', () => {
      const html = renderWorkspace(true, id)
      expect(html).toContain(tabs())
      expect(html).toContain('data-fleet-roster')
      expect(html).not.toContain('data-robot-inspector')
    })
    it('are unchanged on a fine pointer', () => {
      const html = renderWorkspace(false, id)
      expect(html).toContain(tabs())
      expect(html).toContain('data-robot-inspector')
    })
  })

  it('has real, different copy for the back control in both languages', () => {
    const en = i18n.getFixedT('en')
    const ko = i18n.getFixedT('ko')
    for (const [e, k] of [[en('touch.back.fleet'), ko('touch.back.fleet')]]) {
      expect(e).not.toMatch(/^touch\./)
      expect(k).not.toMatch(/^touch\./)
      expect(k).not.toBe(e)
    }
  })
})
