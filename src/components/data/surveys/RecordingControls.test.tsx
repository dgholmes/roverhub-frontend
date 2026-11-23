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
