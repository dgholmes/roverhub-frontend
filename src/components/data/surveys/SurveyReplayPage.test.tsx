// @vitest-environment jsdom
import { act, Profiler } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { SAMPLE_SITE, SAMPLE_SURVEY } from '@/mocks/mockSurveyReplay'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { ReplayScene, type ReplayPath } from '@/survey/replay/ReplayScene'
import { SurveyReplayPage } from './SurveyReplayPage'

// The scene draws with WebGL, which jsdom has not got: stood in by an automock.
vi.mock('@/survey/replay/ReplayScene')

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
beforeEach(async () => {
  await i18n.changeLanguage('en')
  vi.mocked(ReplayScene).mockClear()
  vi.mocked(ReplayScene.prototype.setPaths).mockClear()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

/** Waits for an element whose own text matches, like findByText. */
async function findByText(text: RegExp): Promise<Element> {
  return vi.waitFor(() => {
    const hit = [...host.querySelectorAll('*')].find((e) => [...e.childNodes].some((n) => n.nodeType === 3 && text.test(n.textContent ?? '')))
    if (!hit) throw new Error(`no element with the text ${text}`)
    return hit
  })
}

const nameOf = (e: Element) => e.getAttribute('aria-label') ?? e.textContent ?? ''
/** Elements with a role (explicit, or a native button) whose name matches, like getAllByRole. */
function allByRole(role: 'switch' | 'button' | 'slider', name: RegExp): HTMLElement[] {
  const selector = role === 'button' ? 'button:not([role]), [role="button"]'
    : role === 'slider' ? 'input[type="range"], [role="slider"]' : `[role="${role}"]`
  return ([...host.querySelectorAll(selector)] as HTMLElement[]).filter((e) => name.test(nameOf(e)))
}
async function findAllByRole(role: 'switch' | 'button' | 'slider', name: RegExp): Promise<HTMLElement[]> {
  return vi.waitFor(() => {
    const hits = allByRole(role, name)
    if (hits.length === 0) throw new Error(`no ${role} named ${name}`)
    return hits
  })
}

/** Takes whose paths.json and segments.json were both uploaded: the ones that can play. */
async function completeTakes(surveyId: string) {
  const { takes } = await dataProvider.getSurvey(surveyId)
  const files = await Promise.all(takes.map(async (t) => [
    await dataProvider.getTakePaths(surveyId, t.take_id), await dataProvider.getTakeSegments(surveyId, t.take_id),
  ]))
  return takes.filter((_, i) => files[i][0] !== null && files[i][1] !== null)
}

/** The paths the page last gave the scene. */
const lastPaths = (): ReplayPath[] => {
  const calls = vi.mocked(ReplayScene.prototype.setPaths).mock.calls
  return calls.length > 0 ? calls[calls.length - 1][0] : []
}

const page = (surveyId = SAMPLE_SURVEY) => <SurveyReplayPage siteId={SAMPLE_SITE} surveyId={surveyId} onBack={() => {}} />

describe('the survey replay page', () => {
  it('shows a take with missing files as incomplete', async () => {   // Review Focus 4
    const complete = await completeTakes(SAMPLE_SURVEY)
    expect(complete.length).toBeGreaterThan(1)
    await act(async () => root.render(page()))
    expect(await findByText(/Incomplete/)).toBeTruthy()
    // One show/hide switch per take that can play; the incomplete one has none.
    expect(allByRole('switch', /show/i).length).toBe(complete.length)
  })

  it('seeks when a strip segment is clicked', async () => {
    await act(async () => root.render(page()))
    const segments = await findAllByRole('button', /16:20/)
    // The original take's row comes first, and its segment from 16:20 is where it runs away.
    expect(nameOf(segments[0])).toMatch(/Live/)
    await act(async () => segments[0].dispatchEvent(new MouseEvent('click', { bubbles: true })))
    const [slider] = allByRole('slider', /survey time/i)
    expect((slider as HTMLInputElement).value).toBe('980')
    expect(host.textContent).toContain('16:20')
  })

  it('draws the legs from the original take and every take that can play, and hides one on its switch', async () => {
    const complete = await completeTakes(SAMPLE_SURVEY)
    await act(async () => root.render(page()))
    await findAllByRole('switch', /show/i)
    await vi.waitFor(() => expect(lastPaths()).toHaveLength(complete.length + 1))
    const ids = lastPaths().map((p) => p.id)
    expect(ids).toEqual(['legs', ...complete.map((t) => t.take_id)])
    const live = allByRole('switch', /show live/i)[0]
    expect(live.getAttribute('aria-checked')).toBe('true')
    await act(async () => live.click())
    expect(live.getAttribute('aria-checked')).toBe('false')
    expect(lastPaths().map((p) => p.id)).not.toContain('original')
    // A hidden take leaves the strip too.
    expect(allByRole('button', /^Live,/)).toHaveLength(0)
  })

  it('plays without re-rendering the page every frame', async () => {
    await act(async () => root.render(page()))
    const [play] = await findAllByRole('button', /^Play$/)
    // Rendered again inside a Profiler, which counts every commit of the page.
    let commits = 0
    await act(async () => root.render(<Profiler id="replay" onRender={() => { commits++ }}>{page()}</Profiler>))
    const frames: FrameRequestCallback[] = []
    let clock = 1000
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb))
    const caf = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    const now = vi.spyOn(performance, 'now').mockImplementation(() => clock)
    const setTime = vi.mocked(ReplayScene.prototype.setTime)
    try {
      const button = allByRole('button', /^Play$/)[0] ?? play
      await act(async () => button.click())
      expect(frames).toHaveLength(1)

      // A first frame stamped before playback started must not step time back.
      setTime.mockClear()
      await act(async () => frames.shift()!(clock - 5))
      expect(setTime.mock.calls[setTime.mock.calls.length - 1]?.[0]).toBe(0)

      // One second at 1x, 60 frames: the scene follows every frame, the page
      // commits about ten times.
      commits = 0
      setTime.mockClear()
      for (let i = 0; i < 60; i++) {
        clock += 1000 / 60
        const step = frames.shift()!
        await act(async () => step(clock))
      }
      const perFrame = setTime.mock.calls.length
      expect(perFrame).toBeGreaterThanOrEqual(60)
      expect(commits).toBeLessThanOrEqual(11)
      expect(commits).toBeGreaterThanOrEqual(9)
      const slider = allByRole('slider', /survey time/i)[0] as HTMLInputElement
      // 60 frames of 1/60 s, plus the 5 ms since that early first frame.
      expect(setTime.mock.calls[setTime.mock.calls.length - 1][0]).toBeCloseTo(1.005, 5)
      // The slider shows the last committed tenth.
      expect(Number(slider.value)).toBeGreaterThan(0.9)
      expect(Number(slider.value)).toBeLessThanOrEqual(1.01)
    } finally {
      raf.mockRestore(); caf.mockRestore(); now.mockRestore()
    }
  })

  it('says when a recording has no leg odometry instead of failing', async () => {   // Review Focus 1
    const { items } = await dataProvider.listSurveys({ site_id: SAMPLE_SITE })
    const noLegs = items.find((s) => !s.has_legs)!
    await act(async () => root.render(page(noLegs.survey_id)))
    expect(await findByText(/no leg odometry/i)).toBeTruthy()
    const setPaths = vi.mocked(ReplayScene.prototype.setPaths)
    await vi.waitFor(() => expect(setPaths).toHaveBeenCalled())
    expect(lastPaths().map((p) => p.id)).not.toContain('legs')
  })

  it('says when the survey cannot be loaded', async () => {
    await act(async () => root.render(page('no-such-survey')))
    expect(await findByText(/Can’t open this survey/)).toBeTruthy()
  })

  it('speaks Korean', async () => {
    await i18n.changeLanguage('ko')
    await act(async () => root.render(page()))
    expect(await findByText(/불완전/)).toBeTruthy()
    expect(allByRole('slider', /측량 시간/)).toHaveLength(1)
  })
})
