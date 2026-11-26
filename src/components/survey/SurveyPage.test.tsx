// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import { mockDataProvider } from '@/mocks/mockDataProvider'
import { useLiveOpsStore, type CommandOutcome } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import type { SurveyFeed } from '@/survey/surveyFeed'
import type { RobotState } from '@/types'
import type { SurveyStatus } from '@/types/survey'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { robots } = vi.hoisted(() => ({ robots: { current: [] as unknown[] } }))
vi.mock('@/org/useSiteRobots', () => ({ useSiteRobots: () => robots.current }))

import { SurveyPage, surveyPageView } from './SurveyPage'

/** The mock provider's survey feed: what survey/status would deliver. */
const feed = (mockDataProvider as unknown as { surveyFeed: SurveyFeed }).surveyFeed
const SITE = 'site-north-yard'
const jetson: RobotState = { ...initialRobots[0], robot_id: 'rover-jetson', name: 'rover-jetson', site_id: SITE, abstract_state: 'STAND', control_owner: null }
const old: RobotState = { ...initialRobots[2], robot_id: 'rover-old', name: 'rover-old', site_id: SITE }

let stamp = 0
const send = (state: SurveyStatus['state'], over: Partial<SurveyStatus> = {}) => act(() => {
  feed.pushStatus({
    robot_id: 'rover-jetson', site_id: SITE, state, survey_id: 's1', name: 'Office', elapsed_s: 372, covered_m2: 142.4,
    path_length_m: 88, lidar_hz: 10, drift: 'good', cameras: 'off', bag_mb: 890,
    updated_at: new Date(Date.UTC(2026, 10, 16, 5, 0, ++stamp)).toISOString(), ...over,
  })
})

let host: HTMLDivElement
let root: Root
let dispatch: ReturnType<typeof vi.fn>
const text = () => host.textContent ?? ''
const button = (name: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)
const click = (el: Element | undefined) => act(async () => { (el as HTMLElement).click(); await Promise.resolve() })
const render = () => act(() => root.render(<SurveyPage siteId={SITE} />))

beforeAll(async () => { await i18n.changeLanguage('en') })
beforeEach(() => {
  feed.clear()
  robots.current = [jetson, old]
  window.location.hash = `#/site/${SITE}/map/survey`
  useSessionStore.setState({ role: 'engineer' })
  dispatch = vi.fn(async (_r: string, type: string, _l: string, params?: Record<string, unknown>): Promise<CommandOutcome> => ({
    result: 'completed', command: { command_id: 'c1', robot_id: 'rover-jetson', type, label: '', params, stages: [], current_stage: 'execution_completed', initiated_by: 'x' } as never,
  }))
  useLiveOpsStore.setState({ dispatchCommandAsync: dispatch as never })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('surveyPageView', () => {
  const r = [{ robot_id: 'a' }, { robot_id: 'b' }]
  const st = (robot_id: string, state: SurveyStatus['state'], survey_id = 's') =>
    ({ robot_id, state, survey_id }) as SurveyStatus
  it('starts with the form when nothing is under way, even over a retained old result', () => {
    expect(surveyPageView(r, {}, null, null)).toEqual({ robotId: null, phase: 'start' })
    expect(surveyPageView(r, { a: st('a', 'done') }, null, null)).toEqual({ robotId: null, phase: 'start' })
  })
  it('shows a survey under way, the named robot first', () => {
    expect(surveyPageView(r, { b: st('b', 'recording') }, null, null)).toEqual({ robotId: 'b', phase: 'surveying' })
    expect(surveyPageView(r, { a: st('a', 'processing'), b: st('b', 'recording') }, null, 'b').robotId).toBe('b')
  })
  it('waits for the device after a start, then follows it to its end', () => {
    const watch = { robotId: 'a', surveyId: 'new' }
    expect(surveyPageView(r, { a: st('a', 'done', 'old') }, watch, null).phase).toBe('pending')
    expect(surveyPageView(r, { a: st('a', 'recording', 'new') }, watch, null).phase).toBe('surveying')
    expect(surveyPageView(r, { a: st('a', 'done', 'new') }, watch, null).phase).toBe('done')
  })
})

describe('SurveyPage', () => {
  it('starts a survey with the form: cameras off by default, a new map, floor 0', async () => {
    render()
    expect(host.querySelector('[data-survey-page="start"]')).not.toBeNull()
    const robotSelect = host.querySelector<HTMLSelectElement>('select[aria-label="Robot to survey with"]')!
    const oldOption = [...robotSelect.options].find((o) => o.value === 'rover-old')!
    expect(oldOption.disabled).toBe(true)
    expect(oldOption.textContent).toMatch(/bridge too old/)
    expect(host.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe('Off')
    await click(button('Start survey'))
    expect(dispatch).toHaveBeenCalledTimes(1)
    const [robotId, type, , params] = dispatch.mock.calls[0]
    expect([robotId, type]).toEqual(['rover-jetson', 'START_SURVEY'])
    expect(params).toMatchObject({ cameras: 'off', map_id: null, floor_index: 0 })
    expect(params.survey_id).toMatch(/^survey-/)
    // Until the device says so, the page waits on it.
    expect(text()).toMatch('Starting the lidar')
  })

  it('shows the backend\'s refusal as written', async () => {
    dispatch.mockResolvedValueOnce({
      result: 'failed',
      command: { failure_reason: 'The cloud rejected the command (HTTP 409): update the edge device: it runs schema 0.0.22, surveys and lidar calibration need 0.0.23' },
    })
    render()
    await click(button('Start survey'))
    expect(host.querySelector('[role="alert"]')?.textContent).toBe('update the edge device: it runs schema 0.0.22, surveys and lidar calibration need 0.0.23')
  })

  it('offers no start to a role without configure', () => {
    useSessionStore.setState({ role: 'supervisor' })
    render()
    expect(button('Start survey')).toBeUndefined()
    expect(text()).toMatch('needs the Engineer role')
  })

  it('explains the reason a robot cannot start now', () => {
    robots.current = [{ ...jetson, abstract_state: 'E_STOP' }]
    render()
    expect(button('Start survey')?.disabled).toBe(true)
    expect(host.querySelector('[data-refusal]')?.textContent).toBe('Release the E-Stop first.')
  })

  it('shows a survey under way with its numbers, and stops it with a confirm in place', async () => {
    render()
    send('recording')
    expect(host.querySelector('[data-survey-page="surveying"]')).not.toBeNull()
    expect(text()).toMatch('142 m²')
    expect(text()).toMatch('6:12')
    expect(text()).toMatch('10.0 Hz')
    await click(button('Stop & save'))
    expect(text()).toMatch('Save this survey and make a draft map from it?')
    await click(button('Save'))
    expect(dispatch).toHaveBeenLastCalledWith('rover-jetson', 'STOP_SURVEY', expect.any(String), { survey_id: 's1', save: true })
  })

  it('swaps the camera and the map: the small one becomes large', async () => {
    render()
    send('recording')
    const large = () => host.querySelector('[data-survey-large]')?.getAttribute('data-survey-large')
    const swap = () => host.querySelector<HTMLButtonElement>('[data-survey-swap]')
    expect(large()).toBe('map')
    expect(swap()?.getAttribute('aria-label')).toBe('Switch camera to large view')
    await click(swap() ?? undefined)
    expect(large()).toBe('camera')
    expect(swap()?.getAttribute('aria-label')).toBe('Switch map to large view')
    await click(swap() ?? undefined)
    expect(large()).toBe('map')
  })

  it('discards only after its own confirm', async () => {
    render()
    send('recording')
    await click(button('Discard'))
    expect(text()).toMatch('This can’t be undone')
    expect(dispatch).not.toHaveBeenCalled()
    await click(button('Discard'))
    expect(dispatch).toHaveBeenLastCalledWith('rover-jetson', 'STOP_SURVEY', expect.any(String), { survey_id: 's1', save: false })
  })

  it('lets a role without configure watch, without the stop controls', () => {
    useSessionStore.setState({ role: 'operator' })
    render()
    send('recording')
    expect(text()).toMatch('142 m²')
    expect(button('Stop & save')).toBeUndefined()
  })

  it('says the recording keeps going under an E-Stop', () => {
    robots.current = [{ ...jetson, abstract_state: 'E_STOP' }]
    render()
    send('recording')
    expect(text()).toMatch('The recording is still running')
  })

  it('follows the stages after saving, to a link into the editor', async () => {
    // Watch replay shows once the backend has the survey's record.
    const get = vi.spyOn(mockDataProvider, 'getSurvey').mockResolvedValue({ record: {} as never, takes: [] })
    render()
    send('recording')
    send('processing', { stage: 'Finding moving things', progress: 0.4 })
    expect(host.querySelector('[aria-current="step"]')?.getAttribute('data-stage')).toBe('processing')
    expect(text()).toMatch('Finding moving things')
    expect(host.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('40')
    send('done', { map_id: 'map-office', moved_spots: 12 })
    expect(text()).toMatch('Draft map ready')
    expect(text()).toMatch('12 spots where something moved')
    const link = [...host.querySelectorAll('a')].find((a) => a.textContent === 'Open in the map editor')!
    expect(link.getAttribute('href')).toBe(`#/site/${SITE}/map/map-office/edit`)
    await act(async () => {})
    expect(get).toHaveBeenCalledWith('s1')
    const replay = [...host.querySelectorAll('a')].find((a) => a.textContent === 'Watch replay')!
    expect(replay.getAttribute('href')).toBe(`#/site/${SITE}/data/surveys/s1`)
    get.mockRestore()
  })

  it('says why a save failed', () => {
    render()
    send('recording')
    send('failed', { error: 'The upload failed: the backend did not answer' })
    expect(host.querySelector('[data-survey-phase="failed"]')?.textContent).toMatch('the backend did not answer')
    expect(button('Start another survey')).toBeDefined()
  })
})
