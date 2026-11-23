// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { initialRobots } from '@/mocks/mockRobots'
import { useLiveOpsStore, type CommandOutcome } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import type { RobotState } from '@/types'
import { RecordingControls } from './RecordingControls'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const SURVEY = 'survey-20261120-150812-c0de'
const robot = {
  ...initialRobots[0], robot_id: 'rover-jetson', name: 'rover-jetson',
  bridge: {
    ...initialRobots[0].bridge!, schema_version: '0.0.29',
    recordings: [{ survey_id: SURVEY, bytes: 3e9, has_bag: true, has_cameras: false, keep: false, processing: false }],
  },
} as RobotState

let host: HTMLDivElement
let root: Root
let dispatch: ReturnType<typeof vi.fn>
const button = (name: string) => [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === name) as HTMLButtonElement | undefined
const type = (el: HTMLInputElement, value: string) => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
})

beforeAll(async () => { await i18n.changeLanguage('en') })
beforeEach(() => {
  useSessionStore.setState({ role: 'engineer' })
  dispatch = vi.fn(async (): Promise<CommandOutcome> => ({ result: 'completed', command: { result: { bytes_freed: 1 } } as never }))
  useLiveOpsStore.setState({ dispatchCommandAsync: dispatch as never })
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('Delete recording: the typed confirmation', () => {
  it('a survey with no name asks for its id, and an empty field never enables Delete', async () => {
    act(() => root.render(
      <RecordingControls survey={{ survey_id: SURVEY, name: '', robot_id: 'rover-jetson', map_id: null, floor_index: 0 }} robot={robot} siteId="s" />,
    ))
    await act(async () => button('Delete recording')!.click())
    expect(host.textContent).toContain(`Type “${SURVEY}” to confirm`)
    const input = host.querySelector<HTMLInputElement>('input[name="confirm-name"]')!
    expect(button('Delete for good')!.disabled).toBe(true)
    await type(input, '   ')
    expect(button('Delete for good')!.disabled).toBe(true)
    // Submitting the empty form sends nothing either.
    await act(async () => { host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })) })
    expect(dispatch).not.toHaveBeenCalled()
    await type(input, SURVEY)
    expect(button('Delete for good')!.disabled).toBe(false)
  })
})

describe('the recording controls', () => {
  const survey = { survey_id: SURVEY, name: 'Office 15:08', robot_id: 'rover-jetson', map_id: 'map-office', floor_index: 1 }
  const draw = (r: RobotState = robot) => act(() => root.render(<RecordingControls survey={survey} robot={r} siteId="s" />))

  it('an offline robot: every button is off, and the row says why', async () => {
    draw({ ...robot, connectivity: { ...robot.connectivity, bridge_state: 'offline' } })
    for (const name of ['Keep', 'Process again', 'Rebuild from recording', 'Delete recording']) {
      expect(button(name)?.disabled, name).toBe(true)
    }
    expect(host.textContent).toContain('rover-jetson is offline.')
  })

  it('Keep is a toggle: aria-pressed says whether it is kept', () => {
    draw()
    expect(button('Keep')!.getAttribute('aria-pressed')).toBe('false')
    draw({ ...robot, bridge: { ...robot.bridge!, recordings: [{ ...robot.bridge!.recordings![0], keep: true }] } })
    expect(button('Stop keeping')!.getAttribute('aria-pressed')).toBe('true')
  })

  it('Delete: the typed field takes focus, Escape puts the question away, focus goes back to Delete', async () => {
    draw()
    await act(async () => { button('Delete recording')!.focus(); button('Delete recording')!.click() })
    expect(document.activeElement).toBe(host.querySelector('input[name="confirm-name"]'))
    await act(async () => { document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) })
    expect(host.querySelector('[role="alertdialog"]')).toBeNull()
    expect(document.activeElement).toBe(button('Delete recording'))
  })

  it('Process again takes focus on Cancel, and sends the floor name its map holds', async () => {
    const { dataProvider } = await import('@/lib/realtime/dataProvider')
    const getMap = vi.spyOn(dataProvider, 'getMap').mockResolvedValue({ map_id: 'map-office', floors: [{ index: 1, label: '2F' }] } as never)
    draw()
    await act(async () => button('Process again')!.click())
    const ask = host.querySelector('[role="alertdialog"]')!
    expect(ask.getAttribute('aria-describedby')).toBeTruthy()
    expect(document.activeElement?.textContent).toBe('Cancel')
    await act(async () => { [...ask.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Process again')!.click() })
    expect(dispatch).toHaveBeenCalledWith('rover-jetson', 'REPROCESS_SURVEY', expect.any(String),
      { survey_id: SURVEY, map_id: 'map-office', floor_index: 1, floor_label: '2F', rebuild: false })
    getMap.mockRestore()
  })

  it('a refusal reads as a plain sentence', async () => {
    dispatch.mockResolvedValue({ result: 'failed', command: { failure_reason: 'REJECTED_SURVEY_ACTIVE: busy' } } as never)
    draw()
    await act(async () => button('Keep')!.click())
    expect(host.querySelector('[role="alert"]')!.textContent).toBe(
      'That did not go through. A survey is being recorded or processed on this robot; wait for it to finish, or stop the survey. Try again once that is sorted out.')
  })
})
