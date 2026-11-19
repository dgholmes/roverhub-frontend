import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/realtime/mqttClient', () => ({ connectBroker: vi.fn(() => ({ on: vi.fn(), end: vi.fn(), options: {} })) }))

import { mockDataProvider } from './mockDataProvider'
import { SAMPLE_SITE, SAMPLE_SURVEY } from './mockSurveyReplay'
import { RealDataProvider } from '@/lib/realtime/realDataProvider'
import { SEGMENT_S, SEGMENT_VERDICTS, type PathSample } from '@/types/surveyReplay'

// The same shapes the Python schema enforces (survey_replay.py TAKE_ID_RE, and
// runs.py RUN_ID_RE for the survey id), so the sample cannot carry an id the
// backend would refuse.
const TAKE_ID_RE = /^(original|rerun-[0-9]{8}T[0-9]{6}Z|manual-[a-z0-9-]{1,40})$/
const SURVEY_ID_RE = /^(?!\.{1,2}$)[A-Za-z0-9_.-]{1,160}$/

async function items0Id(): Promise<string> {
  return (await mockDataProvider.listSurveys({ site_id: SAMPLE_SITE })).items[0].survey_id
}

const finiteRow = (r: PathSample) => r.length === 5 && r.every((v) => Number.isFinite(v))

describe('sample survey replays on the mock provider', () => {
  it('lists the sample surveys newest first, with the runaway flagged', async () => {
    const { items, sample } = await mockDataProvider.listSurveys({ site_id: SAMPLE_SITE })
    expect(sample).toBe(true)
    expect(items[0]).toMatchObject({ take_count: 3, first_bad_s: 980, has_legs: true })
    expect(items[0].survey_id).toBe(SAMPLE_SURVEY)
    expect(items[0].duration_s).toBe(1355)
    const starts = items.map((s) => s.started_at)
    expect([...starts].sort().reverse()).toEqual(starts)
    expect(items.every((s) => s.site_id === SAMPLE_SITE)).toBe(true)
  })

  it('has a second survey without legs', async () => {
    const { items } = await mockDataProvider.listSurveys({ site_id: SAMPLE_SITE })
    const noLegs = items.find((s) => !s.has_legs)
    expect(noLegs).toBeDefined()
    expect(noLegs!.first_bad_s).toBeNull()
    const d = await mockDataProvider.getSurvey(noLegs!.survey_id)
    expect(d.takes.every((t) => !t.has_legs && t.fit === 'none' && t.first_bad_s === null)).toBe(true)
    const paths = await mockDataProvider.getTakePaths(noLegs!.survey_id, d.takes[0].take_id)
    expect(paths!.legs).toEqual([])
    expect(paths!.take.length).toBeGreaterThan(0)
    const segs = await mockDataProvider.getTakeSegments(noLegs!.survey_id, d.takes[0].take_id)
    expect(segs!.every((s) => s.verdict === 'no_data')).toBe(true)
  })

  it('filters by site and robot', async () => {
    expect((await mockDataProvider.listSurveys({ site_id: 'site-nowhere' })).items).toEqual([])
    const all = (await mockDataProvider.listSurveys({})).items
    expect(all.length).toBeGreaterThanOrEqual(2)
    const robot = all[0].robot_id
    const mine = (await mockDataProvider.listSurveys({ robot_id: robot })).items
    expect(mine.length).toBeGreaterThan(0)
    expect(mine.every((s) => s.robot_id === robot)).toBe(true)
    expect((await mockDataProvider.listSurveys({ robot_id: 'no-such-robot' })).items).toEqual([])
  })

  it('returns null for a take file that was never uploaded', async () => {
    const d = await mockDataProvider.getSurvey(await items0Id())
    const partial = d.takes.find((t) => t.label.includes('incomplete'))!
    expect(partial).toBeDefined()
    expect(await mockDataProvider.getTakeSegments(d.record.survey_id, partial.take_id)).toBeNull()
    expect(await mockDataProvider.getTakePaths(d.record.survey_id, partial.take_id)).not.toBeNull()
  })

  it('has the live original with its runaway from 980 s, and a manual stock 1× take without one', async () => {
    const d = await mockDataProvider.getSurvey(SAMPLE_SURVEY)
    expect(d.record.duration_s).toBe(1355)
    expect(d.takes).toHaveLength(3)
    expect(d.takes[0]).toMatchObject({ take_id: 'original', source: 'live', first_bad_s: 980, has_legs: true, status: 'done' })
    const e = d.takes.find((t) => t.label === 'E · stock 1×')!
    expect(e).toMatchObject({ source: 'manual', preset: 'stock', rate: 1, first_bad_s: null, has_legs: true })
    for (const t of d.takes) {
      expect(t.take_id).toMatch(TAKE_ID_RE)
      expect(t.survey_id).toBe(SAMPLE_SURVEY)
    }
    expect(d.record.survey_id).toMatch(SURVEY_ID_RE)

    const segs = (await mockDataProvider.getTakeSegments(SAMPLE_SURVEY, 'original'))!
    expect(segs.length).toBe(Math.ceil(1355 / SEGMENT_S))
    expect(segs.every((s) => SEGMENT_VERDICTS.includes(s.verdict))).toBe(true)
    const firstBad = segs.find((s) => s.verdict === 'bad')!
    expect(firstBad.start_s).toBe(980)
    expect(segs[segs.length - 1].end_s).toBe(1355)
    const eSegs = (await mockDataProvider.getTakeSegments(SAMPLE_SURVEY, e.take_id))!
    expect(eSegs.some((s) => s.verdict === 'bad')).toBe(false)
  })

  it('serves paths at about 10 Hz, finite, and the same on every call', async () => {
    const a = (await mockDataProvider.getTakePaths(SAMPLE_SURVEY, 'original'))!
    expect(a.take_id).toBe('original')
    expect(a.take.length).toBeGreaterThan(1355 * 9)
    expect(a.take.length).toBeLessThan(1355 * 11)
    expect(a.legs.length).toBeGreaterThan(1355 * 9)
    expect(a.take.every(finiteRow)).toBe(true)
    expect(a.legs.every(finiteRow)).toBe(true)
    expect(a.take[0][0]).toBe(0)
    const b = (await mockDataProvider.getTakePaths(SAMPLE_SURVEY, 'original'))!
    expect(b).toEqual(a)
    // The runaway: before 980 s the take stays near the legs, after it leaves them.
    const near = (t: number) => {
      const i = Math.round(t * 10)
      return Math.hypot(a.take[i][1] - a.legs[i][1], a.take[i][2] - a.legs[i][2])
    }
    expect(near(900)).toBeLessThan(1)
    expect(near(1350)).toBeGreaterThan(10)
  })

  it('returns null for an unknown take, and throws for an unknown survey', async () => {
    expect(await mockDataProvider.getTakePaths(SAMPLE_SURVEY, 'manual-nope')).toBeNull()
    expect(await mockDataProvider.getTakeSegments(SAMPLE_SURVEY, 'manual-nope')).toBeNull()
    await expect(mockDataProvider.getSurvey('no-such-survey')).rejects.toThrow()
  })
})

// --- The real provider: the Task 5 routes ----------------------------------

const API = 'http://api.test'
const real = () => new RealDataProvider({ wsUrl: 'ws://localhost:9001', apiBaseUrl: API })

function stubFetch(body: unknown, status = 200) {
  const fn = vi.fn().mockResolvedValue({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) })
  vi.stubGlobal('fetch', fn)
  return fn
}
const lastUrl = (fn: ReturnType<typeof vi.fn>) => fn.mock.calls[fn.mock.calls.length - 1][0] as string

describe('survey replays on the real provider', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('lists surveys for a site and robot, not marked as samples', async () => {
    const fn = stubFetch({ items: [{ survey_id: 's1' }] })
    const page = await real().listSurveys({ site_id: 'site a', robot_id: 'rover-jetson' })
    expect(page).toEqual({ items: [{ survey_id: 's1' }], sample: false })
    expect(lastUrl(fn)).toBe(`${API}/surveys?site_id=site+a&robot_id=rover-jetson`)
  })

  it('leaves out an empty filter', async () => {
    const fn = stubFetch({ items: [] })
    await real().listSurveys({ site_id: '' })
    expect(lastUrl(fn)).toBe(`${API}/surveys?`)
  })

  it('throws with the status when the list fails', async () => {
    stubFetch({}, 500)
    await expect(real().listSurveys({})).rejects.toThrow(/500/)
  })

  it('gets one survey, and throws with the status on a 404', async () => {
    const detail = { record: { survey_id: 's/1' }, takes: [] }
    const fn = stubFetch(detail)
    expect(await real().getSurvey('s/1')).toEqual(detail)
    expect(lastUrl(fn)).toBe(`${API}/surveys/s%2F1`)
    stubFetch({}, 404)
    await expect(real().getSurvey('s1')).rejects.toThrow(/404/)
  })

  it('reads a take\'s paths and segments, null when the file was never uploaded', async () => {
    const paths = { take_id: 'original', take: [[0, 0, 0, 0, 0]], legs: [] }
    let fn = stubFetch(paths)
    expect(await real().getTakePaths('s1', 'original')).toEqual(paths)
    expect(lastUrl(fn)).toBe(`${API}/surveys/s1/takes/original/files/paths.json`)
    fn = stubFetch([{ start_s: 0 }])
    expect(await real().getTakeSegments('s1', 'manual-e')).toEqual([{ start_s: 0 }])
    expect(lastUrl(fn)).toBe(`${API}/surveys/s1/takes/manual-e/files/segments.json`)
    stubFetch({}, 404)
    expect(await real().getTakePaths('s1', 'original')).toBeNull()
    expect(await real().getTakeSegments('s1', 'original')).toBeNull()
  })

  it('throws with the status on any other failure of a take file', async () => {
    stubFetch({}, 500)
    await expect(real().getTakePaths('s1', 'original')).rejects.toThrow(/500/)
    await expect(real().getTakeSegments('s1', 'original')).rejects.toThrow(/500/)
  })
})
