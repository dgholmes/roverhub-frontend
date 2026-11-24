// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const shell = vi.hoisted(() => ({ touch: false }))
vi.mock('@/lib/useTouchShell', () => ({
  useTouchShell: () => ({ touch: shell.touch, orientation: 'portrait', big: false }),
}))

const RUN = (id: string, result: string, bucket: string | null) => ({
  run_id: id, mission_id: 'm', mission: { name: `Patrol ${id}` }, robot_id: 'r1', site_id: 's1',
  started_at: '2026-11-20T09:00:00Z', ended_at: '2026-11-20T09:05:00Z', result,
  bucket_copied_at: bucket, photo_count: 3, video_count: 2, detection_count: 1,
})
const RUNS = [RUN('a', 'completed', '2026-11-20T10:00:00Z'), RUN('b', 'failed', null)]
const SNAP = {
  snapshot_id: 'x1', robot_id: 'r1', site_id: 's1', camera: 'front', captured_at: '2026-11-24T01:00:00Z',
  received_at: '2026-11-24T01:00:00Z', size_bytes: 1, position: null, image_url: 'http://x/y.jpg',
}
const listRuns = vi.hoisted(() => vi.fn())
vi.mock('@/lib/realtime/dataProvider', () => ({
  dataProvider: { listRuns, listSnapshots: () => Promise.resolve({ items: [SNAP], total: 1, next_offset: null, sample: false }) },
}))
vi.mock('@/org/useSiteRobots', () => ({ useSiteRobots: () => [{ robot_id: 'r1', name: 'Rover' }] }))
vi.mock('@/store/useLiveOpsStore', async () => {
  const { create } = await import('zustand')
  return { useLiveOpsStore: create(() => ({ robots: [], init: () => {}, teardown: () => {} })) }
})

import { RunsView } from './RunsView'
import { DataWorkspace } from './DataWorkspace'

let host: HTMLDivElement
let root: Root
beforeEach(async () => {
  await i18n.changeLanguage('en')
  listRuns.mockResolvedValue({ items: RUNS, total: 2, next_offset: null, sample: true })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

async function renderRuns(touch: boolean, items = RUNS) {
  shell.touch = touch
  listRuns.mockResolvedValue({ items, total: items.length, next_offset: null, sample: true })
  await act(async () => root.render(<RunsView siteId="s1" onOpen={() => {}} />))
  return host.innerHTML
}

describe('RunsView at touch', () => {
  it('turns the run table into cards', async () => {
    const html = await renderRuns(true)
    expect(html).not.toContain('min-width: 900px')
    expect(host.querySelector('[role="table"]')).toBeNull()
    expect(html.match(/data-record-card/g)).toHaveLength(RUNS.length)
  })

  it('keeps every column: result, robot, counts and the copied state', async () => {
    await renderRuns(true)
    const text = host.textContent ?? ''
    expect(text).toContain(i18n.t('data.runs.result.completed'))
    expect(text).toContain(i18n.t('data.runs.result.failed'))
    expect(text).toContain('Patrol a')
    expect(text).toContain('Rover')
    expect(text).toContain(i18n.t('data.runs.copied'))
    expect(host.querySelectorAll('svg').length).toBeGreaterThanOrEqual(RUNS.length * 3)
  })

  it('opens the run when its card is pressed', async () => {
    const onOpen = vi.fn()
    shell.touch = true
    await act(async () => root.render(<RunsView siteId="s1" onOpen={onOpen} />))
    await act(async () => (host.querySelector('[data-record-card]') as HTMLElement).click())
    expect(onOpen).toHaveBeenCalledWith('a')
  })

  it('keeps the sample badge', async () => {
    await renderRuns(true)
    expect(host.textContent).toContain('Sample')
  })

  it('keeps the empty state', async () => {
    await renderRuns(true, [])
    expect(host.textContent).toContain(i18n.t('data.runs.emptyTitle'))
  })

  it('keeps the table on a fine pointer', async () => {
    const html = await renderRuns(false)
    expect(host.querySelector('[role="table"]')).not.toBeNull()
    expect(html).toContain('min-width: 900px')
    expect(html).not.toContain('data-record-card')
  })
})

describe('Data media grid', () => {
  async function renderMedia(touch: boolean) {
    shell.touch = touch
    window.history.replaceState(null, '', '#/site/s1/Data')
    await act(async () => root.render(<DataWorkspace siteId="s1" />))
    return host.innerHTML
  }
  it('fits three snapshots across a phone, 200 px on a fine pointer', async () => {
    expect(await renderMedia(true)).toContain('minmax(104px, 1fr)')
    act(() => root.unmount())
    root = createRoot(host)
    expect(await renderMedia(false)).toContain('minmax(200px, 1fr)')
  })
})
