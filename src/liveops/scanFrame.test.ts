import { describe, expect, it } from 'vitest'
import { MAX_SCAN_POINTS } from '@/types/scan'
import { SCAN_FADE_MS, SCAN_HIDE_MS, parseScanFrame, scanVisibility, type ScanSample } from './scanFrame'

const wire = (over: Record<string, unknown> = {}) => ({
  robot_id: 'rover-jetson', site_id: 'site-office', map_id: 'map-office', captured_at: '2026-11-11T09:00:00Z',
  sensor_pose: { x_m: 1.2, y_m: -0.4, yaw_rad: 0.5 },
  points: [[1.5, 2.25], [-3, 0.1]],
  ...over,
})

describe('parseScanFrame', () => {
  it('reads a valid frame as it is', () => {
    expect(parseScanFrame(wire())).toEqual(wire())
  })

  it('reads a frame through a JSON round trip, and an empty scan', () => {
    expect(parseScanFrame(JSON.parse(JSON.stringify(wire())))?.points).toHaveLength(2)
    expect(parseScanFrame(wire({ points: [] }))?.points).toEqual([])
  })

  it('takes exactly MAX_SCAN_POINTS, and refuses one more', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => [i * 0.01, 0])
    expect(parseScanFrame(wire({ points: many(MAX_SCAN_POINTS) }))?.points).toHaveLength(MAX_SCAN_POINTS)
    expect(parseScanFrame(wire({ points: many(MAX_SCAN_POINTS + 1) }))).toBeNull()
  })

  it('refuses the whole frame when anything is malformed', () => {
    const bad: unknown[] = [
      null, 'scan', [], 42,
      wire({ robot_id: undefined }), wire({ robot_id: '' }), wire({ map_id: '' }), wire({ map_id: 7 }),
      wire({ site_id: null }), wire({ captured_at: undefined }),
      wire({ sensor_pose: null }), wire({ sensor_pose: { x_m: 1, y_m: 2 } }), wire({ sensor_pose: { x_m: 1, y_m: 2, yaw_rad: 'north' } }),
      wire({ points: 'many' }), wire({ points: [[1]] }), wire({ points: [[1, 2, 3]] }), wire({ points: [[1, '2']] }),
      wire({ points: [[1, 2], null] }), wire({ points: [[1, Number.NaN]] }), wire({ points: [[Infinity, 0]] }),
    ]
    for (const raw of bad) expect(parseScanFrame(raw), JSON.stringify(raw)).toBeNull()
  })

  it('keeps only the schema fields', () => {
    expect(parseScanFrame(wire({ extra: 'x' }))).not.toHaveProperty('extra')
  })
})

describe('scanVisibility', () => {
  const sample = (map_id = 'map-office', receivedAt = 10_000): ScanSample => ({
    frame: parseScanFrame(wire({ map_id }))!, receivedAt,
  })

  it('is hidden with no frame, or no map shown', () => {
    expect(scanVisibility(null, 'map-office', 10_000)).toBe('hidden')
    expect(scanVisibility(sample(), null, 10_000)).toBe('hidden')
  })

  it('is hidden for a frame taken against another map', () => {
    expect(scanVisibility(sample('map-venue'), 'map-office', 10_000)).toBe('hidden')
  })

  it('is live when fresh, fades at 2 s and is gone at 5 s', () => {
    expect(scanVisibility(sample(), 'map-office', 10_000)).toBe('live')
    expect(scanVisibility(sample(), 'map-office', 10_000 + SCAN_FADE_MS - 1)).toBe('live')
    expect(scanVisibility(sample(), 'map-office', 10_000 + SCAN_FADE_MS)).toBe('fading')
    expect(scanVisibility(sample(), 'map-office', 10_000 + SCAN_HIDE_MS - 1)).toBe('fading')
    expect(scanVisibility(sample(), 'map-office', 10_000 + SCAN_HIDE_MS)).toBe('hidden')
    expect([SCAN_FADE_MS, SCAN_HIDE_MS]).toEqual([2000, 5000])
  })
})
