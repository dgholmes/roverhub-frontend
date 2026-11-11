// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import type { RobotState } from '@/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('react-leaflet', () => ({ useMap: () => ({ panTo: vi.fn(), fitBounds: vi.fn() }) }))

import { MapControls } from './MapControls'
import type { MapLayerVisibility } from './MapCanvas'

const robot = { robot_id: 'r1', position: { x_m: 0, y_m: 0 } } as RobotState
const ALL_ON: MapLayerVisibility = {
  geofence: true, noGoZones: true, annotations: true, otherRobots: true, walkable: true, lidar: true,
}

let host: HTMLDivElement
let root: Root
let onToggle: ReturnType<typeof vi.fn>

function render(props: { layers?: MapLayerVisibility; surveyLayers?: boolean } = {}) {
  act(() => root.render(
    <MapControls robot={robot} bounds={[[0, 0], [1, 1]]} layers={props.layers ?? ALL_ON}
      onToggleLayer={onToggle} surveyLayers={props.surveyLayers} />,
  ))
}
const open = () => act(() => host.querySelector<HTMLButtonElement>(`[aria-label="${i18n.t('liveops.map.toggleLayersAria')}"]`)!.click())
const rows = () => [...host.querySelectorAll<HTMLButtonElement>('[role="menuitemcheckbox"]')]
const row = (label: string) => rows().find((b) => b.textContent === label)

beforeEach(async () => {
  await i18n.changeLanguage('en')
  onToggle = vi.fn()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('MapControls layer menu', () => {
  it('offers Walkable area and Live lidar, first, on a surveyed floor', () => {
    render({ surveyLayers: true })
    open()
    expect(rows().map((b) => b.textContent)).toEqual([
      'Walkable area', 'Live lidar', 'Geofences', 'No-Go Zones', 'Annotations', 'Other Robots',
    ])
  })

  it('leaves them out where there is no survey', () => {
    render()
    open()
    expect(row('Walkable area')).toBeUndefined()
    expect(row('Live lidar')).toBeUndefined()
  })

  it('shows each as checked or not, and toggles it by key', () => {
    render({ surveyLayers: true, layers: { ...ALL_ON, lidar: false } })
    open()
    expect(row('Walkable area')!.getAttribute('aria-checked')).toBe('true')
    expect(row('Live lidar')!.getAttribute('aria-checked')).toBe('false')
    act(() => row('Live lidar')!.click())
    act(() => row('Walkable area')!.click())
    expect(onToggle.mock.calls).toEqual([['lidar'], ['walkable']])
  })

  it('is worded in Korean too', async () => {
    await act(() => i18n.changeLanguage('ko'))
    render({ surveyLayers: true })
    open()
    expect(rows().slice(0, 2).map((b) => b.textContent)).toEqual(['보행 가능 영역', '실시간 라이다'])
    await act(() => i18n.changeLanguage('en'))
  })
})
