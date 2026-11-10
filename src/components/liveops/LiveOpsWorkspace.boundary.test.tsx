// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// A fault in whatever the view mode draws -- the map, a camera, telemetry --
// stands in for any pane. Every view mode throws, so the test does not depend
// on which one is the default.
const { boom } = vi.hoisted(() => ({ boom: (): never => { throw new Error('bad telemetry value') } }))
vi.mock('./hero/StackedView', () => ({ StackedView: boom }))
vi.mock('./hero/HeroView', () => ({ HeroView: boom }))
vi.mock('./hero/SplitView', () => ({ SplitView: boom }))
vi.mock('./hero/DualCamView', () => ({ DualCamView: boom }))
vi.mock('./hero/MapFirstView', () => ({ MapFirstView: boom }))
vi.mock('./hero/PatrolGridView', () => ({ PatrolGridView: boom }))
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
})

describe('LiveOps with a pane that throws', () => {
  it('keeps the command bar and its E-Stop on screen', () => {
    act(() => root.render(<LiveOpsWorkspace siteId={initialRobots[0].site_id} />))
    // Whichever face the E-Stop shows for this robot's state, it is a button in the document.
    const names: string[] = (['holdAria', 'engageAria', 'releaseAria'] as const).map((k) => i18n.t(`command.estop.${k}`))
    const estop = [...host.querySelectorAll('button')].find((b) => names.includes(b.getAttribute('aria-label') ?? ''))
    expect(estop).toBeDefined()
    // The fault is said where it happened, not by blanking the console.
    expect(host.textContent).toContain(i18n.t('common.errorBoundary.pane'))
    expect(host.textContent).toContain('bad telemetry value')
  })
})
