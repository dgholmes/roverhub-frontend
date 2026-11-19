// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { hashForSiteSurvey, hashForSiteWorkspace } from '@/app/routes'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// The views are stood in: what this pins is which one a link opens, and that
// the hash is put back so Back doesn't reopen it.
vi.mock('./surveys/SurveysView', () => ({
  SurveysView: (p: { onOpen: (id: string) => void }) => <button data-view="surveys" onClick={() => p.onOpen('s2')} />,
}))
vi.mock('./surveys/SurveyReplayPage', () => ({
  SurveyReplayPage: (p: { surveyId: string; onBack: () => void }) => <div data-page="survey">{p.surveyId}<button onClick={p.onBack}>Surveys</button></div>,
}))
vi.mock('./RunsView', () => ({ RunsView: () => <i data-view="runs" /> }))
vi.mock('./RunPage', () => ({ RunPage: () => <i data-view="run" /> }))
vi.mock('@/store/useLiveOpsStore', async () => {
  const { create } = await import('zustand')
  return { useLiveOpsStore: create(() => ({ robots: [], init: () => {}, teardown: () => {} })) }
})

import { DataWorkspace } from './DataWorkspace'

const SITE = 's1'
let host: HTMLDivElement
let root: Root
beforeEach(async () => {
  await i18n.changeLanguage('en')
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('a survey link', () => {
  it('opens Data › Surveys on that survey once, then puts the hash back', async () => {
    window.history.replaceState(null, '', hashForSiteSurvey(SITE, 'survey-a'))
    await act(async () => root.render(<DataWorkspace siteId={SITE} />))
    expect(host.textContent).toContain('survey-a')
    expect(host.querySelector('[data-view]')).toBeNull()
    expect(window.location.hash).toBe(hashForSiteWorkspace(SITE, 'Data'))
    const back = [...host.querySelectorAll('button')].find((b) => b.textContent === 'Surveys' && !b.getAttribute('role'))!
    await act(async () => back.click())
    const list = host.querySelector('[data-view="surveys"]') as HTMLElement
    expect(list).not.toBeNull()
    await act(async () => list.click())
    expect(host.textContent).toContain('s2')
  })
})
