// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { MAP_LAYERS_KEY, sessionLayersFrom } from './MapCanvas'

const DEFAULTS = { geofence: true, noGoZones: true, annotations: true, otherRobots: true }

describe('sessionLayersFrom', () => {
  it('is the defaults with nothing remembered', () => {
    expect(sessionLayersFrom(null)).toEqual(DEFAULTS)
    expect(sessionLayersFrom(undefined)).toEqual(DEFAULTS)
  })

  it('applies the remembered toggles', () => {
    expect(sessionLayersFrom({ ...DEFAULTS, noGoZones: false, otherRobots: false }))
      .toEqual({ ...DEFAULTS, noGoZones: false, otherRobots: false })
  })

  it('keeps the default for a layer the stored value does not know', () => {
    expect(sessionLayersFrom({ geofence: false })).toEqual({ ...DEFAULTS, geofence: false })
  })

  it('ignores a value that is not a boolean, key by key', () => {
    expect(sessionLayersFrom({ geofence: 'no', noGoZones: 0, annotations: null, otherRobots: false }))
      .toEqual({ ...DEFAULTS, otherRobots: false })
  })

  it('ignores keys that are not session layers, and anything not an object', () => {
    expect(sessionLayersFrom({ walkable: false, lidar: false })).toEqual(DEFAULTS)
    expect(sessionLayersFrom([false, false])).toEqual(DEFAULTS)
    expect(sessionLayersFrom('geofence')).toEqual(DEFAULTS)
  })

  it('is remembered once per viewer, not per site or robot', () => {
    expect(MAP_LAYERS_KEY).toBe('rh.view.liveops.mapLayers')
  })
})
