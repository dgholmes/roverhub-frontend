// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import { viewKey } from '@/lib/viewMemory'

/**
 * Media's filters -- robot, time range, grid or map -- are the viewer's own
 * conveniences, not part of a link, so they are remembered per site in view
 * memory rather than written to the address (2026-11-26).
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const listSnapshots = vi.hoisted(() => vi.fn())
vi.mock('@/lib/realtime/dataProvider', () => ({ dataProvider: { listSnapshots } }))
vi.mock('@/org/useSiteRobots', () => ({ useSiteRobots: () => initialRobots }))
vi.mock('@/store/useLiveOpsStore', async () => {
  const { create } = await import('zustand')
  return { useLiveOpsStore: create(() => ({ robots: [], init: () => {}, teardown: () => {} })) }
})
// The map view draws with Leaflet; here it only has to be on screen.
vi.mock('./SnapshotMap', () => ({ SnapshotMap: () => <div data-snapshot-map="" /> }))

import { DataWorkspace } from './DataWorkspace'

const SITE = 's1'
const ROBOT = initialRobots[2].robot_id
let host: HTMLDivElement
let root: Root

async function mount(siteId = SITE) {
  window.history.replaceState(null, '', `#/site/${siteId}/data`)
  await act(async () => root.render(<DataWorkspace siteId={siteId} />))
}
const robotSelect = () => host.querySelector<HTMLSelectElement>('#media-robot')!
const segment = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) => b.textContent === label)!
const lastQuery = () => listSnapshots.mock.calls[listSnapshots.mock.calls.length - 1][0] as { robot_id?: string; since?: string }

beforeEach(async () => {
  localStorage.clear()
  listSnapshots.mockReset()
  listSnapshots.mockResolvedValue({ items: [], total: 0, next_offset: null, sample: false })
  await i18n.changeLanguage('en')
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  window.history.replaceState(null, '', '#/')
})

describe("Media's filters across a reload", () => {
  it('start on every robot, the last 7 days, as a grid', async () => {
    await mount()
    expect(robotSelect().value).toBe('')
    expect(segment(i18n.t('data.range.7d')).getAttribute('aria-selected')).toBe('true')
    expect(segment(i18n.t('data.view.grid')).getAttribute('aria-selected')).toBe('true')
    expect(lastQuery().robot_id).toBeUndefined()
  })

  it('come back as the viewer left them', async () => {
    await mount()
    await act(async () => {
      robotSelect().value = ROBOT
      robotSelect().dispatchEvent(new Event('change', { bubbles: true }))
    })
    await act(async () => segment(i18n.t('data.range.30d')).click())
    await act(async () => segment(i18n.t('data.view.map')).click())
    act(() => root.unmount())
    root = createRoot(host)
    await mount()
    expect(robotSelect().value).toBe(ROBOT)
    expect(segment(i18n.t('data.range.30d')).getAttribute('aria-selected')).toBe('true')
    expect(segment(i18n.t('data.view.map')).getAttribute('aria-selected')).toBe('true')
    expect(lastQuery().robot_id).toBe(ROBOT)
  })

  it('are kept per site', async () => {
    localStorage.setItem(viewKey('data', SITE, 'media', 'range'), JSON.stringify('30d'))
    await mount('s2')
    expect(segment(i18n.t('data.range.7d')).getAttribute('aria-selected')).toBe('true')
  })

  it('show every robot when the remembered one is no longer on the site', async () => {
    localStorage.setItem(viewKey('data', SITE, 'media', 'robot'), JSON.stringify('robot-that-left'))
    await mount()
    expect(robotSelect().value).toBe('')
    expect(lastQuery().robot_id).toBeUndefined()
  })

  it('ignore a remembered value this build does not know', async () => {
    localStorage.setItem(viewKey('data', SITE, 'media', 'range'), JSON.stringify('fortnight'))
    localStorage.setItem(viewKey('data', SITE, 'media', 'view'), JSON.stringify('table'))
    await mount()
    expect(segment(i18n.t('data.range.7d')).getAttribute('aria-selected')).toBe('true')
    expect(segment(i18n.t('data.view.grid')).getAttribute('aria-selected')).toBe('true')
  })
})
