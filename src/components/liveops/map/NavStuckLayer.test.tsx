import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '@/i18n'

// Leaflet needs a window; the layers are stubbed to write what they were
// given, so the test reads what the map would draw.
vi.mock('leaflet', () => ({ default: { divIcon: (o: { html?: string }) => ({ html: o.html }) } }))
vi.mock('react-leaflet', () => ({
  Polyline: (p: { pathOptions: Record<string, unknown> }) => <i data-line={JSON.stringify(p.pathOptions)} />,
  CircleMarker: () => <i data-dot="" />,
  Marker: (p: { icon: { html?: string } }) => <i data-marker={p.icon.html ?? ''} />,
}))

import { color } from '@/design-system/tokens'
import { stuckRoutes } from '@/liveops/navStuck'
import type { NavGoalStatus, NavStuck } from '@/types/robotState'
import { RouteThumb, StuckRoutesLayer, type StuckView } from './NavStuckLayer'
import { sceneGoalOf, sceneStuckLinesOf } from './LiveScene'

const STUCK: NavStuck = {
  reason: 'no_route', since: '2026-11-18T06:00:00Z', decide_by: '2026-11-18T06:01:00Z',
  failed_route: [[0, 0], [2, 0], [6, 0]], stuck_at: [2, 0],
  routes: [
    { option_id: 'A', points: [[2, 0], [2, 2], [6, 2], [6, 0]], length_m: 8, est_s: 23, end: [6, 0] },
    { option_id: 'B', points: [[2, 0], [2, -4], [6, -4], [6, 0]], length_m: 12, est_s: 34, end: [6, 0] },
  ],
  nearest: null,
  back: { option_id: 'back', points: [[2, 0], [0, 0]], length_m: 2, est_s: null, end: [0, 0] },
}
const GOAL: NavGoalStatus = { goal_id: 'g1', x_m: 6, y_m: 0, yaw_rad: null, map_id: 'm', state: 'stuck', reason: null, updated_at: 't', stuck: STUCK }
const view = (focus: string | null): StuckView => ({
  episode: { goal: GOAL, stuck: STUCK, mode: 'live', firstSeenAt: 0 }, routes: stuckRoutes(STUCK), focus,
})
const lines = (html: string) => [...html.matchAll(/data-line="([^"]*)"/g)].map((m) => JSON.parse(m[1].replace(/&quot;/g, '"')))

describe('StuckRoutesLayer', () => {
  it('draws the failed route red and dotted, then every route in its colour, the focused one last and bold', () => {
    const html = renderToStaticMarkup(<StuckRoutesLayer view={view('B')} />)
    const drawn = lines(html)
    expect(drawn[0]).toMatchObject({ color: color.red, dashArray: '2 8' })
    // A and back dimmed, B (focused) last, wider and whole.
    expect(drawn.slice(1).map((l) => [l.color, l.weight, l.opacity])).toEqual([
      [color.routeA, 4, 0.22], [color.routeBack, 4, 0.22], [color.routeB, 6, 1],
    ])
    expect(drawn.find((l) => l.color === color.routeBack)?.dashArray).toBe('8 7')
  })

  it('labels each route with its length on the line, and crosses out where it stopped', () => {
    const html = renderToStaticMarkup(<StuckRoutesLayer view={view(null)} />)
    expect(html).toContain('A 8.0 m')
    expect(html).toContain('B 12.0 m')
    expect(html).toContain('M-6 -6 L6 6')
    // Nothing dimmed with nothing focused.
    expect(lines(html).every((l) => l.opacity !== 0.22)).toBe(true)
  })

  it('draws nothing for an episode with no routes to say', () => {
    const empty: StuckView = { ...view(null), episode: { ...view(null).episode, stuck: null } }
    expect(renderToStaticMarkup(<StuckRoutesLayer view={empty} />)).toBe('')
  })
})

describe('RouteThumb', () => {
  it('draws the route in its colour over the same box for every row, robot and goal as dots', () => {
    const [a, , back] = stuckRoutes(STUCK)
    const box = { minX: -1, minY: -5, maxX: 7, maxY: 3 }
    const html = renderToStaticMarkup(<RouteThumb route={a} box={box} robotAt={[2, 0]} goal={{ x_m: 6, y_m: 0 }} floorImage={null} />)
    expect(html).toContain('viewBox="-1 -3 8 8"')
    expect(html).toContain('points="2,0 2,-2 6,-2 6,0"')
    expect(html).toContain(color.routeA)
    expect(html.match(/<circle/g)).toHaveLength(2)
    const back3 = renderToStaticMarkup(<RouteThumb route={back} box={box} robotAt={[2, 0]} goal={null} floorImage={null} />)
    expect(back3).toContain('stroke-dasharray="5 4"')
    expect(back3.match(/<circle/g)).toHaveLength(1)
  })

  it('lays the painted floor under it, north up, where there is one', () => {
    const [a] = stuckRoutes(STUCK)
    const html = renderToStaticMarkup(<RouteThumb
      route={a} box={{ minX: 0, minY: 0, maxX: 1, maxY: 1 }} robotAt={[0, 0]} goal={null}
      floorImage={{ url: 'blob:floor', bounds: [[-2, -3], [4, 5]] }}
    />)
    expect(html).toMatch(/<image href="blob:floor" x="-3" y="-4" width="8" height="6"/)
  })
})

describe('the 3D scene', () => {
  it('draws the same lines, the focused one over the faded rest', () => {
    const out = sceneStuckLinesOf(view('A'))!
    expect(out.map((l) => [l.colourVar, l.dashed, l.opacity])).toEqual([
      ['--rh-red', true, 0.8], ['--rh-route-b', false, 0.25], ['--rh-route-back', true, 0.25], ['--rh-route-a', false, 1],
    ])
    expect([...out[3].points]).toEqual([2, 0, 2, 2, 6, 2, 6, 0])
    expect(sceneStuckLinesOf(null)).toBeNull()
  })

  it('keeps the stuck goal’s pin, with no line to it', () => {
    expect(sceneGoalOf({ from: { x_m: 0, y_m: 0 }, pending: null, pendingRefused: false, walking: null, held: { x_m: 6, y_m: 0 } }))
      .toEqual({ goal: { x: 6, y: 0 }, line: false })
  })
})
