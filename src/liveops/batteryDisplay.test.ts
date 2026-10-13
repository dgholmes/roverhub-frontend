import { describe, expect, it } from 'vitest'
import { color } from '@/design-system/tokens'
import { batteryLevelColor, formatBatteryPercent, formatRuntimeLeft } from './batteryDisplay'

/**
 * Battery is null whenever the bridge has no reading: gRPC's
 * GetRobotStateResponse carries no battery field at all, so a gRPC-only
 * deployment genuinely cannot know it (only the DDS BMS subscription can).
 * It used to arrive as a fabricated 0.0, which the UI rendered as "0%" — a
 * flat battery, indistinguishable from a real one.
 * See docs/audit/2026-08-12-prd-vs-sdk-direction-audit.md F1.
 */
describe('formatBatteryPercent', () => {
  it('renders a real reading as a percentage', () => {
    expect(formatBatteryPercent(87)).toBe('87%')
  })

  it('renders an unknown reading as a dash, never as 0%', () => {
    expect(formatBatteryPercent(null)).toBe('—')
  })

  it('still renders a genuine zero reading as 0%', () => {
    expect(formatBatteryPercent(0)).toBe('0%')
  })

  it('rounds fractional BMS readings to whole percent', () => {
    expect(formatBatteryPercent(77.88)).toBe('78%')
    expect(formatBatteryPercent(30.4)).toBe('30%')
  })
})

describe('batteryLevelColor', () => {
  it('warns red at or below 15%', () => {
    expect(batteryLevelColor(15)).toBe(color.red)
  })

  it('warns amber at or below 30%', () => {
    expect(batteryLevelColor(30)).toBe(color.amber)
  })

  it('is plain primary text above 30%', () => {
    expect(batteryLevelColor(80)).toBe(color.t1)
  })

  it('is muted, not alarming, when the level is unknown', () => {
    // An unknown battery is not an emergency, and colouring it red would cry
    // wolf on every gRPC-only deployment. It must also not read as healthy.
    const unknown = batteryLevelColor(null)
    expect(unknown).not.toBe(color.red)
    expect(unknown).not.toBe(color.t1)
  })
})

describe('formatRuntimeLeft', () => {
  const b = (percent: number | null, est_runtime_min: number, charging = false) => ({ percent, est_runtime_min, charging })

  it('formats hours and minutes', () => {
    expect(formatRuntimeLeft(b(61, 120))).toBe('2h 0m left')
    expect(formatRuntimeLeft(b(61, 45))).toBe('45m left')
  })

  it('shows nothing for a zero estimate, which is what the real provider always sends', () => {
    expect(formatRuntimeLeft(b(61, 0))).toBeNull()
  })

  it('shows nothing without a level or while charging', () => {
    expect(formatRuntimeLeft(b(null, 120))).toBeNull()
    expect(formatRuntimeLeft(b(61, 120, true))).toBeNull()
  })
})
