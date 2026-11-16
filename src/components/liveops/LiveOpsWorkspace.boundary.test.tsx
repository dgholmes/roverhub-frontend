// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Each placement in LiveOps gets a stand-in that throws when the test says so
// and draws a marker otherwise. A fault in the view stands in for the map, a
// camera, telemetry or the 3-D scene; every view mode is covered, so the test
// does not depend on which one is the default.
type Part = 'view' | 'rail' | 'log' | 'siteBar' | null
const { fault, part } = vi.hoisted(() => {
  const fault = { part: null as string | null }
  const part = (name: string) => (): React.ReactNode => {
    if (fault.part === name) throw new Error(`bad ${name} value`)
    return <span data-testid={`ok-${name}`} />
  }
  return { fault, part }
})
vi.mock('./hero/StackedView', () => ({ StackedView: part('view') }))
vi.mock('./hero/HeroView', () => ({ HeroView: part('view') }))
vi.mock('./hero/SplitView', () => ({ SplitView: part('view') }))
vi.mock('./hero/DualCamView', () => ({ DualCamView: part('view') }))
vi.mock('./hero/MapFirstView', () => ({ MapFirstView: part('view') }))
vi.mock('./hero/PatrolGridView', () => ({ PatrolGridView: part('view') }))
vi.mock('./rail/LeftRail', () => ({ LeftRail: part('rail') }))
vi.mock('./mission/EventLogPanel', () => ({ EventLogPanel: part('log') }))
vi.mock('@/components/shell/SiteContextStrip', () => ({ SiteContextStrip: part('siteBar') }))
vi.mock('@/org/useSiteRobots', async () => {
  const { initialRobots: robots } = await import('@/mocks/mockRobots')
  return { useSiteRobots: () => [robots[0]] }
})

import { LiveOpsWorkspace } from './LiveOpsWorkspace'

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
  fault.part = null
})

// Whichever face the E-Stop shows for this robot's state, it is a button in the document.
function estopButton() {
  const names: string[] = (['holdAria', 'engageAria', 'releaseAria'] as const).map((k) => i18n.t(`command.estop.${k}`))
  return [...host.querySelectorAll('button')].find((b) => names.includes(b.getAttribute('aria-label') ?? ''))
}
const shown = (name: string) => host.querySelector(`[data-testid="ok-${name}"]`) !== null

describe('LiveOps with a part that throws', () => {
  it('draws every part when nothing throws', () => {
    act(() => root.render(<LiveOpsWorkspace siteId={initialRobots[0].site_id} />))
    for (const name of ['view', 'rail', 'log', 'siteBar']) expect(shown(name)).toBe(true)
    expect(estopButton()).toBeDefined()
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })

  const cases: { part: Exclude<Part, null>; what: string; others: string[] }[] = [
    { part: 'view', what: 'the map, a camera or the 3-D scene', others: ['rail', 'log', 'siteBar'] },
    { part: 'rail', what: 'the robot list', others: ['view', 'log', 'siteBar'] },
    { part: 'log', what: 'the activity log', others: ['view', 'rail', 'siteBar'] },
    { part: 'siteBar', what: 'the site bar', others: ['view', 'rail', 'log'] },
  ]
  for (const c of cases) {
    it(`keeps the command bar, its E-Stop and the other panes when ${c.what} throws`, () => {
      fault.part = c.part
      act(() => root.render(<LiveOpsWorkspace siteId={initialRobots[0].site_id} />))
      expect(estopButton()).toBeDefined()
      // The fault is said where it happened, not by blanking the console.
      expect(host.querySelectorAll('[role="alert"]')).toHaveLength(1)
      expect(host.textContent).toContain(i18n.t('common.errorBoundary.pane'))
      expect(host.textContent).toContain(`bad ${c.part} value`)
      for (const other of c.others) expect(shown(other)).toBe(true)
    })
  }

  it('brings the pane back from "Reload this view" once the fault is gone', () => {
    fault.part = 'view'
    act(() => root.render(<LiveOpsWorkspace siteId={initialRobots[0].site_id} />))
    fault.part = null
    const retry = [...host.querySelectorAll('button')].find((b) => b.textContent === i18n.t('common.errorBoundary.retry'))!
    act(() => retry.click())
    expect(shown('view')).toBe(true)
    expect(host.querySelector('[role="alert"]')).toBeNull()
  })
})
