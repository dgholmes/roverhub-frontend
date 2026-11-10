import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { sampleSite } from '@/mocks/mockGeoZones'

// A Marker needs a live Leaflet map, which a node-environment test does not
// have: stand it in with a tag carrying the note it would show.
vi.mock('leaflet', () => ({ default: { divIcon: () => ({}) } }))
vi.mock('react-leaflet', () => ({
  Marker: (p: { children?: React.ReactNode }) => <i data-layer="pin">{p.children}</i>,
  Tooltip: (p: { children?: React.ReactNode }) => <>{p.children}</>,
}))

import { AnnotationLayer } from './AnnotationLayer'

const pins = (html: string) => (html.match(/data-layer="pin"/g) ?? []).length

describe('AnnotationLayer', () => {
  it('draws nothing when it is given no pins: there is no real source for them yet', () => {
    expect(renderToStaticMarkup(<AnnotationLayer />)).toBe('')
    expect(renderToStaticMarkup(<AnnotationLayer annotations={[]} />)).toBe('')
  })

  it('draws one pin per annotation it is given, with its note', () => {
    const html = renderToStaticMarkup(<AnnotationLayer annotations={sampleSite.annotations} />)
    expect(sampleSite.annotations.length).toBeGreaterThan(0)
    expect(pins(html)).toBe(sampleSite.annotations.length)
    expect(html).toContain(sampleSite.annotations[0].note)
  })
})
