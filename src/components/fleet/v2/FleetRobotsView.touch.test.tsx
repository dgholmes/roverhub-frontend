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

import { FleetRobotsView } from './FleetRobotsView'
import { MissionLibraryView } from '@/components/missions/MissionLibraryView'

const unknownBattery = (r: RobotState): RobotState => ({ ...r, battery: { ...r.battery, percent: null } })
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

  it('has real, different copy for the back controls in both languages', () => {
    const en = i18n.getFixedT('en')
    const ko = i18n.getFixedT('ko')
    for (const [e, k] of [[en('touch.back.fleet'), ko('touch.back.fleet')], [en('touch.back.missions'), ko('touch.back.missions')]]) {
      expect(e).not.toMatch(/^touch\./)
      expect(k).not.toMatch(/^touch\./)
      expect(k).not.toBe(e)
    }
  })
})
