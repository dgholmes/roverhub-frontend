// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { SAMPLE_SITE, SAMPLE_SURVEY } from '@/mocks/mockSurveyReplay'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { SurveysView } from './SurveysView'

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
})

/** Waits for an element whose own text is exactly `text`, like findByText. */
async function findByText(text: string): Promise<Element> {
  return vi.waitFor(() => {
    const hit = [...host.querySelectorAll('*')].find((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent?.trim() === text))
    if (!hit) throw new Error(`no element with the text "${text}"`)
    return hit
  })
}

/** Buttons whose accessible name matches, like getAllByRole('button', { name }). */
const buttonsNamed = (name: RegExp) => [...host.querySelectorAll('button, [role="button"]')]
  .filter((b) => name.test(b.getAttribute('aria-label') ?? b.textContent ?? '')) as HTMLElement[]

describe('Data › Surveys', () => {
  it('lists surveys with their drift verdict and opens one', async () => {
    const onOpen = vi.fn()
    await act(async () => root.render(<SurveysView siteId={SAMPLE_SITE} onOpen={onOpen} />))
    expect(await findByText('Drift from 16:20')).toBeTruthy()
    expect(await findByText('No leg odometry')).toBeTruthy()
    const rows = buttonsNamed(/open survey/i)
    expect(rows).toHaveLength(2)
    await act(async () => rows[0].click())
    // Newest first: the 11-18 ground-floor survey. (The sample ids start with
    // "sample-survey-", so the brief's /^survey-/ is matched as /survey-/.)
    expect(onOpen).toHaveBeenCalledWith(expect.stringMatching(/survey-/))
    expect(onOpen).toHaveBeenCalledWith(SAMPLE_SURVEY)
  })

  it('shows the duration, take count and a deleted recording', async () => {
    await act(async () => root.render(<SurveysView siteId={SAMPLE_SITE} onOpen={() => {}} />))
    await findByText('Drift from 16:20')
    // 1,355 s and 412 s.
    expect(host.textContent).toContain('22:35')
    expect(host.textContent).toContain('06:52')
    expect(host.textContent).toContain('4 takes')
    expect(host.textContent).toContain('1 take')
    expect(await findByText('Recording deleted')).toBeTruthy()
    // Only the gatehouse survey's bag is gone.
    expect(host.textContent!.match(/Recording deleted/g)).toHaveLength(1)
  })

  it('shows how far the legs walked, and explains the duration', async () => {
    const { items } = await dataProvider.listSurveys({ site_id: SAMPLE_SITE })
    const walked = items.find((s) => s.survey_id === SAMPLE_SURVEY)!.legs_m!
    await act(async () => root.render(<SurveysView siteId={SAMPLE_SITE} onOpen={() => {}} />))
    expect(await findByText(`${Math.round(walked).toLocaleString('en')} m`)).toBeTruthy()
    // The gatehouse survey has no legs: no distance, rather than "0 m".
    expect(host.textContent).not.toMatch(/(^|\D)0 m/)
    expect(host.querySelectorAll('[title="How long the survey recorded"]')).toHaveLength(2)
    expect(host.querySelectorAll('[title="How far the robot’s legs walked in the live take"]')).toHaveLength(1)
  })

  it('says when a site has no surveys', async () => {
    await act(async () => root.render(<SurveysView siteId="site-nowhere" onOpen={() => {}} />))
    expect(await findByText('No surveys yet')).toBeTruthy()
    expect(buttonsNamed(/open survey/i)).toHaveLength(0)
  })

  it('speaks Korean', async () => {
    await i18n.changeLanguage('ko')
    await act(async () => root.render(<SurveysView siteId={SAMPLE_SITE} onOpen={() => {}} />))
    expect(await findByText('16:20부터 드리프트')).toBeTruthy()
    expect(buttonsNamed(/측량 열기/)).toHaveLength(2)
  })
})
