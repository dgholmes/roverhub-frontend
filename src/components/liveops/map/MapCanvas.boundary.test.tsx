// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import type { RobotState } from '@/types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Leaflet itself failing stands in for any fault inside the map.
vi.mock('leaflet', () => ({ default: { CRS: { Simple: {} } } }))
vi.mock('react-leaflet', () => ({ MapContainer: (): never => { throw new Error('map layer fault') } }))
vi.mock('@/org/useSiteRobots', () => ({ useSiteRobots: () => [] }))
for (const layer of ['GridLayer', 'RouteLayer', 'DockMarker', 'AnnotationLayer', 'RobotMarker', 'MapControls', 'FloorplanLayer', 'FloorPicker', 'GeofenceLayer', 'NoGoZoneLayer', 'FitToSite']) {
  vi.doMock(`./${layer}`, () => ({ [layer]: () => null }))
}
vi.mock('./CloudControls', () => ({ CloudToggle: () => null, CloudPanelOverlay: () => null }))
vi.mock('./NavGoalLayer', () => ({
  useNavGoal: () => ({ markers: {}, input: {}, tools: {}, bar: {} }),
  NavGoalMarkers: () => null, NavMapInput: () => null, NavTools: () => null, NavBar: () => null,
}))

const { MapCanvas } = await import('./MapCanvas')

let host: HTMLDivElement
let root: Root
let errorLog: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  errorLog = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  errorLog.mockRestore()
})

it('takes down only the map pane, leaving what sits beside it', () => {
  act(() => root.render(
    <div>
      <MapCanvas robot={{ robot_id: 'r1' } as RobotState} />
      <button type="button">camera</button>
    </div>,
  ))
  expect(host.textContent).toContain(i18n.t('common.errorBoundary.pane'))
  expect(host.textContent).toContain('map layer fault')
  expect([...host.querySelectorAll('button')].some((b) => b.textContent === 'camera')).toBe(true)
})
