import { describe, expect, it, vi } from 'vitest'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { CircleMarker, Marker, Polyline } from 'react-leaflet'
import '@/i18n'

// Leaflet needs a window, which a node-environment test does not have. The map
// layers are stood in by named stubs: the tests read the element tree
// NavGoalMarkers returns, not what Leaflet would paint.
vi.mock('leaflet', () => ({ default: { divIcon: (o: unknown) => ({ divIcon: o }) } }))
vi.mock('react-leaflet', () => ({
  CircleMarker: function CircleMarker() { return null },
  Polyline: function Polyline() { return null },
  Marker: function Marker() { return null },
  useMap: () => null,
  useMapEvents: () => null,
}))

import { color } from '@/design-system/tokens'
import type { NavBarModel } from '@/liveops/navMode'
import type { Point2D } from '@/types/maps'
import { NavBar, NavGoalMarkers, NavTools, floorIdOf } from './NavGoalLayer'

const noop = () => {}
const bar = (model: NavBarModel, placement?: 'top' | 'bottom') => renderToStaticMarkup(
  <NavBar model={model} placement={placement} onCancel={noop} onWalk={noop} onStop={noop} onSetPosition={noop} />,
)
/** The text of each <button>, in document order. */
const buttons = (html: string) => [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((m) => m[1].replace(/<[^>]+>/g, ''))
const HAIRLINE = /border(-left)?:\s*1(\.5)?px solid/

describe('NavBar', () => {
  const confirm: NavBarModel = { kind: 'confirm', title: 'Walk here', detail: '3.4 m away', warnings: [], walk: { enabled: true } }

  it('renders nothing when there is nothing to say', () => {
    expect(bar({ kind: 'none' })).toBe('')
  })

  it('offers Walk here with the distance, Cancel and Walk (primary)', () => {
    const html = bar(confirm)
    expect(html).toContain('Walk here')
    expect(html).toContain('3.4 m away')
    expect(buttons(html)).toEqual(['Cancel', 'Walk'])
    expect(html).toMatch(/class="rh-btn rh-btn--primary"[^>]*>Walk</)
  })

  it('shows the walk’s top speed on the secondary line, the Walk button unchanged', () => {
    const html = bar({ ...confirm, detail: '3.4 m away · up to 0.35 m/s' })
    expect(html).toContain('3.4 m away · up to 0.35 m/s')
    expect(buttons(html)).toEqual(['Cancel', 'Walk'])
  })

  it('puts a warning ABOVE the Walk button, before confirm', () => {
    const html = bar({ ...confirm, warnings: ['The survey never saw this spot.'] })
    expect(html.indexOf('The survey never saw this spot.')).toBeLessThan(html.indexOf('>Walk<'))
    expect(html).toContain(color.amberBg)
  })

  it('disables Walk with the reason when the robot would refuse it, and says why', () => {
    const reason = 'You have control. Release it to send the robot to a point.'
    const html = bar({ ...confirm, walk: { enabled: false, reason } })
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Walk</)
    expect(html).toContain(reason)
  })

  it('shows a refusal in place of Walk: a red chip and Cancel, no Walk button', () => {
    const html = bar({ kind: 'refused', text: 'That point is inside a wall or obstacle.' })
    expect(html).toContain('That point is inside a wall or obstacle.')
    expect(html).toContain(color.redBg)
    expect(buttons(html)).toEqual(['Cancel'])
  })

  it('shows Walking to goal, the metres left and a red Stop while a goal walks', () => {
    const html = bar({ kind: 'walking', title: 'Walking to goal', detail: '2.1 m left' })
    expect(html).toContain('Walking to goal')
    expect(html).toContain('2.1 m left')
    expect(buttons(html)).toEqual(['Stop'])
    expect(html).toMatch(new RegExp(`background:\\s*${color.red.replace(/[()]/g, '\\$&')}`))
  })

  it('never offers E-Stop: it stays in the command bar', () => {
    const html = bar({ kind: 'walking', title: 'Walking to goal', detail: null })
    expect(html).not.toMatch(/e-?stop|emergency/i)
  })

  it('asks for Set position when the robot is not placed', () => {
    const html = bar({ kind: 'notPlaced', text: 'The robot doesn’t know where it is on this map yet.' })
    expect(html).toContain('doesn’t know where it is')
    expect(buttons(html)).toEqual(['Set position'])
  })

  it('shows a finished goal with a dot and no buttons', () => {
    const html = bar({ kind: 'ended', tone: 'green', text: 'Arrived' })
    expect(html).toContain('Arrived')
    expect(buttons(html)).toEqual([])
  })

  it('shows a lidar confirmation like a finished goal: a green dot, no buttons', () => {
    const html = bar({ kind: 'notice', tone: 'green', text: 'Position confirmed by the lidar.' })
    expect(html).toContain('Position confirmed by the lidar.')
    expect(html).toContain(color.green)
    expect(buttons(html)).toEqual([])
  })

  it('shows a correction as a neutral chip and an unconfirmed position as an amber one, no buttons', () => {
    const corrected = bar({ kind: 'notice', tone: 'neutral', text: 'The lidar placed the robot 1.8 m away.' })
    expect(corrected).toContain('1.8 m away')
    expect(corrected).toContain(color.selected)
    expect(buttons(corrected)).toEqual([])
    const unconfirmed = bar({ kind: 'notice', tone: 'amber', text: 'The lidar could not confirm this position.' })
    expect(unconfirmed).toContain(color.amberBg)
    expect(buttons(unconfirmed)).toEqual([])
  })

  it('shows a not-localised refusal as a red chip with Set position beside it', () => {
    const html = bar({ kind: 'notice', tone: 'red', text: 'The robot is not sure where it is.', setPosition: true })
    expect(html).toContain(color.redBg)
    expect(buttons(html)).toEqual(['Set position'])
  })

  it('sits at the bottom-centre, or at the top while the manual-control panel holds the bottom', () => {
    expect(bar(confirm)).toMatch(/bottom:\s*16px/)
    expect(bar(confirm, 'top')).toMatch(/top:\s*12px/)
    expect(bar(confirm, 'top')).not.toMatch(/bottom:\s*16px/)
  })

  it('draws no hairline borders and no coloured left stripes, in any state', () => {
    const models: NavBarModel[] = [
      confirm, { ...confirm, warnings: ['w'], walk: { enabled: false, reason: 'r' } },
      { kind: 'refused', text: 'x' }, { kind: 'walking', title: 'w', detail: 'd' },
      { kind: 'notPlaced', text: 'n' }, { kind: 'ended', tone: 'red', text: 'e' },
      { kind: 'notice', tone: 'green', text: 'g' }, { kind: 'notice', tone: 'neutral', text: 'c' },
      { kind: 'notice', tone: 'amber', text: 'u' }, { kind: 'notice', tone: 'red', text: 'r', setPosition: true },
    ]
    for (const m of models) expect(bar(m), m.kind).not.toMatch(HAIRLINE)
  })

  it('uses theme tokens, not hard-coded dark colours, for its surface (both themes)', () => {
    const html = bar(confirm)
    expect(html).toContain('var(--rh-overlay)')
    expect(html).not.toMatch(/rgba\(8,\s*11,\s*16/)
  })
})

describe('NavTools', () => {
  const on = { active: false, enabled: true }

  it('shows Go to point and Set position, and which one is active', () => {
    const html = renderToStaticMarkup(<NavTools go={{ ...on, active: true }} setPosition={on} hint={null} onToggle={noop} />)
    expect(buttons(html)).toEqual(['Set position', 'Go to point'])
    expect(html).toMatch(/aria-pressed="true"[^>]*>.*Go to point/)
    expect(html).toMatch(/aria-pressed="false"[^>]*>.*Set position/)
  })

  // Set position leads because it is the first thing an operator does to a
  // robot that is not on the map yet: Go to point refuses until it has been
  // placed, so offering it first points at the tool that cannot work.
  it('offers Set position before Go to point', () => {
    const html = renderToStaticMarkup(<NavTools go={on} setPosition={on} hint={null} onToggle={noop} />)
    expect(buttons(html)).toEqual(['Set position', 'Go to point'])
  })

  it('shows the hint line under the group', () => {
    const html = renderToStaticMarkup(<NavTools go={{ ...on, active: true }} setPosition={on} hint={{ tone: 'muted', text: 'Tap where the robot should go' }} onToggle={noop} />)
    expect(html.indexOf('Tap where the robot should go')).toBeGreaterThan(html.indexOf('Set position'))
  })

  it('disables a tool with its reason as the tooltip', () => {
    const html = renderToStaticMarkup(<NavTools go={{ active: false, enabled: false, reason: 'The robot is walking to a goal. Stop it first.' }} setPosition={on} hint={null} onToggle={noop} />)
    expect(html).toMatch(/disabled=""[^>]*title="The robot is walking to a goal. Stop it first."/)
  })

  it('sits where the view asks, top-left by default', () => {
    expect(renderToStaticMarkup(<NavTools go={on} setPosition={on} hint={null} onToggle={noop} />)).toMatch(/top:\s*12px;\s*left:\s*12px/)
    expect(renderToStaticMarkup(<NavTools go={on} setPosition={on} hint={null} onToggle={noop} top={12} left={284} />)).toMatch(/left:\s*284px/)
  })

  /**
   * Portalled into the handheld shell's overlay column, the group is a row of
   * that column rather than a thing at a corner of the map: it lets the host
   * place it and, crucially, takes up its own height there. Absolute took up
   * none, so the camera's steady badge below it in the same column was placed
   * by a constant and drawn underneath it (operator, 2026-11-25).
   */
  it('lets its host place it, and takes up height, in flow', () => {
    const html = renderToStaticMarkup(<NavTools go={on} setPosition={on} hint={null} onToggle={noop} flow />)
    expect(html).toMatch(/position:\s*relative/)
    expect(html).not.toMatch(/position:\s*absolute/)
    // No corner of its own: the column's gap is the whole of its placement.
    expect(html).not.toMatch(/top:\s*\d+px/)
    expect(html).not.toMatch(/left:\s*\d+px/)
  })

  it('shows a planner failure as the amber hint line, with a dot and no outline', () => {
    const text = 'Nav2 can’t find a route from here — following the last one'
    const html = renderToStaticMarkup(<NavTools go={on} setPosition={on} hint={{ tone: 'amber', text }} onToggle={noop} />)
    expect(html).toContain(text)
    expect(html).toContain(`color:${color.amber}`)
    expect(html).toContain(`background:${color.amber}`) // the dot
    expect(html).not.toMatch(HAIRLINE)
  })

  it("says when the robot's map differs from this floor, linking to Maps (0.0.26)", () => {
    const html = renderToStaticMarkup(<NavTools go={on} setPosition={on} hint={null} onToggle={noop} mapsHref="#/site/site-dev/missions/maps" />)
    expect(html).toContain("The robot&#x27;s map differs from this map")
    expect(html).toMatch(/<a href="#\/site\/site-dev\/missions\/maps"[^>]*>Send from Maps<\/a>/)
    expect(html).toContain(`color:${color.amber}`)
    expect(html).not.toMatch(HAIRLINE)
    // Nothing is disabled by it: the bridge's own hash check decides.
    expect(html).not.toContain('disabled')
    expect(renderToStaticMarkup(<NavTools go={on} setPosition={on} hint={null} onToggle={noop} />)).not.toContain('data-map-differs')
  })

  it('draws no hairline borders', () => {
    const html = renderToStaticMarkup(<NavTools go={{ ...on, active: true }} setPosition={on} hint={{ tone: 'amber', text: 'Drag' }} onToggle={noop} />)
    expect(html).not.toMatch(HAIRLINE)
  })

  it('is memoized, so a telemetry re-render with the same props skips it', () => {
    expect((NavTools as unknown as { $$typeof: symbol }).$$typeof.toString()).toBe('Symbol(react.memo)')
  })
})

/** Every element in a tree, depth first. */
function elements(node: ReactNode): ReactElement[] {
  if (!isValidElement(node)) return Array.isArray(node) ? node.flatMap(elements) : []
  const el = node as ReactElement<{ children?: ReactNode }>
  // Function components without hooks are expanded, so the test sees what they draw.
  if (typeof el.type === 'function' && el.type !== CircleMarker && el.type !== Polyline && el.type !== Marker) {
    return [el, ...elements((el.type as (p: unknown) => ReactNode)(el.props))]
  }
  return [el, ...elements(el.props.children)]
}
const ofType = (node: ReactNode, type: unknown) => elements(node).filter((e) => e.type === type)

describe('NavGoalMarkers', () => {
  const from = { x_m: 0, y_m: 0 }
  const base = { from, pending: null, pendingRefused: false, walking: null, pose: null }

  it('renders nothing when there is no pending goal, walk or pose', () => {
    expect(NavGoalMarkers(base)).toBeNull()
  })

  it('renders a pending marker and a dashed line from the robot to it', () => {
    const tree = NavGoalMarkers({ ...base, pending: [3, 4] })
    const pins = ofType(tree, CircleMarker)
    expect(pins.length).toBe(2) // halo + core
    expect(pins.every((p) => JSON.stringify((p.props as { center: unknown }).center) === JSON.stringify([4, 3]))).toBe(true)
    const [line] = ofType(tree, Polyline)
    expect((line.props as { positions: unknown }).positions).toEqual([[0, 0], [4, 3]])
    expect((line.props as { pathOptions: { dashArray?: string } }).pathOptions.dashArray).toBeTruthy()
  })

  it('draws a refused pin red, with no line to it', () => {
    const tree = NavGoalMarkers({ ...base, pending: [3, 4], pendingRefused: true })
    expect(ofType(tree, Polyline)).toHaveLength(0)
    expect(ofType(tree, CircleMarker).map((p) => (p.props as { pathOptions: { fillColor: string } }).pathOptions.fillColor))
      .toEqual([color.red, color.red])
  })

  it('draws no line when the robot is not on the map', () => {
    expect(ofType(NavGoalMarkers({ ...base, from: null, pending: [3, 4] }), Polyline)).toHaveLength(0)
  })

  it('marks the goal the robot is walking to', () => {
    const tree = NavGoalMarkers({ ...base, walking: { x_m: 1, y_m: 2 } })
    expect(ofType(tree, CircleMarker)).toHaveLength(2)
    expect(ofType(tree, Polyline)).toHaveLength(1)
  })

  it('draws the Set-position spot, and the arrow only once the drag is a heading', () => {
    const pressed = NavGoalMarkers({ ...base, pose: { at: [1, 1], toward: [1.01, 1] } })
    expect(ofType(pressed, CircleMarker)).toHaveLength(1)
    expect(ofType(pressed, Marker)).toHaveLength(0)
    const dragged = NavGoalMarkers({ ...base, pose: { at: [1, 1], toward: [2, 1] } })
    expect(ofType(dragged, Polyline)).toHaveLength(1)
    expect(ofType(dragged, Marker)).toHaveLength(1)
  })

  describe('the route Nav2 is planning (nav/path)', () => {
    const walking = { x_m: 4, y_m: 4 }
    const path = { points: [[-2, 0], [4, 0], [4, 4]] as Point2D[], failed: false, lengthM: 10 }
    const lineProps = (tree: ReactNode) => ofType(tree, Polyline).map((l) => l.props as {
      positions: unknown; pathOptions: { color: string; weight: number; dashArray?: string }
    })

    it('draws it solid in the accent colour instead of the dashed line, as heavy as the goal line', () => {
      const lines = lineProps(NavGoalMarkers({ ...base, walking, path }))
      expect(lines).toHaveLength(1)
      expect(lines[0].pathOptions).toEqual({ color: color.accent, weight: 2 })
      expect(lines[0].pathOptions.dashArray).toBeUndefined()
      expect(ofType(NavGoalMarkers({ ...base, walking, path }), CircleMarker)).toHaveLength(2) // the goal pin stays
    })

    it('starts it at the robot: the part of the path behind it is dropped', () => {
      const [line] = lineProps(NavGoalMarkers({ ...base, from: { x_m: 1, y_m: 0.5 }, walking, path }))
      // [lat, lng] = [y, x]: from (1, 0) on the path, then its own vertices.
      expect(line.positions).toEqual([[0, 1], [0, 4], [4, 4]])
    })

    it('draws the whole path when the robot is not on the map', () => {
      const [line] = lineProps(NavGoalMarkers({ ...base, from: null, walking, path }))
      expect(line.positions).toEqual([[0, -2], [0, 4], [4, 4]])
    })

    it('draws it amber while the planner cannot find a route and the robot follows the last one', () => {
      const [line] = lineProps(NavGoalMarkers({ ...base, walking, path: { ...path, failed: true } }))
      expect(line.pathOptions.color).toBe(color.amber)
    })

    it('keeps the dashed line with no path, or one with nothing to draw', () => {
      for (const p of [null, undefined, { points: [], failed: true, lengthM: null }, { points: [[1, 1]] as Point2D[], failed: false, lengthM: 0 }]) {
        const lines = lineProps(NavGoalMarkers({ ...base, walking, path: p }))
        expect(lines, JSON.stringify(p)).toHaveLength(1)
        expect(lines[0].positions).toEqual([[0, 0], [4, 4]])
        expect(lines[0].pathOptions.dashArray).toBeTruthy()
      }
    })

    it('draws no path without a walk (the goal ended)', () => {
      expect(ofType(NavGoalMarkers({ ...base, pending: null, walking: null, path }), Polyline)).toHaveLength(0)
    })
  })

  it('never makes a marker the map could take a click on', () => {
    const tree = NavGoalMarkers({ ...base, pending: [3, 4], walking: { x_m: 1, y_m: 2 }, pose: { at: [1, 1], toward: [2, 1] } })
    for (const e of [...ofType(tree, CircleMarker), ...ofType(tree, Polyline), ...ofType(tree, Marker)]) {
      expect((e.props as { interactive?: boolean }).interactive).toBe(false)
    }
  })
})

describe('floorIdOf', () => {
  it('names a floor by its index, as text', () => {
    expect(floorIdOf({ index: 0 })).toBe('0')
    expect(floorIdOf({ index: 2 })).toBe('2')
  })
})
