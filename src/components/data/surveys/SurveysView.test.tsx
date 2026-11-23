// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { SAMPLE_SITE, SAMPLE_SURVEY } from '@/mocks/mockSurveyReplay'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { initialRobots } from '@/mocks/mockRobots'
import { useLiveOpsStore, type CommandOutcome } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
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
    expect(host.textContent).toContain('6:52')
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

describe('Data › Surveys: the recording on the robot (0.0.29)', () => {
  const NAME = 'North Yard, ground floor'
  let dispatch: ReturnType<typeof vi.fn>
  const button = (scope: Element | null, name: string) =>
    [...(scope ?? host).querySelectorAll('button')].find((b) => b.textContent?.trim() === name) as HTMLButtonElement | undefined
  const row = () => host.querySelector(`[data-recording="${SAMPLE_SURVEY}"]`)
  const type = (el: HTMLInputElement, value: string) => act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  const mount = async () => {
    await act(async () => root.render(<SurveysView siteId={SAMPLE_SITE} onOpen={() => {}} />))
    await vi.waitFor(() => { if (!row()) throw new Error('no recording row') })
  }

  beforeEach(() => {
    // Atlas (0.0.29) keeps the sample survey's recording; Rex (0.0.27) cannot say.
    useSessionStore.setState({ role: 'engineer', activeSiteId: SAMPLE_SITE })
    useLiveOpsStore.setState({ robots: initialRobots.filter((r) => r.site_id === SAMPLE_SITE) })
    dispatch = vi.fn(async (_r: string, type: string, _l: string, params?: Record<string, unknown>): Promise<CommandOutcome> => ({
      result: 'completed',
      command: { command_id: 'c1', robot_id: 'zaezae-x1-001', type, label: '', params, stages: [], current_stage: 'execution_completed', initiated_by: 'x',
        result: type === 'DELETE_SURVEY_RECORDING' ? { survey_id: SAMPLE_SURVEY, bytes_freed: 4_000_000_000 } : null } as never,
    }))
    useLiveOpsStore.setState({ dispatchCommandAsync: dispatch as never })
  })

  it('shows the size on the robot and the free disk above the list', async () => {
    await mount()
    expect(row()!.textContent).toContain('3.9 GB on RVR-01 "Atlas"')
    expect(host.querySelector('[data-free-disk]')!.textContent).toContain('38.2 GB free')
  })

  it('Delete needs the survey name typed, says it cannot be undone and that the map stays', async () => {
    await mount()
    await act(async () => button(row(), 'Delete recording')!.click())
    const ask = row()!.querySelector('[role="alertdialog"]')!
    expect(ask.textContent).toContain('cannot be undone')
    expect(ask.textContent).toContain('The map in the cloud stays')
    expect(button(ask, 'Delete for good')!.disabled).toBe(true)
    await type(ask.querySelector('input')!, 'North Yard')
    expect(button(ask, 'Delete for good')!.disabled).toBe(true)
    expect(dispatch).not.toHaveBeenCalled()
    await type(ask.querySelector('input')!, NAME)
    await act(async () => button(ask, 'Delete for good')!.click())
    expect(dispatch).toHaveBeenCalledWith('zaezae-x1-001', 'DELETE_SURVEY_RECORDING', expect.any(String), { survey_id: SAMPLE_SURVEY })
    await vi.waitFor(() => expect(row()!.textContent).toContain('3.7 GB freed'))
  })

  it('Keep, then Process again and Rebuild after asking, with the survey’s own map and floor', async () => {
    await mount()
    await act(async () => button(row(), 'Keep')!.click())
    expect(dispatch).toHaveBeenLastCalledWith('zaezae-x1-001', 'SET_SURVEY_KEEP', expect.any(String), { survey_id: SAMPLE_SURVEY, keep: true })
    await act(async () => button(row(), 'Rebuild from recording')!.click())
    expect(row()!.querySelector('[role="alertdialog"]')!.textContent).toContain('up to an hour')
    await act(async () => button(row()!.querySelector('[role="alertdialog"]'), 'Rebuild from recording')!.click())
    expect(dispatch).toHaveBeenLastCalledWith('zaezae-x1-001', 'REPROCESS_SURVEY', expect.any(String),
      { survey_id: SAMPLE_SURVEY, map_id: null, floor_index: 0, rebuild: true })
  })

  it('without configure: no buttons, and the role it needs', async () => {
    useSessionStore.setState({ role: 'viewer' })
    await mount()
    expect(button(row(), 'Delete recording')).toBeUndefined()
    expect(button(row(), 'Keep')).toBeUndefined()
    expect(row()!.textContent).toContain('need the engineer role')
  })

  it('draws no hairline borders', async () => {
    await mount()
    await act(async () => button(row(), 'Delete recording')!.click())
    // The robot filter above the list is the page's own select; the survey's card draws none.
    expect(host.querySelector(`[data-survey="${SAMPLE_SURVEY}"]`)!.innerHTML).not.toMatch(/border(-left)?:\s*1(\.5)?px solid/)
  })
})
