// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import i18n from '@/i18n'
import { mockDataProvider } from '@/mocks/mockDataProvider'
import type { SurveyFeed } from '@/survey/surveyFeed'
import { bytesToBase64, encodeGreyPng } from '@/survey/surveyPng'
import {
  hashForMapInEditor, hashForMapsSurvey, isMissionsMapsHash, mapInEditorFromHash, mapsSurveyFromHash, parseRoute,
} from '@/app/routes'
import { SurveyLiveMap, fitView } from './SurveyLiveMap'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const feed = (mockDataProvider as unknown as { surveyFeed: SurveyFeed }).surveyFeed

let host: HTMLDivElement
let root: Root
beforeAll(async () => { await i18n.changeLanguage('en') })
beforeEach(() => {
  feed.clear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const frame = (seq: number, pixels: number[], w: number, h: number, png?: Uint8Array) => ({
  robot_id: 'rover-jetson', site_id: 'site-dev', survey_id: 's1', seq, captured_at: 'x', resolution_m: 0.1,
  origin_x_m: 0, origin_y_m: 0, width: w, height: h,
  cells_png_b64: bytesToBase64(png ?? encodeGreyPng(w, h, new Uint8Array(pixels))), pose: { x_m: 0.1, y_m: -0.1, yaw_rad: 0 }, path: [],
})
const waitFor = async (check: () => boolean) => {
  for (let i = 0; i < 50 && !check(); i++) await act(async () => { await new Promise((r) => setTimeout(r, 10)) })
}

describe('SurveyLiveMap', () => {
  it('waits for the first frame, then decodes the cells it is sent', async () => {
    act(() => root.render(<SurveyLiveMap robotId="rover-jetson" />))
    expect(host.textContent).toMatch('Waiting for the first map')
    act(() => feed.pushFrame(frame(1, [0, 128, 128, 255, 0, 128], 3, 2)))
    const map = () => host.querySelector('[data-survey-map]')!
    await waitFor(() => map().getAttribute('data-seq') === '1')
    expect(map().getAttribute('data-open-cells')).toBe('3')
    expect(map().getAttribute('data-occupied-cells')).toBe('1')
    expect(map().getAttribute('aria-label')).toBe('Live survey map: 0.0 m² covered')
    expect(host.textContent).toMatch('Walls and things')
  })

  it('keeps the last good map when a frame cannot be read, and says so', async () => {
    act(() => root.render(<SurveyLiveMap robotId="rover-jetson" />))
    act(() => feed.pushFrame(frame(1, [128, 128], 2, 1)))
    const map = () => host.querySelector('[data-survey-map]')!
    await waitFor(() => map().getAttribute('data-seq') === '1')
    act(() => feed.pushFrame(frame(2, [], 2, 1, new Uint8Array([1, 2, 3]))))
    await waitFor(() => host.textContent!.includes('could not be read'))
    expect(host.textContent).toMatch('A map frame could not be read (not a PNG)')
    expect(map().getAttribute('data-seq')).toBe('1')
  })

  it('refuses a PNG whose size disagrees with the frame', async () => {
    act(() => root.render(<SurveyLiveMap robotId="rover-jetson" />))
    act(() => feed.pushFrame(frame(1, [128, 128, 128, 128], 2, 1, encodeGreyPng(4, 1, new Uint8Array(4)))))
    await waitFor(() => host.textContent!.includes('could not be read'))
    expect(host.querySelector('[data-survey-map]')!.getAttribute('data-seq')).toBe('')
  })

  it('fits the image in the pane, centred', () => {
    expect(fitView(100, 50, 232, 232)).toEqual({ scale: 2, x: 16, y: 66 })
  })
})

describe('survey routes', () => {
  it('puts the Survey page and the editor link under Maps', () => {
    const survey = hashForMapsSurvey('site a', 'rover/1')
    expect(survey).toBe('#/site/site%20a/missions/maps/survey/rover%2F1')
    expect(mapsSurveyFromHash(survey)).toEqual({ robotId: 'rover/1' })
    expect(mapsSurveyFromHash(hashForMapsSurvey('s'))).toEqual({ robotId: null })
    expect(mapsSurveyFromHash('#/site/s/missions/maps')).toBeNull()
    expect(isMissionsMapsHash(survey)).toBe(true)
    expect(parseRoute(survey)).toEqual({ kind: 'site', siteId: 'site a', workspace: 'Missions' })
    const edit = hashForMapInEditor('s', 'map-office')
    expect(mapInEditorFromHash(edit)).toBe('map-office')
    expect(isMissionsMapsHash(edit)).toBe(true)
    expect(mapInEditorFromHash(survey)).toBeNull()
  })
})
