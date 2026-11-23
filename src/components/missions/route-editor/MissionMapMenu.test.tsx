import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import i18n from '@/i18n'
import { mockMaps } from '@/mocks/maps'
import type { SiteMap } from '@/types/maps'
import { MissionMapMenu, mapMenu } from './MissionMapMenu'

const base: SiteMap = mockMaps[0]
const office: SiteMap = { ...base, map_id: 'map-office', name: 'Office 3F' }
const carPark: SiteMap = { ...base, map_id: 'map-car-park', name: 'Car park B1' }
const draft: SiteMap = { ...base, map_id: 'map-4f', name: 'Office 4F', status: 'draft' }

describe('mapMenu: the route editor map control', () => {
  it('offers the site\'s active maps while the route has no points', () => {
    expect(mapMenu(office, [office, carPark, draft], 0)).toEqual({
      kind: 'menu', value: office.map_id,
      options: [{ mapId: carPark.map_id, name: 'Car park B1' }, { mapId: office.map_id, name: 'Office 3F' }],
    })
  })

  it('is locked once the route has a point: the points belong to that map', () => {
    expect(mapMenu(office, [office, carPark], 1)).toEqual({ kind: 'locked', name: 'Office 3F' })
  })

  it('keeps a current map that is not active in the menu, so the select shows it', () => {
    const menu = mapMenu(draft, [office, draft], 0)
    expect(menu).toMatchObject({ kind: 'menu', value: draft.map_id })
    expect(menu?.kind === 'menu' && menu.options.map((o) => o.mapId)).toEqual([office.map_id, draft.map_id])
  })

  it('offers "no map" only to a mission that has none', () => {
    const menu = mapMenu(undefined, [office], 0)
    expect(menu).toEqual({ kind: 'menu', value: '', options: [{ mapId: '', name: null }, { mapId: office.map_id, name: 'Office 3F' }] })
  })

  it('just names the map when there is nothing else to choose', () => {
    expect(mapMenu(office, [office], 0)).toEqual({ kind: 'name', name: 'Office 3F' })
  })

  it('shows nothing for a mission with no map on a site with no maps (the "no site map" badge says it)', () => {
    expect(mapMenu(undefined, [], 0)).toBeNull()
    expect(mapMenu(undefined, null, 0)).toBeNull()
  })
})

describe('MissionMapMenu', () => {
  const render = (waypoints: number) => renderToStaticMarkup(
    <MissionMapMenu current={office} maps={[office, carPark]} waypointCount={waypoints} onChange={() => {}} />,
  )

  it('is a labelled select while the route is empty', () => {
    const html = render(0)
    expect(html).toContain('<select')
    expect(html).toContain(`aria-label="${i18n.t('missions.editor.mapMenu')}"`)
    expect(html).toContain('Car park B1')
  })

  it('is no select, and says why, once the route has a point', () => {
    const html = render(2)
    expect(html).not.toContain('<select')
    expect(html).toContain('Office 3F')
    expect(html).toContain(i18n.t('missions.editor.mapLocked'))
  })
})
