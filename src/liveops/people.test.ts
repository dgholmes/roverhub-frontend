import { describe, expect, it, vi } from 'vitest'
import type { PeopleFrame } from '@/types'
import {
  COCO_SKELETON, PEOPLE_CLEAR_MS, PeopleFeed, contentRect, drawPeople, parsePeopleFrame, peopleFresh,
} from './people'

const frame = (at: string, extra: Partial<PeopleFrame> = {}): PeopleFrame => ({
  robot_id: 'r1', site_id: 's', camera: 'front', at, people: [], ...extra,
})

const person = {
  label: 'person', confidence: 0.92, bbox: [0.25, 0.1, 0.5, 0.8], camera: 'front', model: 'dfine_s', track_id: 't1',
  keypoints: null,
}

describe('parsePeopleFrame', () => {
  it('reads a frame, an empty one included', () => {
    expect(parsePeopleFrame(frame('2026-11-27T00:00:00Z'))).toEqual(frame('2026-11-27T00:00:00Z'))
    const f = parsePeopleFrame({ ...frame('t'), people: [person] })
    expect(f?.people).toHaveLength(1)
    expect(f?.people[0]).toMatchObject({ label: 'person', confidence: 0.92, bbox: [0.25, 0.1, 0.5, 0.8], keypoints: null })
  })

  it('refuses what is not a frame', () => {
    for (const bad of [null, [], 'x', { robot_id: 'r1', at: 't' }, { robot_id: '', at: 't', people: [] }, { robot_id: 'r1', people: [] }]) {
      expect(parsePeopleFrame(bad)).toBeNull()
    }
  })

  it('leaves out a person with a box off the frame or a confidence that is not 0..1, keeping the rest', () => {
    const f = parsePeopleFrame({
      ...frame('t'),
      people: [person, { ...person, bbox: [0, 0, 3, 1] }, { ...person, confidence: 1.5 }, { ...person, bbox: [0, 0, 1] }, 7],
    })
    expect(f?.people).toHaveLength(1)
  })

  it('drops malformed keypoints but keeps the box', () => {
    const f = parsePeopleFrame({ ...frame('t'), people: [{ ...person, keypoints: [[0.1, 0.2]] }] })
    expect(f?.people[0].keypoints).toBeNull()
  })
})

describe('PeopleFeed', () => {
  it('hands the latest to a new subscriber, then each new frame', () => {
    const feed = new PeopleFeed()
    feed.push(frame('2026-11-27T00:00:00.000Z'), 1000)
    const got = vi.fn()
    feed.subscribe('r1', got)
    feed.handlePayload(JSON.stringify(frame('2026-11-27T00:00:00.100Z')), 1100)
    expect(got).toHaveBeenCalledTimes(2)
    expect(got.mock.calls[1][0].receivedAt).toBe(1100)
  })

  it('drops a frame more than a second older than the newest kept, and junk', () => {
    const feed = new PeopleFeed()
    const got = vi.fn()
    feed.subscribe('r1', got)
    feed.push(frame('2026-11-27T00:00:02.000Z'))
    feed.push(frame('2026-11-27T00:00:00.500Z'))
    feed.push(frame('2026-11-27T00:00:01.500Z'))
    feed.handlePayload('{not json')
    expect(got.mock.calls.map((c) => c[0].frame.at)).toEqual(['2026-11-27T00:00:02.000Z', '2026-11-27T00:00:01.500Z'])
  })

  it('knows whether anyone watches a robot', () => {
    const feed = new PeopleFeed()
    const off = feed.subscribe('r1', () => {})
    expect(feed.watched('r1')).toBe(true)
    off()
    expect(feed.watched('r1')).toBe(false)
  })
})

it('counts a sample as fresh for PEOPLE_CLEAR_MS', () => {
  const s = { frame: frame('t'), receivedAt: 10_000 }
  expect(peopleFresh(s, 10_000 + PEOPLE_CLEAR_MS - 1)).toBe(true)
  expect(peopleFresh(s, 10_000 + PEOPLE_CLEAR_MS)).toBe(false)
  expect(peopleFresh(null)).toBe(false)
})

describe('contentRect', () => {
  it('letterboxes a 16:9 picture in a 4:3 pane when fitted', () => {
    expect(contentRect({ width: 800, height: 600 }, { width: 1280, height: 720 }, 'contain'))
      .toEqual({ x: 0, y: 75, width: 800, height: 450 })
  })

  it('crops it when filling', () => {
    const r = contentRect({ width: 800, height: 600 }, { width: 1280, height: 720 }, 'cover')
    expect(r.height).toBe(600)
    expect(r.width).toBeCloseTo(1066.67, 1)
    expect(r.x).toBeCloseTo(-133.33, 1)
  })

  it("zooms about the centre for Steady's crop, and assumes 16:9 before the picture's size is known", () => {
    const r = contentRect({ width: 1600, height: 900 }, { width: 0, height: 0 }, 'contain', 2)
    expect(r).toEqual({ x: -800, y: -450, width: 3200, height: 1800 })
  })
})

describe('drawPeople', () => {
  const rect = { x: 0, y: 75, width: 800, height: 450 }

  it('places the box on the picture, not the pane', () => {
    const [p] = drawPeople([{ ...person, bbox: [0.25, 0.1, 0.5, 0.8] } as never], rect)
    expect(p.box).toEqual({ x: 200, y: 120, width: 400, height: 360 })
    expect(p.limbs).toEqual([])
  })

  it('draws a limb only between two keypoints both at least 0.3 sure', () => {
    const keypoints = Array.from({ length: 17 }, (_, i) => [i / 20, i / 20, 0.9] as [number, number, number])
    keypoints[9] = [0.5, 0.5, 0.2] // left wrist unsure: its limb (7-9) goes
    const [p] = drawPeople([{ ...person, keypoints } as never], rect)
    expect(p.limbs).toHaveLength(COCO_SKELETON.length - 1)
    expect(p.joints).toHaveLength(16)
  })
})
