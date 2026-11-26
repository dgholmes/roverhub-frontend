import { beforeAll, describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Radar } from 'lucide-react'
import i18n from '@/i18n'
import { ORG_PAGES, WORKSPACES, parseRoute, type Workspace } from '@/app/routes'
import { ICONS } from './WorkspaceSidebar'
import { TouchTabBar } from './TouchTabBar'

beforeAll(async () => { await i18n.changeLanguage('en') })

const render = (active: Workspace) => renderToStaticMarkup(
  <TouchTabBar
    items={WORKSPACES} active={active}
    label={(w) => i18n.t(`nav.workspace.${w}`)} icon={(w) => ICONS[w]}
    onSelect={() => {}} ariaLabel="Workspaces"
  />,
)

describe('TouchTabBar', () => {
  it('renders one tab per workspace', () => {
    const html = render('LiveOps')
    for (const w of WORKSPACES) expect(html).toContain(i18n.t(`nav.workspace.${w}`))
    expect(html.match(/<button/g)).toHaveLength(WORKSPACES.length)
  })

  it('marks exactly the active workspace current', () => {
    const html = render('Missions')
    expect(html.match(/aria-current="page"/g)).toHaveLength(1)
    // A sub-page deep link resolves to its workspace before it reaches here.
    expect(parseRoute('#/site/s1/map/m1/edit')).toMatchObject({ kind: 'site', workspace: 'Map' })
    expect(parseRoute('#/site/s1/data/missions/run_1')).toMatchObject({ kind: 'site', workspace: 'Data' })
  })

  it('gives every tab a touch-sized target', () => {
    expect(render('Fleet')).toContain('min-height:44px')
  })

  it('clears the home indicator', () => {
    expect(render('Fleet')).toContain('env(safe-area-inset-bottom')
  })

  it('serves the org pages from the same component', () => {
    const html = renderToStaticMarkup(
      <TouchTabBar items={ORG_PAGES} active="Sites" label={(p) => i18n.t(`nav.org.${p}`)}
        icon={() => Radar} onSelect={() => {}} ariaLabel="Pages" />,
    )
    for (const p of ORG_PAGES) expect(html).toContain(i18n.t(`nav.org.${p}`))
  })
})
