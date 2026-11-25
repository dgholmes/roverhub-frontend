// @vitest-environment jsdom
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Pixels per map metre the fake map reports; each test sets what it needs. */
let ppm = 100

interface DivIconLike {
  options: { html: string; iconSize: [number, number]; iconAnchor: [number, number] }
}

/** The divIcon the last render handed to Leaflet. */
let icon: DivIconLike | null = null

const fakeMap = {
  latLngToLayerPoint: ([lat, lng]: [number, number]) => ({ x: lng * ppm, y: -lat * ppm }),
  on: () => {}, off: () => {},
}

vi.mock('react-leaflet', () => ({
  useMap: () => fakeMap,
  Marker: (p: { icon: DivIconLike }) => { icon = p.icon; return null },
  Popup: () => null,
  Tooltip: () => null,
}))

import { RobotMarker } from './RobotMarker'
import { BEAM_SPREAD_DEG, MIN_BODY_PX, beamGradientBox, beamReachPx } from '@/liveops/robotMarkerShape'
import { ROBOT_BODY_LENGTH_M } from '@/liveops/robotBody'
import type { RobotState } from '@/types'

const robot = (over: Partial<RobotState['position']> = {}, rest: Partial<RobotState> = {}): RobotState => ({
  robot_id: 'rover-jetson', name: 'rover-jetson',
  abstract_state: 'STAND', sdk_state: 'balance_stand',
  position: { x_m: 1, y_m: 2, heading_deg: 0, freshness: 'live', ...over },
  ...rest,
} as RobotState)

function drawIcon(r: RobotState, selected = true): DivIconLike {
  icon = null
  renderToStaticMarkup(<RobotMarker robot={r} selected={selected} />)
  // Cast, because the assignment happens inside the vi.mock factory and the
  // compiler cannot see it: without this it narrows `icon` to never.
  const built = icon as DivIconLike | null
  if (!built) throw new Error('no icon was built')
  return built
}

function draw(r: RobotState, selected = true): string {
  return drawIcon(r, selected).options.html
}

/** Every number in the body path, which is the only path with a Q in it. */
function bodyExtent(html: string): number {
  const m = html.match(/<path d="(M[^"]*Q[^"]*)"/)
  if (!m) throw new Error('no body path')
  return Math.max(...[...m[1]!.matchAll(/-?\d+(?:\.\d+)?/g)].map((x) => Math.abs(Number(x[0]))))
}

beforeEach(() => { ppm = 100 })

describe('RobotMarker', () => {
  it('draws the body at the robot\'s true size', () => {
    // 100 px/m, so the 0.65 m body is 65 px long and reaches 32.5 either way.
    expect(bodyExtent(draw(robot()))).toBeCloseTo(ROBOT_BODY_LENGTH_M * 100 / 2, 1)
  })

  it('grows the body with the zoom', () => {
    const near = bodyExtent(draw(robot()))
    ppm = 200
    expect(bodyExtent(draw(robot()))).toBeCloseTo(near * 2, 1)
  })

  // Zoomed out to a whole floor the true body is a speck, and a robot the
  // operator cannot find or click is worse than one drawn slightly large.
  it('stops shrinking at the floor size', () => {
    ppm = 2
    expect(bodyExtent(draw(robot()))).toBeCloseTo(MIN_BODY_PX / 2, 1)
  })

  // A tint of the state colour. A dark card fill like the classic marker's
  // was tried and taken back the same day (user, 2026-11-25).
  it('tints the body with the state colour', () => {
    const html = draw(robot())
    const body = html.match(/<path d="M[^"]*Q[^"]*" fill="([^"]+)" fill-opacity="([^"]+)"/)
    expect(body?.[1]).not.toBe('var(--rh-card)')
    expect(Number(body?.[2])).toBeCloseTo(0.32, 2)
  })

  it('turns the body to the heading, with +x east', () => {
    expect(draw(robot({ heading_deg: 0 }))).toContain('rotate(0)')
    expect(draw(robot({ heading_deg: 90 }))).toContain('rotate(-90)')
  })

  it('survives a bridge sending no heading', () => {
    expect(() => draw(robot({ heading_deg: Number.NaN }))).not.toThrow()
    expect(draw(robot({ heading_deg: Number.NaN }))).toContain('rotate(0)')
  })

  describe('the beam', () => {
    it('is drawn for the robot being driven', () => {
      expect(draw(robot())).toContain('radialGradient')
    })

    it('is not drawn for the other robots on the site', () => {
      expect(draw(robot(), false)).not.toContain('radialGradient')
    })

    // A sector drawn from the centre is widest where the body already is,
    // which reads as a triangle stuck to the nose (user, 2026-11-25).
    it('starts at the nose, so none of it lies over the body', () => {
      const html = draw(robot())
      const beam = html.match(/<path d="(M[^"]*A[^"]*)" fill="url/)
      expect(beam).toBeTruthy()
      expect(beam![1]!.startsWith('M0,0')).toBe(false)
    })

    it('has rounded corners', () => {
      const html = draw(robot())
      const beam = html.match(/<path d="(M[^"]*A[^"]*)" fill="url/)![1]!
      // The front, the arc at the nose, and four small corner arcs.
      expect(beam.match(/ A/g)).toHaveLength(6)
    })

    // The gradient is pinned to the beam as it was before the corners were
    // rounded, so rounding them does not move the fade (user, 2026-11-25).
    it('keeps its gradient where it was before the corners were rounded', () => {
      const html = draw(robot())
      const lengthPx = ROBOT_BODY_LENGTH_M * 100
      const box = beamGradientBox(beamReachPx(lengthPx), BEAM_SPREAD_DEG, lengthPx / 2)
      expect(html).toContain('gradientUnits="userSpaceOnUse"')
      const m = html.match(/gradientTransform="translate\(([-\d.]+),0\) scale\(([-\d.]+),([-\d.]+)\)"/)
      expect(m).toBeTruthy()
      expect(Number(m![1])).toBeCloseTo(box.cx, 1)
      expect(Number(m![2])).toBeCloseTo(box.rx, 1)
      expect(Number(m![3])).toBeCloseTo(box.ry, 1)
    })
  })

  describe('position confidence', () => {
    // The amber dot it replaced was always on, so it told the operator nothing.
    it('shows nothing extra while the position is live', () => {
      const html = draw(robot({ freshness: 'live' }))
      expect(html).not.toContain('--rh-amber')
      expect(html).not.toContain('stroke-dasharray="4 3"')
    })

    it('shows a halo, and dashes the body, once the position is not live', () => {
      const html = draw(robot({ freshness: 'stale' }))
      expect(html).toContain('--rh-amber')
      expect(html).toContain('stroke-dasharray="4 3"')
    })
  })

  it('gives the icon a box big enough for the beam at any rotation', () => {
    const built = drawIcon(robot())
    const [w, h] = built.options.iconSize
    const beam = Math.max(...[...built.options.html.matchAll(/A(\d+(?:\.\d+)?),/g)].map((m) => Number(m[1])))
    expect(w).toBeGreaterThanOrEqual(beam * 2)
    expect(h).toBe(w)
    expect(built.options.iconAnchor).toEqual([w / 2, h / 2])
  })

  it('keeps two robots\' beam gradients apart', () => {
    const a = draw(robot())
    const b = draw(robot({}, { robot_id: 'rover-pi', name: 'rover-pi' }))
    const id = (s: string) => s.match(/id="([^"]+)"/)?.[1]
    expect(id(a)).not.toBe(id(b))
  })
})
