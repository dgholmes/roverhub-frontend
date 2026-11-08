import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import '@/i18n'
import { mockMaps } from '@/mocks/maps'

const provider = vi.hoisted(() => ({ artifactUrl: '' }))
vi.mock('@/lib/realtime/dataProvider', () => ({
  dataProvider: { mapArtifactUrl: () => provider.artifactUrl },
}))

import { CloudPanelOverlay, CloudToggle } from './CloudControls'

const venue = mockMaps[0]

beforeEach(() => { provider.artifactUrl = 'http://api.test/maps/map-venue-survey/floors/0/cloud' })

describe('CloudToggle', () => {
  it('is a labelled button that reports it is closed', () => {
    const html = renderToStaticMarkup(<CloudToggle open={false} onToggle={() => {}} />)
    expect(html).toContain('<button')
    expect(html).toMatch(/aria-pressed="false"/)
    expect(html).toMatch(/aria-label="Show 3D view"/)
  })

  it('reports it is open and offers to hide', () => {
    const html = renderToStaticMarkup(<CloudToggle open onToggle={() => {}} />)
    expect(html).toMatch(/aria-pressed="true"/)
    expect(html).toMatch(/aria-label="Hide 3D view"/)
  })

  it('draws no outline', () => {
    expect(renderToStaticMarkup(<CloudToggle open={false} onToggle={() => {}} />)).not.toMatch(/border:\s*\d+px solid/)
  })

  it('is memoized, so a telemetry re-render with the same props skips it', () => {
    // React.memo components carry a $$typeof of react.memo.
    expect((CloudToggle as unknown as { $$typeof: symbol }).$$typeof.toString()).toBe('Symbol(react.memo)')
  })
})

describe('CloudPanelOverlay', () => {
  it('renders nothing while closed: no panel, no viewer, no fetch', () => {
    expect(renderToStaticMarkup(<CloudPanelOverlay open={false} map={venue} floorIndex={0} />)).toBe('')
  })

  it('shows the floor detail once open', () => {
    const html = renderToStaticMarkup(<CloudPanelOverlay open map={venue} floorIndex={0} />)
    expect(html).toContain(venue.name)
  })

  it('says there is no cloud when the provider has no URL, as in mock mode', () => {
    provider.artifactUrl = ''
    expect(renderToStaticMarkup(<CloudPanelOverlay open map={venue} floorIndex={0} />)).toMatch(/no 3D cloud/i)
  })

  it('is memoized', () => {
    expect((CloudPanelOverlay as unknown as { $$typeof: symbol }).$$typeof.toString()).toBe('Symbol(react.memo)')
  })
})
