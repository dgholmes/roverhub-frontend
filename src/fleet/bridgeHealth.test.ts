import { describe, expect, it } from 'vitest'
import { bridgeLiveness, deviceHostFromUrl, formatAge, schemaMatch } from './bridgeHealth'
import { EXPECTED_SCHEMA_VERSION } from '@/lib/schemaVersion'

const NOW = Date.parse('2026-10-13T12:00:00Z')
const ago = (s: number) => new Date(NOW - s * 1000).toISOString()

describe('bridgeLiveness', () => {
  it('is live within three heartbeats', () => expect(bridgeLiveness(ago(10), NOW)).toBe('live'))
  it('is late after three missed beats', () => expect(bridgeLiveness(ago(20), NOW)).toBe('late'))
  it('is silent after a minute', () => expect(bridgeLiveness(ago(61), NOW)).toBe('silent'))
  it('is unknown with no heartbeat yet', () => expect(bridgeLiveness(null, NOW)).toBe('unknown'))
  it('is unknown for an unparseable timestamp', () => expect(bridgeLiveness('nope', NOW)).toBe('unknown'))
})

describe('formatAge', () => {
  it('uses seconds under a minute', () => expect(formatAge(ago(4), NOW)).toBe('4 s ago'))
  it('uses minutes under an hour', () => expect(formatAge(ago(15 * 60), NOW)).toBe('15 min ago'))
  it('says Never with no timestamp', () => expect(formatAge(null, NOW)).toBe('Never'))
})

describe('schemaMatch', () => {
  it('matches the console version', () => expect(schemaMatch(EXPECTED_SCHEMA_VERSION)).toBe('match'))
  it('flags another version', () => expect(schemaMatch('0.0.1')).toBe('mismatch'))
  it('is unknown before registration', () => expect(schemaMatch(null)).toBe('unknown'))
})

describe('deviceHostFromUrl', () => {
  it('reads the host from the relay URL', () => expect(deviceHostFromUrl('http://10.0.12.116:8090')).toBe('10.0.12.116'))
  it('returns null without a URL', () => expect(deviceHostFromUrl(undefined)).toBeNull())
  it('returns null for a malformed URL', () => expect(deviceHostFromUrl('not a url')).toBeNull())
})
