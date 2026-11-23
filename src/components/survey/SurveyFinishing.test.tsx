// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { initialRobots } from '@/mocks/mockRobots'
import { useLiveOpsStore, type CommandOutcome } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import type { RobotState } from '@/types'
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

describe('Process again and Skip for now (0.0.29)', () => {
  const robot = (recordings: { survey_id: string; has_bag: boolean }[], schema = '0.0.29') => ({
    ...initialRobots[0], robot_id: 'zaezae-x1-001',
    bridge: { ...initialRobots[0].bridge!, schema_version: schema, recordings: recordings.map((r) => ({ ...r, bytes: 1e9, has_cameras: false, keep: false, processing: false })) },
  }) as RobotState
  let dispatch: ReturnType<typeof vi.fn>
  const button = (name: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === name)
  beforeEach(() => {
    useSessionStore.setState({ role: 'engineer' })
    useLiveOpsStore.setState({ robots: [robot([{ survey_id: 'srv-1', has_bag: true }])] })
    dispatch = vi.fn(async (_r: string, type: string, _l: string, params?: Record<string, unknown>): Promise<CommandOutcome> => ({
      result: 'completed', command: { command_id: 'c1', robot_id: 'zaezae-x1-001', type, label: '', params, stages: [], current_stage: 'execution_completed', initiated_by: 'x' } as never,
    }))
    useLiveOpsStore.setState({ dispatchCommandAsync: dispatch as never })
    vi.spyOn(dataProvider, 'getSurvey').mockResolvedValue({ ...record(), record: { ...record().record, map_id: 'map-office', floor_index: 1 } })
  })

  it('failed survey shows Process again for configure, and sends its map and floor', async () => {
    await act(async () => root.render(<SurveyFinishing siteId="site-north-yard" status={status({ state: 'failed', error: 'build failed' })} />))
    await vi.waitFor(() => expect(button('Process again')?.disabled).toBe(false))
    await act(async () => { button('Process again')!.click() })
    expect(dispatch).toHaveBeenCalledWith('zaezae-x1-001', 'REPROCESS_SURVEY', expect.any(String),
      { survey_id: 'srv-1', map_id: 'map-office', floor_index: 1, rebuild: false })
  })

  it('without configure: no Process again, and the role it needs', async () => {
    useSessionStore.setState({ role: 'viewer' })
    await act(async () => root.render(<SurveyFinishing siteId="site-north-yard" status={status({ state: 'failed' })} />))
    expect(button('Process again')).toBeUndefined()
    expect(host.textContent).toContain('needs the engineer role')
  })

  it('says so when the recording is gone, and offers nothing on an older bridge', async () => {
    useLiveOpsStore.setState({ robots: [robot([{ survey_id: 'srv-1', has_bag: false }])] })
    await act(async () => root.render(<SurveyFinishing siteId="site-north-yard" status={status({ state: 'failed' })} />))
    expect(button('Process again')).toBeUndefined()
    expect(host.textContent).toContain('no longer on the robot')
    useLiveOpsStore.setState({ robots: [robot([{ survey_id: 'srv-1', has_bag: true }], '0.0.28')] })
    await act(async () => {})
    expect(button('Process again')).toBeUndefined()
  })

  it('Skip for now is shown only while finding things that moved, and sends SKIP_MOVING_SEARCH', async () => {
    const at = (stage: string) => act(async () => root.render(
      <SurveyFinishing siteId="site-north-yard" status={status({ state: 'processing', stage, progress: 0.2 })} />,
    ))
    await at('reading the map')
    expect(button('Skip for now')).toBeUndefined()
    await at('finding things that moved')
    await act(async () => { button('Skip for now')!.click() })
    expect(dispatch).toHaveBeenCalledWith('zaezae-x1-001', 'SKIP_MOVING_SEARCH', expect.any(String), { survey_id: 'srv-1' })
    await at('uploading the map')
    expect(button('Skip for now')).toBeUndefined()
  })

  it('Skip for now is for engineers only', async () => {
    useSessionStore.setState({ role: 'viewer' })
    await act(async () => root.render(
      <SurveyFinishing siteId="site-north-yard" status={status({ state: 'processing', stage: 'finding things that moved' })} />,
    ))
    expect(button('Skip for now')).toBeUndefined()
  })
})
