// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { hashForData, hashForSiteRun, hashForSiteSurvey } from '@/app/routes'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The views are stood in: what this pins is which one a link or a reload
// opens, and what the address says while it is open (2026-11-26: the open run
// or survey stays in the address, in place, so a reload reopens it and Back
// still leaves Data).
vi.mock('./surveys/SurveysView', () => ({
  SurveysView: (p: { onOpen: (id: string) => void }) => <button data-view="surveys" onClick={() => p.onOpen('s2')} />,
}))
vi.mock('./surveys/SurveyReplayPage', () => ({
  SurveyReplayPage: (p: { surveyId: string; onBack: () => void }) => <div data-page="survey">{p.surveyId}<button onClick={p.onBack}>Surveys</button></div>,
}))
vi.mock('./RunsView', () => ({
  RunsView: (p: { onOpen: (id: string) => void }) => <button data-view="runs" onClick={() => p.onOpen('r2')} />,
}))
vi.mock('./RunPage', () => ({
  RunPage: (p: { runId: string; onBack: () => void }) => <div data-page="run">{p.runId}<button onClick={p.onBack}>Runs</button></div>,
}))
// Media lists snapshots; it is not what these tests are about.
vi.mock('@/lib/realtime/dataProvider', () => ({
  dataProvider: { listSnapshots: () => new Promise(() => {}) },
}))
vi.mock('@/store/useLiveOpsStore', async () => {
  const { create } = await import('zustand')
  return { useLiveOpsStore: create(() => ({ robots: [], init: () => {}, teardown: () => {} })) }
})

import { DataWorkspace } from './DataWorkspace'

const SITE = 's1'
let host: HTMLDivElement
let root: Root
const tab = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find((b) => b.textContent === label)!
const selectedTab = () => host.querySelector('[role="tablist"] [role="tab"][aria-selected="true"]')?.textContent
async function mountAt(hash: string) {
  window.history.replaceState(null, '', hash)
  await act(async () => root.render(<DataWorkspace siteId={SITE} />))
}
beforeEach(async () => {
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

describe('a survey link', () => {
  it('opens Data › Surveys on that survey, and keeps it in the address while it is open', async () => {
    await mountAt(hashForSiteSurvey(SITE, 'survey-a'))
    expect(host.textContent).toContain('survey-a')
    expect(host.querySelector('[data-view]')).toBeNull()
    expect(window.location.hash).toBe(hashForSiteSurvey(SITE, 'survey-a'))
    const before = window.history.length
    const back = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Surveys' && !b.getAttribute('role'))!
    await act(async () => back.click())
    // Closed, the address is the list's; in place, so Back still leaves Data.
    expect(window.location.hash).toBe(hashForData(SITE, 'surveys'))
    const list = host.querySelector('[data-view="surveys"]') as HTMLElement
    expect(list).not.toBeNull()
    await act(async () => list.click())
    expect(host.textContent).toContain('s2')
    expect(window.location.hash).toBe(hashForSiteSurvey(SITE, 's2'))
    expect(window.history.length).toBe(before)
  })
})

describe('a run link', () => {
  it('opens Data › Missions on that run, and keeps it in the address until it is closed', async () => {
    await mountAt(hashForSiteRun(SITE, 'run/1'))
    expect(host.querySelector('[data-page="run"]')?.textContent).toContain('run/1')
    expect(window.location.hash).toBe(hashForSiteRun(SITE, 'run/1'))
    const back = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Runs')!
    await act(async () => back.click())
    expect(window.location.hash).toBe(hashForData(SITE, 'missions'))
    await act(async () => (host.querySelector('[data-view="runs"]') as HTMLElement).click())
    expect(window.location.hash).toBe(hashForSiteRun(SITE, 'r2'))
  })
})

describe('the Data tab', () => {
  it('opens on Media at the bare workspace address', async () => {
    await mountAt(hashForData(SITE))
    expect(selectedTab()).toBe(i18n.t('data.tabs.media'))
    expect(window.location.hash).toBe(hashForData(SITE))
  })

  it('reopens the tab the address names', async () => {
    await mountAt(hashForData(SITE, 'surveys'))
    expect(selectedTab()).toBe(i18n.t('data.tabs.surveys'))
    expect(host.querySelector('[data-view="surveys"]')).not.toBeNull()
  })

  it('is written to the address in place, and closes an open run', async () => {
    await mountAt(hashForSiteRun(SITE, 'r1'))
    const before = window.history.length
    await act(async () => tab(i18n.t('data.tabs.surveys')).click())
    expect(window.location.hash).toBe(hashForData(SITE, 'surveys'))
    await act(async () => tab(i18n.t('data.tabs.media')).click())
    expect(window.location.hash).toBe(hashForData(SITE))
    await act(async () => tab(i18n.t('data.tabs.missions')).click())
    expect(host.querySelector('[data-view="runs"]')).not.toBeNull()
    expect(window.location.hash).toBe(hashForData(SITE, 'missions'))
    expect(window.history.length).toBe(before)
  })

  it('follows Back and Forward while Data stays open', async () => {
    await mountAt(hashForData(SITE))
    await act(async () => {
      window.history.replaceState(null, '', hashForSiteRun(SITE, 'r9'))
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(selectedTab()).toBe(i18n.t('data.tabs.missions'))
    expect(host.querySelector('[data-page="run"]')?.textContent).toContain('r9')
  })

  it('ignores an address that is not Data (the shell is leaving)', async () => {
    await mountAt(hashForData(SITE, 'surveys'))
    await act(async () => {
      window.history.replaceState(null, '', '#/site/s1/liveops')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(selectedTab()).toBe(i18n.t('data.tabs.surveys'))
    expect(window.location.hash).toBe('#/site/s1/liveops')
  })
})
