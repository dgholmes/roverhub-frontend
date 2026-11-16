// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@/i18n'
import type { MapJob, SurveyUpload as SurveyUploadRequest, SurveyUploadOptions } from '@/types/mapPipeline'

const fake = vi.hoisted(() => ({
  uploadSurvey: vi.fn(),
  getMapJob: vi.fn(),
  listMapJobs: vi.fn(async () => [] as unknown[]),
}))
vi.mock('@/lib/realtime/dataProvider', () => ({ dataProvider: fake }))

import { SurveyUpload } from './SurveyUpload'
import { mockMaps } from '@/mocks/maps'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root
const onCreated = vi.fn()
const onClose = vi.fn()
// Long enough that one tick of POLL + a margin sees exactly one poll.
const POLL = 50

const job = (over: Partial<MapJob> = {}): MapJob => ({
  job_id: 'mjob-1', kind: 'survey', map_id: 'map-office-l1-x', site_id: 'site-north-yard', status: 'queued', stage: 'queued',
  created_at: '2026-11-16T05:00:00Z', started_at: null, finished_at: null, error: null, result: null,
  detail: { name: 'Office L1' }, ...over,
})

const tick = (ms = 0) => act(async () => { await new Promise((r) => setTimeout(r, ms)) })
const text = () => container.textContent ?? ''
/** Wait up to a second for `cond`. */
async function waitFor(cond: () => boolean) {
  for (let i = 0; i < 100 && !cond(); i++) await tick(10)
}
/** Wait until the page says `words`, and fail if it never does. */
async function until(words: string) {
  await waitFor(() => text().includes(words))
  expect(text()).toContain(words)
}
const q = <T extends Element>(sel: string) => container.querySelector<T>(sel)!
const button = (label: string) => [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!

/** React listens for the native setter's value plus an input event. */
function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}
function pick(name: string, file: File) {
  const input = q<HTMLInputElement>(`input[name="${name}"]`)
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  input.dispatchEvent(new Event('change', { bubbles: true }))
}
const cloud = new File(['# .PCD v0.7 - Point Cloud Data'], 'office.pcd')
const track = new File(['t,x,y,z\n0,0,0,0\n'], 'office-track.csv', { type: 'text/csv' })

async function fillForm() {
  await act(async () => {
    typeInto(q('input[name="name"]'), 'Office L1')
    pick('cloud', cloud)
    pick('track', track)
  })
}
const submit = () => act(async () => { q<HTMLFormElement>('form').requestSubmit() })

beforeEach(() => {
  vi.clearAllMocks()
  fake.listMapJobs.mockResolvedValue([])
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(
    <SurveyUpload siteId="site-north-yard" maps={mockMaps} open onClose={onClose} onCreated={onCreated} pollMs={POLL} />,
  ))
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('SurveyUpload', () => {
  it('says what is missing before sending anything', async () => {
    await act(async () => { typeInto(q('input[name="name"]'), 'Office L1'); pick('cloud', cloud) })
    await submit()
    await until('Choose the path file.')
    expect(fake.uploadSurvey).not.toHaveBeenCalled()
  })

  it("refuses a path file without the t,x,y,z header, which the job would fail on later", async () => {
    await act(async () => {
      typeInto(q('input[name="name"]'), 'Office L1')
      pick('cloud', cloud)
      pick('track', new File(['time,x,y\n'], 'track.csv'))
    })
    await submit()
    await until('first line must be t,x,y,z')
    expect(fake.uploadSurvey).not.toHaveBeenCalled()
  })

  it('shows the upload, then the job stages, then the draft, and hands the map back', async () => {
    let finishUpload!: (job: MapJob) => void
    fake.uploadSurvey.mockImplementation((_req: SurveyUploadRequest, options: SurveyUploadOptions) => {
      options.onProgress?.(0.5)
      return new Promise<MapJob>((r) => { finishUpload = r })
    })
    fake.getMapJob
      .mockResolvedValueOnce(job({ status: 'running', stage: 'levelling' }))
      .mockResolvedValue(job({ status: 'succeeded', stage: 'done' }))
    await fillForm()
    await submit()
    await until('Uploading: 50 %')

    const [request] = fake.uploadSurvey.mock.calls[0] as [SurveyUploadRequest]
    expect(request).toMatchObject({ siteId: 'site-north-yard', name: 'Office L1', floor: 0, cloudName: 'office.pcd', trackName: 'office-track.csv' })
    expect(request.mapId).toMatch(/^map-office-l1-[a-z0-9]+$/)
    expect(q('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('50')

    await act(async () => { finishUpload(job()) })
    expect(text()).toContain('Making the map: waiting to start')
    await until('levelling the floor')
    await until('Draft map ready: Office L1')
    expect(onCreated).toHaveBeenCalledWith('map-office-l1-x')
  })

  it('replacing a map sends its id and fills in its name', async () => {
    fake.uploadSurvey.mockResolvedValue(job({ status: 'succeeded', stage: 'done', map_id: mockMaps[0].map_id }))
    await act(async () => {
      const select = q<HTMLSelectElement>('select[name="target"]')
      select.value = mockMaps[0].map_id
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(q<HTMLInputElement>('input[name="name"]').value).toBe(mockMaps[0].name)
    expect(text()).toContain('zones are kept')
    await act(async () => { pick('cloud', cloud); pick('track', track) })
    await submit()
    await waitFor(() => fake.uploadSurvey.mock.calls.length > 0)
    expect((fake.uploadSurvey.mock.calls[0][0] as SurveyUploadRequest).mapId).toBe(mockMaps[0].map_id)
  })

  it("shows a failed job's reason and lets the operator try again with the same files", async () => {
    fake.uploadSurvey.mockResolvedValue(job())
    fake.getMapJob.mockResolvedValue(job({ status: 'failed', stage: 'levelling', error: 'the cloud has too little floor to fit a plane' }))
    await fillForm()
    await submit()
    await until('could not be made into a map: the cloud has too little floor to fit a plane')
    expect(onCreated).not.toHaveBeenCalled()
    await act(async () => button('Try again').click())
    expect(text()).toContain('office.pcd')
  })

  it('a refused upload shows the server sentence on the form', async () => {
    const { ApiError } = await import('@/lib/realtime/apiError')
    fake.uploadSurvey.mockRejectedValue(new ApiError(403, { detail: 'your role cannot configure this site' }, 'POST /map-surveys answered 403'))
    await fillForm()
    await submit()
    await until('The upload failed: your role cannot configure this site')
  })

  it('Stop upload aborts the request and nothing is kept', async () => {
    fake.uploadSurvey.mockImplementation((_r: SurveyUploadRequest, options: SurveyUploadOptions) => new Promise((_, reject) => {
      options.signal?.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')))
    }))
    await fillForm()
    await submit()
    await until('Stop upload')
    await act(async () => button('Stop upload').click())
    await until('Upload stopped')
  })
})

describe('SurveyUpload, closed', () => {
  it('still shows a survey already being processed at this site', async () => {
    act(() => root.unmount())
    fake.listMapJobs.mockResolvedValue([job({ job_id: 'mjob-other', status: 'running', stage: 'building the grid', detail: { name: 'Warehouse' } })])
    fake.getMapJob.mockResolvedValue(job())
    root = createRoot(container)
    act(() => root.render(<SurveyUpload siteId="site-north-yard" maps={[]} open={false} onClose={onClose} onCreated={onCreated} pollMs={POLL} />))
    await until('The survey "Warehouse" is being made into a map: building the floor grid')
    fake.listMapJobs.mockResolvedValue([job({ job_id: 'mjob-other', status: 'succeeded', stage: 'done', map_id: 'map-warehouse' })])
    await waitFor(() => onCreated.mock.calls.length > 0)
    expect(onCreated).toHaveBeenCalledWith('map-warehouse')
    expect(text()).not.toContain('Warehouse')
  })
})
