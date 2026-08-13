import { describe, expect, it } from 'vitest'
import {
  TELEMETRY_DELAYED_AFTER_MS,
  TELEMETRY_LOST_AFTER_MS,
  linkBanner,
  telemetryFreshness,
} from './linkHealth'

describe('telemetryFreshness', () => {
  it('treats a just-received frame as live', () => {
    expect(telemetryFreshness(0)).toBe('live')
    expect(telemetryFreshness(TELEMETRY_DELAYED_AFTER_MS - 1)).toBe('live')
  })

  it('reports delayed once frames stop arriving on schedule', () => {
    expect(telemetryFreshness(TELEMETRY_DELAYED_AFTER_MS)).toBe('delayed')
    expect(telemetryFreshness(TELEMETRY_LOST_AFTER_MS - 1)).toBe('delayed')
  })

  it('reports lost when the gap is long enough that displayed values cannot be trusted', () => {
    expect(telemetryFreshness(TELEMETRY_LOST_AFTER_MS)).toBe('lost')
    expect(telemetryFreshness(60_000)).toBe('lost')
  })

  // Never having received a frame is not the same as a fresh one. Treating a
  // missing timestamp as age 0 is how a UI ends up asserting "live" about data
  // it has never had.
  it('treats never-having-received-a-frame as lost, not live', () => {
    expect(telemetryFreshness(null)).toBe('lost')
  })
})

describe('linkBanner', () => {
  it('shows nothing when connected and telemetry is flowing', () => {
    expect(linkBanner('connected', 'live')).toBeNull()
  })

  it('warns while still establishing the connection', () => {
    expect(linkBanner('connecting', 'lost')?.severity).toBe('info')
  })

  it('warns while reconnecting', () => {
    expect(linkBanner('reconnecting', 'lost')?.severity).toBe('warning')
  })

  it('reports an error when the connection is gone', () => {
    const banner = linkBanner('offline', 'lost')
    expect(banner?.severity).toBe('error')
    expect(banner?.message).toMatch(/disconnected|lost connection/i)
  })

  // The dangerous case: the socket is fine, so nothing looks wrong, but frames
  // stopped arriving and every value on screen is frozen at its last reading
  // while still presenting itself as current.
  it('reports an error when connected but telemetry has stopped', () => {
    const banner = linkBanner('connected', 'lost')
    expect(banner?.severity).toBe('error')
    expect(banner?.message).toMatch(/last known|not updating|telemetry lost/i)
  })

  it('warns when connected but telemetry is merely late', () => {
    expect(linkBanner('connected', 'delayed')?.severity).toBe('warning')
  })

  // A connection problem is the more actionable fact, so it must not be masked
  // by the staleness it causes.
  it('prefers the connection problem over the staleness it causes', () => {
    expect(linkBanner('offline', 'lost')?.message).toEqual(linkBanner('offline', 'delayed')?.message)
  })
})
