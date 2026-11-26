import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import i18n from '@/i18n'
import { BATTERY_UNKNOWN_LABEL } from '@/liveops/batteryDisplay'
import { initialRobots } from '@/mocks/mockRobots'
import type { MissionLibraryEntry, RobotState } from '@/types'

/**
 * Fleet's two panes, by the 2026-11-26 rule: `narrow` (viewport under 700 px)
 * is the only thing that may change the layout, and `touch` never does. A
 * 1420 px tablet used to get the phone layout -- roster only, no inspector
 * until a tap -- because this keyed on the pointer.
 */
const shell = vi.hoisted(() => ({ touch: false, narrow: false }))
vi.mock('@/lib/useTouchShell', () => ({
  useTouchShell: () => ({ touch: shell.touch, narrow: shell.narrow, orientation: 'portrait', big: false }),
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

function renderFleet({ touch, narrow, selected }: { touch: boolean; narrow: boolean; selected: string | null }) {
  shell.touch = touch
  shell.narrow = narrow
  return renderToStaticMarkup(<FleetRobotsView robots={robots} selectedRobotId={selected} onSelect={() => {}} />)
}

const mission: MissionLibraryEntry = {
  mission_id: 'm1', name: 'Lobby patrol', type: 'patrol', kind: 'route', version: 1, creator: 'x',
  updated_at: '2026-11-01T00:00:00Z', map_id: null, site_id: 's1', waypoints: [], segments: [],
} as unknown as MissionLibraryEntry

function renderLibrary({ touch, narrow }: { touch: boolean; narrow: boolean }) {
  shell.touch = touch
  shell.narrow = narrow
  return renderToStaticMarkup(
    <MissionLibraryView siteId="s1" missions={[mission]} onOpen={() => {}} onSchedule={() => {}} onShowTasks={() => {}} />,
  )
}

beforeEach(() => { shell.touch = false; shell.narrow = false })

describe('Fleet robots view', () => {
  const id = robots[0].robot_id
  const back = () => i18n.t('touch.back.fleet')

  describe('wide, touch or not: the desktop layout', () => {
    for (const touch of [true, false]) {
      const pointer = touch ? 'a finger' : 'a mouse'

      it(`shows roster and inspector side by side with ${pointer}, the first robot standing in`, () => {
        const html = renderFleet({ touch, narrow: false, selected: null })
        expect(html).toContain('data-fleet-roster')
        expect(html).toContain('data-robot-inspector')
        expect(html).toContain('width:280px')
        expect(html).not.toContain(back())
      })

      it(`keeps both panes once a robot is picked with ${pointer}`, () => {
        const html = renderFleet({ touch, narrow: false, selected: id })
        expect(html).toContain('data-fleet-roster')
        expect(html).toContain('data-robot-inspector')
        expect(html).not.toContain(back())
      })
    }

    it('renders exactly the same markup for a finger as for a mouse', () => {
      const withFinger = renderFleet({ touch: true, narrow: false, selected: id })
      const withMouse = renderFleet({ touch: false, narrow: false, selected: id })
      expect(withFinger).not.toContain('min-height:56px')
      expect(withFinger).toBe(withMouse)
    })
  })

  describe('narrow: one pane at a time', () => {
    for (const touch of [true, false]) {
      const who = touch ? 'a phone' : 'a narrow desktop window'

      it(`shows ${who} the roster full-width and no inspector until a robot is picked`, () => {
        const html = renderFleet({ touch, narrow: true, selected: null })
        expect(html).toContain('data-fleet-roster')
        expect(html).not.toContain('data-robot-inspector')
        expect(html).not.toContain('width:280px')
      })

      it(`shows ${who} the inspector full-width with a way back once one is picked`, () => {
        const html = renderFleet({ touch, narrow: true, selected: id })
        expect(html).toContain('data-robot-inspector')
        expect(html).not.toContain('data-fleet-roster')
        expect(html).toContain(back())
      })
    }

    it('explains an empty fleet instead of showing a bare roster', () => {
      shell.narrow = true
      const html = renderToStaticMarkup(<FleetRobotsView robots={[]} selectedRobotId={null} onSelect={() => {}} />)
      expect(html).toContain(i18n.t('fleet.roster.noRobotsTitle'))
    })
  })

  it('keeps an unknown battery unknown in the roster', () => {
    expect(renderFleet({ touch: true, narrow: true, selected: null })).toContain(BATTERY_UNKNOWN_LABEL)
    expect(renderFleet({ touch: true, narrow: false, selected: null })).toContain(BATTERY_UNKNOWN_LABEL)
  })

  // MissionLibraryView belongs to Missions; these two pin only the ends every
  // rule agrees on (a phone, and a desktop), so they hold however Missions
  // resolves a wide tablet.
  it('gives the mission library the whole width with no preview pane on a phone', () => {
    const html = renderLibrary({ touch: true, narrow: true })
    expect(html).not.toContain('width:340px')
    expect(html).not.toContain('data-route-preview')
    expect(html).toContain('Lobby patrol')
  })

  it('keeps the mission library list and preview side by side on a desktop', () => {
    const html = renderLibrary({ touch: false, narrow: false })
    expect(html).toContain('width:340px')
    expect(html).toContain('data-route-preview')
  })

  describe('Robots/Docks tabs', () => {
    const tabs = () => i18n.t('fleet.tabs.docks')
    const renderWorkspace = (touch: boolean, narrow: boolean, selected: string | null) => {
      shell.touch = touch
      shell.narrow = narrow
      useSessionStore.setState({ selectedRobotId: selected })
      return renderToStaticMarkup(<FleetWorkspace />)
    }
    // Narrow, the tabs going with the roster is pinned in
    // `fleet/FleetWorkspace.touch.test.tsx`, which mounts and taps a robot:
    // the workspace does not seed its selection from the session store
    // there, so a seeded id cannot open the inspector from markup alone.
    it('stay with the roster when narrow, whatever the session has selected', () => {
      const html = renderWorkspace(true, true, id)
      expect(html).toContain(tabs())
      expect(html).toContain('data-fleet-roster')
      expect(html).not.toContain('data-robot-inspector')
    })
    for (const touch of [true, false]) {
      it(`sit above both panes when wide, with ${touch ? 'a finger' : 'a mouse'}`, () => {
        const html = renderWorkspace(touch, false, id)
        expect(html).toContain(tabs())
        expect(html).toContain('data-fleet-roster')
        expect(html).toContain('data-robot-inspector')
      })
    }
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
