// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { dataProvider } from '@/lib/realtime/dataProvider'
import type { SurveyDetail } from '@/types/surveyReplay'
import type { SurveyStatus } from '@/types/survey'
import { SurveyFinishing } from './SurveyFinishing'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

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
  vi.restoreAllMocks()
})

const status = (over: Partial<SurveyStatus>): SurveyStatus => ({
  robot_id: 'zaezae-x1-001', site_id: 'site-north-yard', state: 'done', survey_id: 'srv-1', name: 'Yard',
  elapsed_s: 600, covered_m2: 100, path_length_m: 80, drift: 'unknown', cameras: 'off',
  updated_at: '2026-11-19T05:00:00+00:00', ...over,
})

const replayLink = () => [...host.querySelectorAll('a')].find((a) => /Watch replay/.test(a.textContent ?? ''))

const record = (): SurveyDetail => ({
  record: {
    survey_id: 'srv-1', name: 'Yard', site_id: 'site-north-yard', robot_id: 'zaezae-x1-001',
    started_at: '2026-11-19T04:50:00+00:00', stopped_at: null, duration_s: 600, floor_index: 0,
    map_id: null, cameras: 'off', recording_kept: true,
  },
  takes: [],
})

describe('Watch replay after a survey', () => {
  it('is offered for a failed survey whose record exists', async () => {   // the 11-18 case failed processing
    vi.spyOn(dataProvider, 'getSurvey').mockResolvedValue(record())
    await act(async () => root.render(<SurveyFinishing siteId="site-north-yard" status={status({ state: 'failed', error: 'build failed' })} />))
    await vi.waitFor(() => expect(replayLink()).toBeTruthy())
    expect(replayLink()!.getAttribute('href')).toMatch(/surveys\/srv-1$/)
  })

  it('is hidden when the survey has no record, so it never leads to a 404', async () => {
    const get = vi.spyOn(dataProvider, 'getSurvey').mockRejectedValue(new Error('GET /surveys/srv-1 answered 404'))
    await act(async () => root.render(<SurveyFinishing siteId="site-north-yard" status={status({ state: 'failed' })} />))
    await vi.waitFor(() => expect(get).toHaveBeenCalledWith('srv-1'))
    await act(async () => {})
    expect(replayLink()).toBeUndefined()
    act(() => root.render(<SurveyFinishing siteId="site-north-yard" status={status({ state: 'done' })} />))
    await act(async () => {})
    expect(replayLink()).toBeUndefined()
  })

  it('is offered for a done survey whose record exists', async () => {
    vi.spyOn(dataProvider, 'getSurvey').mockResolvedValue(record())
    await act(async () => root.render(<SurveyFinishing siteId="site-north-yard" status={status({ state: 'done' })} />))
    await vi.waitFor(() => expect(replayLink()).toBeTruthy())
  })
})
