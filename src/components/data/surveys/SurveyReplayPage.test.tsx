// @vitest-environment jsdom
import { act, Profiler } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { SAMPLE_SITE, SAMPLE_SURVEY } from '@/mocks/mockSurveyReplay'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { ReplayScene, type ReplayPath } from '@/survey/replay/ReplayScene'
import { formatClock } from '@/survey/replay/replayModel'
import type { ReplayTake, SurveyDetail, TakeSegment } from '@/types/surveyReplay'
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
  vi.restoreAllMocks()
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

/** The sample survey with some takes changed, served by the provider. */
async function withTakes(change: (take: ReplayTake) => ReplayTake) {
  const detail = await dataProvider.getSurvey(SAMPLE_SURVEY)
  const changed: SurveyDetail = { ...detail, takes: detail.takes.map(change) }
  vi.spyOn(dataProvider, 'getSurvey').mockImplementation(async () => structuredClone(changed))
}

/** The take row (in the takes list) whose label is `label`. */
async function takeRow(label: string): Promise<HTMLElement> {
  const name = await vi.waitFor(() => {
    const hit = [...host.querySelectorAll('section span')].find((e) => e.textContent === label)
    if (!hit) throw new Error(`no take row ${label}`)
    return hit
  })
  return name.closest('section > div') as HTMLElement
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

  // ----- final review fixes -----

  it('says Not judged, never No drift found, when no segment of a take with legs was judged', async () => {   // item 1
    // has_legs true but every segment no_data: legs that never overlapped the take.
    const real = dataProvider.getTakeSegments.bind(dataProvider)
    vi.spyOn(dataProvider, 'getTakeSegments').mockImplementation(async (survey, take) => {
      const segs = await real(survey, take)
      return take === 'original' && segs ? segs.map((s): TakeSegment => ({ ...s, verdict: 'no_data' })) : segs
    })
    await withTakes((t) => (t.take_id === 'original' ? { ...t, first_bad_s: null, has_legs: true } : t))
    await act(async () => root.render(page()))
    const row = await takeRow('Live')
    expect(row.textContent).toContain('Not judged')
    expect(row.textContent).not.toContain('No drift found')
    // The header speaks for the original take too.
    const header = host.firstElementChild!.firstElementChild!
    expect(header.textContent).toContain('Not judged')
  })

  it('shows a take’s warnings on its row', async () => {   // item 1
    await withTakes((t) => (t.take_id === 'manual-a'
      ? { ...t, warnings: ['the leg odometry does not overlap this take in time'] } : t))
    await act(async () => root.render(page()))
    const row = await takeRow('A · stock 0.8×')
    expect(row.textContent).toContain('the leg odometry does not overlap this take in time')
  })

  it('does not judge a take FAST-LIO2 fell behind on, and greys its strip row', async () => {   // item 2
    await withTakes((t) => (t.take_id === 'manual-a' ? { ...t, kept_up: false } : t))
    await act(async () => root.render(page()))
    const row = await takeRow('A · stock 0.8×')
    expect(row.textContent).toContain('Not judged')
    expect(row.textContent).not.toContain('No drift found')
    // Still on the strip, but every segment says it is not a verdict.
    const segs = allByRole('button', /^A · stock 0\.8×,/)
    expect(segs.length).toBeGreaterThan(0)
    expect(segs.every((s) => /not judged/i.test(nameOf(s)))).toBe(true)
    expect(segs[0].closest('[data-judged]')!.getAttribute('data-judged')).toBe('false')
    // The others are judged as before.
    expect(allByRole('button', /^Live,/).some((s) => /not judged/i.test(nameOf(s)))).toBe(false)
  })

  it('commits the exact time on pause, so the clock, slider and scene agree', async () => {   // item 4
    await act(async () => root.render(page()))
    await findAllByRole('button', /^Play$/)
    // 16x commits React state only every 1.6 s of survey time.
    const sixteen = [...host.querySelectorAll('[role="tab"]')].find((b) => b.textContent === '16×') as HTMLElement
    await act(async () => sixteen.click())
    const frames: FrameRequestCallback[] = []
    let clock = 1000
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => frames.push(cb))
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {})
    vi.spyOn(performance, 'now').mockImplementation(() => clock)
    const setTime = vi.mocked(ReplayScene.prototype.setTime)
    await act(async () => allByRole('button', /^Play$/)[0].click())
    for (let i = 0; i < 6; i++) {          // 6 x 1/60 s at 16x = 1.6 s, short of the first commit
      clock += 1000 / 60 - 1
      const step = frames.shift()!
      await act(async () => step(clock))
    }
    const exact = setTime.mock.calls[setTime.mock.calls.length - 1][0]
    expect(exact).toBeGreaterThan(1.2)
    const slider = allByRole('slider', /survey time/i)[0] as HTMLInputElement
    expect(Number(slider.value)).toBe(0)                  // not committed yet
    await act(async () => allByRole('button', /^Pause$/)[0].click())
    expect(Number(slider.value)).toBeCloseTo(exact, 1)
    expect(host.textContent).toContain(`${formatClock(exact)} / `)
    expect(setTime.mock.calls[setTime.mock.calls.length - 1][0]).toBe(exact)
    raf.mockRestore()
  })

  it('says the original take is incomplete rather than that there are no legs', async () => {   // item 7
    const real = dataProvider.getTakePaths.bind(dataProvider)
    vi.spyOn(dataProvider, 'getTakePaths').mockImplementation(async (survey, take) => (take === 'original' ? null : real(survey, take)))
    await act(async () => root.render(page()))
    expect(await findByText(/original take is incomplete/i)).toBeTruthy()
    expect(host.textContent).not.toMatch(/no leg odometry/i)
  })

  it('marks late segments on the strip', async () => {   // item 9
    const segs = await dataProvider.getTakeSegments(SAMPLE_SURVEY, 'original')
    const late = segs!.filter((s) => s.late)
    expect(late.length).toBeGreaterThan(0)
    await act(async () => root.render(page()))
    await findAllByRole('button', /^Live,/)
    const marks = host.querySelectorAll('[data-late-mark]')
    expect(marks.length).toBeGreaterThanOrEqual(late.length)
    const name = nameOf(allByRole('button', new RegExp(`^Live, from ${formatClock(late[0].start_s)}:`))[0])
    expect(name).toMatch(/ran late/i)
  })
})
