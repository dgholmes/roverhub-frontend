// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// One workspace and one org page that fail to render. The shell around them is real.
const { boom } = vi.hoisted(() => ({ boom: (): never => { throw new Error('workspace fault') } }))
vi.mock('@/components/fleet/FleetWorkspace', () => ({ FleetWorkspace: boom }))
vi.mock('@/components/org/pages/OrgDashboardPage', () => ({ OrgDashboardPage: boom }))

import { SiteShell } from './SiteShell'
import { OrgShell } from './OrgShell'
import { useSessionStore } from '@/store/useSessionStore'

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

const buttonNamed = (name: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(name) || b.getAttribute('aria-label') === name || b.title === name)

describe('a workspace that throws', () => {
  it('shows the fallback where the workspace was and keeps the workspace navigation', () => {
    const siteId = useSessionStore.getState().sites[0].id
    act(() => root.render(<SiteShell siteId={siteId} workspace="Fleet" />))
    expect(host.textContent).toContain(i18n.t('common.errorBoundary.view'))
    expect(host.textContent).toContain('workspace fault')
    // The rail is still there, so the operator can leave for LiveOps (and its E-Stop).
    expect(buttonNamed(i18n.t('nav.workspace.LiveOps'))).toBeDefined()
    expect(buttonNamed(i18n.t('common.backToOrg'))).toBeDefined()
  })
})

describe('an org page that throws', () => {
  it('keeps the org navigation', () => {
    act(() => root.render(<OrgShell page="Dashboard" />))
    expect(host.textContent).toContain(i18n.t('common.errorBoundary.view'))
    expect(host.textContent).toContain(i18n.t('nav.org.Sites'))
  })
})
