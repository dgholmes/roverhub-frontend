import { beforeAll, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import i18n from '@/i18n'
import { hashForOrgPage } from '@/app/routes'
import { TouchSiteBar } from './TouchSiteBar'

// Each of these reaches a store of its own; markers prove they are mounted.
vi.mock('./AlertCenterButton', () => ({ AlertCenterButton: () => <i data-chip="alerts" /> }))
vi.mock('./OperatorProfile', () => ({
  OperatorProfile: ({ compact }: { compact?: boolean }) => <i data-chip="profile" data-compact={String(compact)} />,
}))
vi.mock('@/store/useSessionStore', () => ({
  useSessionStore: (sel: (s: unknown) => unknown) => sel({ sites: [{ id: 'site-a', name: 'Harbour Yard' }] }),
}))

beforeAll(async () => { await i18n.changeLanguage('en') })

describe('TouchSiteBar', () => {
  it('carries what the rail used to: org, site, alerts, profile', () => {
    const html = renderToStaticMarkup(<TouchSiteBar siteId="site-a" />)
    expect(html).toContain(i18n.t('common.organization'))
    expect(html).toContain('Harbour Yard')
    expect(html).toContain('data-chip="alerts"')
    expect(html).toContain('data-chip="profile"')
    expect(html).toContain('data-compact="true"')
    expect(html).toContain(`href="${hashForOrgPage('Sites')}"`)
    expect(html).toContain(`aria-label="${i18n.t('touch.siteBar.backAria')}"`)
  })

  it('is 44px tall with a touch-sized back target', () => {
    const html = renderToStaticMarkup(<TouchSiteBar siteId="site-a" />)
    expect(html).toContain('height:44px')
    expect(html).toContain('min-height:44px')
  })

  it('says so when the site is unknown', () => {
    const html = renderToStaticMarkup(<TouchSiteBar siteId="gone" />)
    expect(html).toContain('gone')
    expect(html).toContain(i18n.t('common.unknownSite'))
  })
})
