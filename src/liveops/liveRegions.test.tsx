import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '@/i18n'
import type { RobotState } from '@/types'
import type { ActiveGesture } from '@/liveops/gestures'

const gesture = vi.hoisted((): ActiveGesture => ({
  robotId: 'r1', id: 'gongxi', label: 'Gongxi',
  startedAt: Date.now(), seen: true, stopping: false,
}))

// GestureCard reads four things from the store; nothing else of it matters
// here. A selector-style store, so the mock applies the selector to a literal.
vi.mock('@/store/useLiveOpsStore', () => {
  const state = {
    activeGestures: { r1: gesture },
    stopGesture: () => {},
    markGestureSeen: () => {},
    clearGesture: () => {},
  }
  return { useLiveOpsStore: (select: (s: typeof state) => unknown) => select(state) }
})

// NavBar is a plain panel, but it ships in a module that pulls in Leaflet,
// which wants a window. Only the banner is under test.
vi.mock('leaflet', () => ({ default: { divIcon: () => ({}), CRS: { Simple: {} } } }))
vi.mock('react-leaflet', () => ({
  CircleMarker: () => null, Marker: () => null, Polyline: () => null,
  useMap: () => ({}), useMapEvents: () => ({}),
}))

import { GestureCard } from '@/components/liveops/command/GestureCard'
import { NavBar } from '@/components/liveops/map/NavGoalLayer'

// Audit 2026-11-18 §6. Two components wrapped a whole panel in a live region
// and then put a continuously-changing number inside it: GestureCard's 250ms
// countdown, and the nav banner's per-frame distance-to-goal. A screen reader
// re-reads a polite region every time its text changes, so while a robot walks
// to a goal the announcement never stops -- and the one announcement that must
// get through, the E-Stop alert, is queued behind an endless recital of
// "4.1 metres… 4.0 metres… 3.9 metres".
//
// The rule these pin: a live region holds the fact that changed, and nothing
// that ticks. The panel itself is a labelled region, not a live one.

const liveRegions = (html: string): string[] => {
  const out: string[] = []
  // Leaf elements only -- which is the point. A live region with children is
  // one someone has wrapped a panel in again.
  for (const m of html.matchAll(/<(\w+)([^>]*(?:role="status"|aria-live=)[^>]*)>([\s\S]*?)<\/\1>/g)) {
    out.push(m[3])
  }
  return out
}

const countLive = (html: string): number =>
  (html.match(/role="status"|role="alert"|aria-live=/g) ?? []).length

// `gesture.startedAt` is fixed when this module loads, but GestureCard compares
// it to `Date.now()` at render: once the gesture's length has elapsed in real
// time there is no countdown left to assert. Alone the file runs in
// milliseconds; inside the full suite minutes pass between load and these
// assertions, so the clock ran out and both cases failed. Restart it per test.
beforeEach(() => { gesture.startedAt = Date.now() })

describe('GestureCard', () => {
  const robot = {
    robot_id: 'r1', name: 'Rover 1', sdk_state: 'gongxi', abstract_state: 'MANUAL',
  } as RobotState

  const render = () => renderToStaticMarkup(<GestureCard robot={robot} />)

  it('announces the gesture once, without the countdown inside the live region', () => {
    const html = render()

    expect(countLive(html)).toBe(1)
    for (const text of liveRegions(html)) {
      expect(text).not.toMatch(/left|Until stopped/)
      expect(text).not.toMatch(/\d+\.\d/)
    }
  })

  it('still shows the countdown to a sighted operator', () => {
    expect(render()).toMatch(/left|Until stopped/)
  })
})

describe('the nav banner', () => {
  it('does not re-announce every time the distance to the goal changes', () => {
    const html = renderToStaticMarkup(
      <NavBar
        model={{ kind: 'walking', title: 'Walking to goal', detail: '4.1 m away' } as never}
        placement="bottom"
        onStop={() => {}}
        onCancel={() => {}}
        onWalk={() => {}}
        onSetPosition={() => {}}
      />,
    )

    expect(countLive(html)).toBe(1)
    for (const text of liveRegions(html)) {
      expect(text).not.toContain('4.1 m away')
    }
  })
})
