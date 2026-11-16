// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { mockMaps } from '@/mocks/maps'
import type { RobotState } from '@/types'
import type { MapJob } from '@/types/mapPipeline'
import type { SurveyStatus } from '@/types/survey'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const { provider, commands } = vi.hoisted(() => ({
  provider: { getFloorSurvey: vi.fn(), listMapJobs: vi.fn(), getRobots: vi.fn(), subscribeTelemetry: vi.fn(), subscribeSurveyStatus: vi.fn() },
  commands: { findMoving: vi.fn() },
}))
vi.mock('@/lib/realtime/dataProvider', () => ({ dataProvider: provider }))
vi.mock('@/sensors/sensorCommands', () => commands)

import { FindMovingPanel } from './FindMovingPanel'

const map = mockMaps[0]
const robot = (schema = '0.0.23') =>
  ({ robot_id: 'rover-jetson', name: 'Jetson', connectivity: { bridge_state: 'connected' }, bridge: { schema_version: schema } }) as unknown as RobotState
const surveyJob: MapJob = {
  job_id: 'j', kind: 'survey', map_id: map.map_id, site_id: map.site_id, status: 'succeeded', stage: 'done',
  created_at: '2026-11-16T01:00:00Z', started_at: null, finished_at: '2026-11-16T01:05:00Z', error: null, result: null,
  detail: { floor: map.floors[0].index, survey_id: 'sv-1', robot_id: 'rover-jetson' },
}

let host: HTMLDivElement
let root: Root
let statusListener: ((s: SurveyStatus) => void) | null
let onFound: ReturnType<typeof vi.fn>
const text = () => host.textContent ?? ''
const settle = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve() })
const button = () => [...host.querySelectorAll('button')].find((b) => b.textContent === 'Find moving things again')!
const render = async (props: { dirty?: boolean } = {}) => {
  act(() => root.render(<FindMovingPanel map={map} floorIndex={map.floors[0].index} dirty={props.dirty ?? false} saving={false} onFound={onFound} />))
  await settle()
}

beforeAll(async () => { await i18n.changeLanguage('en') })
beforeEach(() => {
  statusListener = null
  onFound = vi.fn()
  provider.getFloorSurvey.mockReset().mockResolvedValue({ surveyId: 'sv-1', robotId: 'rover-jetson' })
  provider.listMapJobs.mockReset().mockResolvedValue([])
  provider.getRobots.mockReset().mockReturnValue([robot()])
  provider.subscribeTelemetry.mockReset().mockReturnValue(() => {})
  provider.subscribeSurveyStatus.mockReset().mockImplementation((_id: string, l: (s: SurveyStatus) => void) => {
    statusListener = l
    return () => { statusListener = null }
  })
  commands.findMoving.mockReset()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('Find moving things again', () => {
  it('sends FIND_MOVING with the survey the floor came from and the chosen sensitivity, then reloads the list', async () => {
    let answer: (v: unknown) => void = () => {}
    commands.findMoving.mockReturnValue(new Promise((r) => { answer = r }))
    await render()
    const slider = host.querySelector<HTMLInputElement>('input[type="range"]')!
    expect(slider.value).toBe('0.5')
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(slider, '0.8')
      slider.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => button().click())
    expect(commands.findMoving).toHaveBeenCalledWith('rover-jetson', {
      survey_id: 'sv-1', map_id: map.map_id, floor_index: map.floors[0].index, sensitivity: 0.8,
    })
    expect(text()).toContain('Asking Jetson to search its recording again')
    await settle()
    act(() => statusListener!({
      robot_id: 'rover-jetson', site_id: 's', state: 'processing', survey_id: 'sv-1', elapsed_s: 0, covered_m2: 0, path_length_m: 0,
      drift: 'unknown', cameras: 'off', stage: 'finding what moved', progress: 0.5, updated_at: new Date().toISOString(),
    }))
    expect(text()).toContain('Jetson: finding what moved')
    await act(async () => { answer({ result: 'completed', command: { result: { moved_spots: 4 } } }) })
    await settle()
    expect(text()).toContain('Found 4 spots. The list is updated.')
    expect(onFound).toHaveBeenCalledTimes(1)
  })

  it('is off, with the reason, when the floor record names no survey, whatever the jobs say', async () => {
    provider.getFloorSurvey.mockResolvedValue(null)
    provider.listMapJobs.mockResolvedValue([surveyJob])
    await render()
    expect(button().disabled).toBe(true)
    expect(text()).toContain('wasn’t made by a survey from the console')
  })

  it('falls back to the newest survey job when the backend keeps no record for the floor', async () => {
    provider.getFloorSurvey.mockResolvedValue(undefined)
    provider.listMapJobs.mockResolvedValue([surveyJob])
    commands.findMoving.mockResolvedValue({ result: 'completed', command: { result: { moved_spots: 1 } } })
    await render()
    act(() => button().click())
    await settle()
    expect(commands.findMoving).toHaveBeenCalledWith('rover-jetson', expect.objectContaining({ survey_id: 'sv-1' }))
  })

  it('is off for an old bridge, and while there are unsaved changes', async () => {
    provider.getRobots.mockReturnValue([robot('0.0.22')])
    await render()
    expect(button().disabled).toBe(true)
    expect(text()).toContain('older than schema 0.0.23')
    provider.getRobots.mockReturnValue([robot()])
    act(() => root.unmount())
    root = createRoot(host)
    await render({ dirty: true })
    expect(button().disabled).toBe(true)
    expect(text()).toContain('Save or undo your changes first')
  })

  it('shows a refusal verbatim', async () => {
    commands.findMoving.mockResolvedValue({ result: 'failed', command: { failure_reason: 'The cloud rejected the command (HTTP 404): map map-venue-survey not found at this robot\'s site' } })
    await render()
    act(() => button().click())
    await settle()
    expect(text()).toContain('Jetson couldn’t search again: The cloud rejected the command (HTTP 404): map map-venue-survey not found at this robot\'s site')
    expect(onFound).not.toHaveBeenCalled()
  })
})
