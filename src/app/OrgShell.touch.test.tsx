import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

// Vitest runs with no DOM, where the hook answers "desktop". Mock it, or the
// touch cases below would silently assert the desktop branch.
const shell = vi.hoisted(() => ({ touch: false }))
vi.mock('@/lib/useTouchShell', () => ({
  useTouchShell: () => ({ touch: shell.touch, orientation: 'portrait', big: false }),
}))

// The Team page's tables depend on where the member list comes from.
const team = vi.hoisted(() => ({ source: { kind: 'sample', members: [] } as Record<string, unknown> }))
vi.mock('@/org/useTeam', async (orig) => ({
  ...(await orig<typeof import('@/org/useTeam')>()),
  useTeam: () => team.source,
}))

import { OrgShell } from './OrgShell'
import type { OrgPage } from './routes'
import { orgMembers } from '@/org/orgData'

function html({ touch, page }: { touch: boolean; page: OrgPage }) {
  shell.touch = touch
  return renderToStaticMarkup(<OrgShell page={page} />)
}

beforeEach(() => { shell.touch = false; team.source = { kind: 'sample', members: [] } })

describe('OrgShell on touch', () => {
  it('replaces the top-tab nav with the bar on touch', () => {
    const out = html({ touch: true, page: 'Sites' })
    expect(out).toContain('data-touch-tabbar')
    expect(out).not.toContain('data-org-nav')
    expect(out).not.toContain('data-org-topbar')
    expect(out).toContain('data-org-touch-header')
  })

  // One bar, one marker: the shell used to wrap TouchTabBar in a second
  // element carrying the same attribute, so anything counting bars (or
  // reading them as card bounds) saw two where SiteShell has one.
  it('marks the tab bar exactly once, as SiteShell does', () => {
    expect(html({ touch: true, page: 'Sites' }).match(/data-touch-tabbar/g)).toHaveLength(1)
  })

  it('keeps the top bar on a fine pointer', () => {
    const out = html({ touch: false, page: 'Sites' })
    expect(out).toContain('data-org-nav')
    expect(out).toContain('data-org-topbar')
    expect(out).not.toContain('data-touch-tabbar')
  })

  // Every <table> must sit directly inside its own overflow-x:auto wrapper, and
  // the expected number must render, or a missing table would pass vacuously.
  function expectScrollContained(out: string, tables: number) {
    expect(out.match(/<table/g)?.length ?? 0).toBe(tables)
    expect(out.match(/overflow-x:auto[^>]*><table/g)?.length ?? 0).toBe(tables)
  }

  it('wraps each Team table, with example members and with signed-in users', () => {
    team.source = { kind: 'sample', members: orgMembers }
    expectScrollContained(html({ touch: true, page: 'Team' }), 2) // members + roles
    team.source = { kind: 'live', users: [], error: null, reload: async () => {}, replace: () => {} }
    expectScrollContained(html({ touch: true, page: 'Team' }), 2)
  })

  it('wraps the Devices table', () => {
    expectScrollContained(html({ touch: true, page: 'Devices' }), 1)
  })
})
