// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import type { MapQualityReport, QualityCheck } from '@/types/mapPipeline'
import { MapQualitySection, orderChecks } from './MapQualitySection'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const check = (id: string, over: Partial<QualityCheck> = {}): QualityCheck => ({
  id, floor: 0, value: null, comparison: 'info', threshold: null, blocking: false, status: 'info', detail: `${id} detail`, ...over,
})
/** In the backend's order, with the failed and warning checks in the middle
 *  and at the end -- where a four-column table left them. */
const CHECKS: QualityCheck[] = [
  check('level_evidence', { value: true, comparison: 'present', blocking: true, status: 'pass' }),
  check('floor_tilt_deg', { value: 0.06, comparison: 'max', threshold: 1, blocking: true, status: 'pass' }),
  check('free_area_m2', { value: 4.5, comparison: 'min', threshold: 10, blocking: true, status: 'fail' }),
  check('track_drift_p95_m', { value: 0.038, comparison: 'max', threshold: 0.1, status: 'pass' }),
  check('surveyed_fraction', { value: 0.42, comparison: 'info', status: 'info' }),
  check('path_coverage', { status: 'skipped' }),
  check('planning_grid', { value: false, comparison: 'present', status: 'warn' }),
  check('floor_tilt_deg', { floor: 1, value: 3, comparison: 'max', threshold: 1, blocking: true, status: 'fail' }),
]
const report = (over: Partial<MapQualityReport> = {}): MapQualityReport => ({
  report_version: 1, map_id: 'map-1', version: 7, computed_at: '2026-11-25T05:00:00Z', passed: false,
  failed: ['free_area_m2'], warnings: ['planning_grid'], checks: CHECKS, current: true, ...over,
})

let host: HTMLDivElement
let root: Root
const onRecheck = vi.fn()
const render = (over: Partial<Parameters<typeof MapQualitySection>[0]> = {}) => act(() => root.render(
  <MapQualitySection report={report()} error={null} job={null} jobError={null} floorIndex={0} canRecheck onRecheck={onRecheck} {...over} />,
))
const rows = () => [...host.querySelectorAll<HTMLElement>('li[data-check]')]
const part = (row: Element, name: string) => row.querySelector(`[data-part="${name}"]`)?.textContent ?? null

beforeAll(async () => { await i18n.changeLanguage('en') })
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  onRecheck.mockReset()
})

describe('the quality report, sized for the Map page panel', () => {
  it("lists every check of this floor, each with its result -- as rows, never a table that scrolls sideways", () => {
    render()
    // The floor-1 check is not this floor's.
    expect(rows().map((r) => r.dataset.check).sort()).toEqual(CHECKS.filter((c) => c.floor === 0).map((c) => c.id).sort())
    for (const r of rows()) expect(part(r, 'result')).toMatch(/^(Pass|Fail|Warning|Info|Not checked)$/)
    expect(host.querySelector('table, [role="table"], [role="columnheader"], [role="cell"]')).toBeNull()
    expect(host.innerHTML).not.toMatch(/overflow-x|grid-template-columns/)
  })

  it('puts failed checks first, then warnings, then the rest in the order the backend gave', () => {
    render()
    expect(rows().map((r) => r.dataset.status)).toEqual(['fail', 'warn', 'pass', 'pass', 'pass', 'info', 'skipped'])
    expect(rows().map((r) => r.dataset.check)).toEqual([
      'free_area_m2', 'planning_grid', 'level_evidence', 'floor_tilt_deg', 'track_drift_p95_m', 'surveyed_fraction', 'path_coverage',
    ])
    expect(orderChecks(CHECKS).slice(0, 3).map((c) => [c.id, c.floor])).toEqual([['free_area_m2', 0], ['floor_tilt_deg', 1], ['planning_grid', 0]])
  })

  it('tints a failed or warning row and leaves the rest plain: no stripes, no borders', () => {
    render()
    const style = (id: string) => host.querySelector<HTMLElement>(`[data-check="${id}"]`)!.style
    expect(style('free_area_m2').background).toContain('--rh-red-bg')
    expect(style('planning_grid').background).toContain('--rh-amber-bg')
    expect(style('floor_tilt_deg').background).toBe('transparent')
    for (const r of rows()) {
      expect(r.style.border).toBe('')
      expect(r.style.borderLeft).toBe('')
    }
  })

  it('reads name and "Required" on the first line, "measured · limit" on the second', () => {
    render()
    const row = (id: string) => host.querySelector<HTMLElement>(`[data-check="${id}"]`)!
    expect(part(row('free_area_m2'), 'name')).toBe('Free areaRequired')
    expect(part(row('free_area_m2'), 'value')).toBe('4.5 m²')
    expect(part(row('free_area_m2'), 'limit')).toBe('≥ 10.0 m²')
    expect(row('floor_tilt_deg').textContent).toContain('0.06° · ≤ 1.00°')
    expect(row('track_drift_p95_m').textContent).toBe('Vertical driftPass3.8 cm · ≤ 10.0 cm')
    // A yes/no check has no limit; a check with no figure has no second line.
    expect(row('level_evidence').textContent).toBe('Level evidenceRequiredPassYes')
    expect(part(row('planning_grid'), 'value')).toBe('No')
    expect(part(row('planning_grid'), 'limit')).toBeNull()
    expect(row('path_coverage').textContent).toBe('Path coverageNot checked')
    // The backend's explanation is still there on hover.
    expect(row('free_area_m2').title).toBe('free_area_m2 detail')
  })

  it('keeps the header, the stale warning, the failed list and Check again', () => {
    render({ report: report({ current: false }) })
    const text = host.textContent!
    for (const s of ['Failed', 'Out of date', 'on version 7', 'The map changed after this check ran', 'Failed: Free area']) expect(text).toContain(s)
    const again = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Check again')!
    act(() => again.click())
    expect(onRecheck).toHaveBeenCalledTimes(1)
    render({ report: report({ passed: true, failed: [] }), canRecheck: false })
    expect(host.textContent).toContain('Passed')
    expect(host.textContent).toContain('Up to date')
    expect([...host.querySelectorAll('button')].some((b) => b.textContent === 'Check again')).toBe(false)
  })
})
