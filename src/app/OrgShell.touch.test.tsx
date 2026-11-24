import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Vitest runs with no DOM, where the hook answers "desktop". Mock it, or the
// touch cases below would silently assert the desktop branch.
const shell = vi.hoisted(() => ({ touch: false }))
vi.mock('@/lib/useTouchShell', () => ({
  useTouchShell: () => ({ touch: shell.touch, orientation: 'portrait', big: false }),
}))

import { OrgShell } from './OrgShell'
import type { OrgPage } from './routes'

function html({ touch, page }: { touch: boolean; page: OrgPage }) {
  shell.touch = touch
  return renderToStaticMarkup(<OrgShell page={page} />)
}

beforeEach(() => { shell.touch = false })

describe('OrgShell on touch', () => {
  it('replaces the top-tab nav with the bar on touch', () => {
    const out = html({ touch: true, page: 'Sites' })
    expect(out).toContain('data-touch-tabbar')
    expect(out).not.toContain('data-org-nav')
    expect(out).not.toContain('data-org-topbar')
    expect(out).toContain('data-org-touch-header')
  })

  it('keeps the top bar on a fine pointer', () => {
    const out = html({ touch: false, page: 'Sites' })
    expect(out).toContain('data-org-nav')
    expect(out).toContain('data-org-topbar')
    expect(out).not.toContain('data-touch-tabbar')
  })

  it('gives the admin tables a scroll container so the page never scrolls sideways', () => {
    for (const page of ['Team', 'Devices'] as const) {
      expect(html({ touch: true, page })).toContain('overflow-x:auto')
    }
  })
})
