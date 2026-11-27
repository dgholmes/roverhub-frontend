// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import { PeopleFeed } from '@/liveops/people'
import type { PeopleFrame } from '@/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// A provider whose people frames the test pushes by hand.
const provider = vi.hoisted(() => ({ feed: null as unknown as PeopleFeed }))
vi.mock('@/lib/realtime/dataProvider', async () => {
  const { PeopleFeed: Feed } = await import('@/liveops/people')
  provider.feed = new Feed()
  return { dataProvider: { subscribePeople: (id: string, l: never) => provider.feed.subscribe(id, l) } }
})

import { useSessionStore } from '@/store/useSessionStore'
import { DetectionsToggle } from './DetectionsToggle'
import { PeopleOverlay } from './PeopleOverlay'

const frame = (people: PeopleFrame['people'] = []): PeopleFrame => ({
  robot_id: 'r1', site_id: 's', camera: 'front', at: new Date().toISOString(), people,
})

let root: Root
let host: HTMLDivElement
beforeEach(() => {
  vi.useFakeTimers()
  provider.feed.clear()
  useSessionStore.setState({ cameraDetections: false })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

const button = () => host.querySelector('[data-testid="detections-toggle"]') as HTMLButtonElement

describe('DetectionsToggle', () => {
  it('is disabled, saying why, while the robot sends no people frames', () => {
    act(() => root.render(<DetectionsToggle robotId="r1" />))
    expect(button().disabled).toBe(true)
    expect(button().parentElement?.title).toMatch(/no detections/i)
  })

  it('comes on with the first frame, toggles the remembered setting, and goes off when frames stop', () => {
    act(() => root.render(<DetectionsToggle robotId="r1" />))
    act(() => provider.feed.push(frame()))
    expect(button().disabled).toBe(false)
    act(() => button().click())
    expect(useSessionStore.getState().cameraDetections).toBe(true)
    expect(localStorage.getItem('rh.view.liveops.cameraDetections')).toBe('true')
    expect(button().getAttribute('aria-pressed')).toBe('true')
    act(() => { vi.advanceTimersByTime(1600) })
    expect(button().disabled).toBe(true)
  })
})

describe('PeopleOverlay', () => {
  it('draws a box, its label and the sure limbs, and takes no clicks', () => {
    const keypoints = Array.from({ length: 17 }, () => [0.5, 0.5, 0.9] as [number, number, number])
    const people = [{ label: 'person', confidence: 0.92, bbox: [0.1, 0.1, 0.2, 0.5] as [number, number, number, number], camera: 'front', model: 'm', keypoints }]
    act(() => root.render(<div><PeopleOverlay frame={frame(people)} fit="contain" /></div>))
    const svg = host.querySelector('[data-testid="people-overlay"]') as SVGSVGElement
    expect(svg.style.pointerEvents).toBe('none')
    expect(svg.querySelectorAll('[data-person]')).toHaveLength(1)
    expect(svg.textContent).toContain('person 92%')
    expect(svg.querySelectorAll('line')).toHaveLength(16)
  })
})
