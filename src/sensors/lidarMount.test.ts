import { beforeAll, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import type { TimelineEvent } from '@/types'
import type { LidarMountStatus } from '@/types/sensors'
import {
  LidarMoveAlerts, bridgeHasSensors, formToMount, measuredMount, mountRows, mountToForm, parseLidarMountStatus,
} from './lidarMount'
import { hashForRobotSensors, robotFromSensorsHash, watchLidarMoves } from './lidarMountAlerts'

const wire = (over: Record<string, unknown> = {}) => ({
  robot_id: 'rover-jetson', site_id: 'site-dev', mode: 'suggest',
  in_use: { x_m: 0.234, y_m: 0.015, z_m: 0.25, roll_deg: 0, pitch_deg: 5.9, yaw_deg: 0 },
  measured: {
    x_m: 0.251, y_m: 0.012, sd_x_m: 0.008, sd_y_m: 0.006, roll_deg: 0.2, pitch_deg: 12.4, sd_tilt_deg: 0.3,
    turns: 184, still_samples: 5120, since: '2026-11-14T00:00:00Z', updated_at: '2026-11-16T08:00:00Z',
  },
  differs: true,
  history: [{ at: '2026-11-13T00:00:00Z', mount: { x_m: 0.234, y_m: 0.015, z_m: 0.25 }, source: 'manual', by: 'eng-1' }],
  updated_at: '2026-11-16T08:00:00Z',
  ...over,
})

beforeAll(async () => { await i18n.changeLanguage('en') })

describe('parseLidarMountStatus', () => {
  it('reads a status, defaulting the angles a history entry leaves out', () => {
    const s = parseLidarMountStatus(wire())!
    expect(s.mode).toBe('suggest')
    expect(s.differs).toBe(true)
    expect(s.measured?.turns).toBe(184)
    expect(s.history[0].mount).toEqual({ x_m: 0.234, y_m: 0.015, z_m: 0.25, roll_deg: 0, pitch_deg: 0, yaw_deg: 0 })
  })

  it('accepts no estimate, and drops a malformed history entry rather than the status', () => {
    const s = parseLidarMountStatus(wire({ measured: null, history: [{ at: 'x', mount: {}, source: 'manual' }] }))!
    expect(s.measured).toBeNull()
    expect(s.history).toEqual([])
  })

  it('refuses what is not a status', () => {
    expect(parseLidarMountStatus(null)).toBeNull()
    expect(parseLidarMountStatus(wire({ mode: 'sometimes' }))).toBeNull()
    expect(parseLidarMountStatus(wire({ in_use: { x_m: 'far' } }))).toBeNull()
    expect(parseLidarMountStatus(wire({ robot_id: '' }))).toBeNull()
  })
})

describe('the table', () => {
  it('puts in use next to measured, flags clear differences, and says height and yaw are typed only', () => {
    const rows = mountRows(parseLidarMountStatus(wire())!)
    const by = Object.fromEntries(rows.map((r) => [r.key, r]))
    expect(by.forward).toMatchObject({ inUse: 0.234, measured: 0.251, sd: 0.008, differs: false })
    expect(by.left).toMatchObject({ measured: 0.012, differs: false })
    expect(by.pitch).toMatchObject({ measured: 12.4, sd: 0.3, differs: true })
    expect(by.height).toMatchObject({ typedOnly: true, measured: null })
    expect(by.yaw).toMatchObject({ typedOnly: true })
  })

  it('shows an offset still being measured as measuring, not as a value, and never as different', () => {
    const rows = mountRows(parseLidarMountStatus(wire({ in_use: { x_m: 0.1, y_m: 0.015, z_m: 0.25 }, measured: { ...wire().measured, turns: 5 } }))!)
    expect(rows.find((r) => r.key === 'forward')).toMatchObject({ measured: null, measuring: true, differs: false })
    expect(rows.find((r) => r.key === 'pitch')).toMatchObject({ measured: 12.4, measuring: false })
    const noTilt = mountRows(parseLidarMountStatus(wire({ measured: { ...wire().measured, pitch_deg: null, roll_deg: null, sd_tilt_deg: null } }))!)
    expect(noTilt.find((r) => r.key === 'pitch')).toMatchObject({ measured: null, measuring: true })
  })

  it('flags an offset more than 3 cm out', () => {
    const rows = mountRows(parseLidarMountStatus(wire({ in_use: { x_m: 0.2, y_m: 0.015, z_m: 0.25 } }))!)
    expect(rows.find((r) => r.key === 'forward')?.differs).toBe(true)
  })
})

describe('Apply measured', () => {
  it('takes the measured offset and keeps the tilt, height and yaw in use', () => {
    const s = parseLidarMountStatus(wire({ in_use: { x_m: 0.234, y_m: 0.015, z_m: 0.31, pitch_deg: 5.9, yaw_deg: 2 } }))!
    expect(measuredMount(s)).toEqual({ ok: true, mount: { x_m: 0.251, y_m: 0.012, z_m: 0.31, roll_deg: 0, pitch_deg: 5.9, yaw_deg: 2 } })
  })

  it('takes the tilt measured standing still only when asked', () => {
    const s = parseLidarMountStatus(wire({ in_use: { x_m: 0.234, y_m: 0.015, z_m: 0.31, pitch_deg: 5.9, yaw_deg: 2 } }))!
    expect(measuredMount(s, true)).toEqual({ ok: true, mount: { x_m: 0.251, y_m: 0.012, z_m: 0.31, roll_deg: 0.2, pitch_deg: 12.4, yaw_deg: 2 } })
  })

  it('has nothing to apply before the offset is trusted: 8 turns and a spread under 1.5 cm', () => {
    const base = wire().measured
    expect(measuredMount(parseLidarMountStatus(wire({ measured: { ...base, turns: 7 } }))!)).toEqual({ ok: false, reason: 'nothing' })
    expect(measuredMount(parseLidarMountStatus(wire({ measured: { ...base, sd_y_m: 0.015 } }))!)).toEqual({ ok: false, reason: 'nothing' })
    expect(measuredMount(parseLidarMountStatus(wire({ measured: { ...base, turns: 8, sd_x_m: 0.0149 } }))!).ok).toBe(true)
  })

  it('has nothing to apply before an offset is measured, and refuses one out of range', () => {
    const base = wire().measured
    expect(measuredMount(parseLidarMountStatus(wire({ measured: { ...base, x_m: null } }))!)).toEqual({ ok: false, reason: 'nothing' })
    expect(measuredMount(parseLidarMountStatus(wire({ measured: { ...base, pitch_deg: 60 } }))!, true)).toEqual({ ok: false, reason: 'outOfRange' })
  })
})

describe('Edit values', () => {
  it('round-trips the mount in use', () => {
    const s = parseLidarMountStatus(wire())!
    expect(formToMount(mountToForm(s.in_use))).toEqual({ ok: true, mount: s.in_use })
  })

  it('says what is wrong with each field, by the schema bounds, and reads a comma as a point', () => {
    const form = { ...mountToForm(parseLidarMountStatus(wire())!.in_use), x_m: '', y_m: 'left', z_m: '2', pitch_deg: '5,5' }
    const r = formToMount(form)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors).toEqual({ x_m: 'required', y_m: 'notNumber', z_m: 'outOfRange' })
    expect(formToMount({ ...mountToForm(parseLidarMountStatus(wire())!.in_use), pitch_deg: '5,5' })).toMatchObject({ ok: true, mount: { pitch_deg: 5.5 } })
  })
})

describe('the bell', () => {
  const status = (over: Partial<LidarMountStatus> = {}) => ({ ...parseLidarMountStatus(wire())!, ...over })

  it('alerts once per change, not on every status', () => {
    const a = new LidarMoveAlerts()
    expect(a.observe(status())).toBe(true)
    expect(a.observe(status({ updated_at: 'later' }))).toBe(false)
    expect(a.observe(status({ differs: false }))).toBe(false)
    expect(a.observe(status())).toBe(true)
    // A new mount in use that still differs is a new change.
    expect(a.observe(status({ in_use: { ...status().in_use, x_m: 0.3 } }))).toBe(true)
  })

  it('stays quiet outside Suggest', () => {
    const a = new LidarMoveAlerts()
    expect(a.observe(status({ mode: 'auto' }))).toBe(false)
    expect(a.observe(status({ mode: 'off' }))).toBe(false)
  })

  it('raises a warning that links to Sensors on that robot', () => {
    let listener: ((s: LidarMountStatus) => void) | null = null
    const events: TimelineEvent[] = []
    const off = watchLidarMoves((l) => { listener = l; return () => { listener = null } }, () => 'Jetson', (e) => events.push(e), () => 0)
    listener!(status())
    listener!(status())
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      severity: 'warning', acknowledged: false, message: 'The lidar seems to have moved on Jetson',
      link: { href: '#/site/site-dev/systems/sensors?robot=rover-jetson', label: 'Open Sensors' },
    })
    off()
    expect(listener).toBeNull()
  })

  it('does not ring again when the feed restarts and replays the retained status', () => {
    const alerts = new LidarMoveAlerts()
    const events: TimelineEvent[] = []
    for (let i = 0; i < 2; i++) watchLidarMoves((l) => { l(status()); return () => {} }, () => 'Jetson', (e) => events.push(e), () => i, alerts)()
    expect(events).toHaveLength(1)
  })

  it('reads the robot back from the link', () => {
    expect(robotFromSensorsHash(hashForRobotSensors('site a', 'rover/1'))).toBe('rover/1')
    expect(robotFromSensorsHash('#/site/s/systems/sensors')).toBeNull()
    expect(robotFromSensorsHash('#/site/s/systems/logs?robot=x')).toBeNull()
  })
})

it('offers sensors only from schema 0.0.23', () => {
  expect(bridgeHasSensors('0.0.23')).toBe(true)
  expect(bridgeHasSensors('0.0.22')).toBe(false)
  expect(bridgeHasSensors(null)).toBe(false)
})
