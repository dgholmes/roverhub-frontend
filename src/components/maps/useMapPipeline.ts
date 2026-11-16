import { useCallback, useEffect, useRef, useState } from 'react'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { isJobActive, type MapJob, type MapQualityReport, type MapVersion } from '@/types/mapPipeline'
import { errorText } from './mapPipeline'

/** How often a running map job is asked about. A survey takes about a minute
 *  on the backend; a quality check a few seconds. */
export const JOB_POLL_MS = 1500

/**
 * Follow one map job until it finishes. `onFinished` runs once with the final
 * record. A failed poll is shown and ends the watch: the job carries on on the
 * server either way, and the page says so rather than spinning forever.
 */
export function useJobWatch(job: MapJob | null, onFinished: (job: MapJob) => void, pollMs = JOB_POLL_MS) {
  const [latest, setLatest] = useState<MapJob | null>(job)
  const [pollError, setPollError] = useState<string | null>(null)
  const finished = useRef(onFinished)
  useEffect(() => { finished.current = onFinished })
  const jobId = job?.job_id ?? null

  useEffect(() => {
    setLatest(job)
    setPollError(null)
    if (!job) return
    if (!isJobActive(job)) { finished.current(job); return }
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      try {
        const next = await dataProvider.getMapJob(job.job_id)
        if (cancelled) return
        setLatest(next)
        if (isJobActive(next)) timer = setTimeout(() => void tick(), pollMs)
        else finished.current(next)
      } catch (e) {
        if (!cancelled) setPollError(errorText(e))
      }
    }
    timer = setTimeout(() => void tick(), pollMs)
    return () => { cancelled = true; clearTimeout(timer) }
    // Restart only for a different job; `job` itself is a fresh object per render upstream.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, pollMs])

  return { job: latest, pollError }
}

/**
 * A map's quality report, and any check running on it. `refreshKey` changes
 * when the map's files may have (an upload, a restore): the report is read
 * again, and a check the backend queued for it is picked up and followed.
 */
export function useMapQuality(mapId: string | null, refreshKey: string, pollMs = JOB_POLL_MS) {
  // undefined: loading; null: none has run.
  const [report, setReport] = useState<MapQualityReport | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [job, setJob] = useState<MapJob | null>(null)
  const [jobError, setJobError] = useState<string | null>(null)
  const generation = useRef(0)

  const loadReport = useCallback(async (id: string) => {
    const mine = generation.current
    try {
      const r = await dataProvider.getMapQuality(id)
      if (generation.current === mine) { setReport(r); setError(null) }
    } catch (e) {
      if (generation.current === mine) { setReport(null); setError(errorText(e)) }
    }
  }, [])

  useEffect(() => {
    generation.current += 1
    const mine = generation.current
    setReport(undefined)
    setError(null)
    setJob(null)
    setJobError(null)
    if (!mapId) return
    void loadReport(mapId)
    dataProvider.listMapJobs(mapId)
      .then((jobs) => {
        if (generation.current !== mine) return
        const running = jobs.find((j) => j.kind === 'quality' && isJobActive(j))
        if (running) setJob(running)
      })
      .catch(() => { /* the report still shows; a running check is then not followed */ })
  }, [mapId, refreshKey, loadReport])

  const onFinished = useCallback((done: MapJob) => {
    setJob(null)
    if (done.status === 'failed') setJobError(done.error ?? '')
    if (mapId) void loadReport(mapId)
  }, [mapId, loadReport])
  const watched = useJobWatch(job, onFinished, pollMs)

  const recheck = useCallback(async () => {
    if (!mapId) return
    setJobError(null)
    try {
      setJob(await dataProvider.recheckMapQuality(mapId))
    } catch (e) {
      setJobError(errorText(e))
    }
  }, [mapId])

  return { report, error, job: job ? watched.job ?? job : null, jobError: jobError ?? watched.pollError, recheck }
}

/** A map's versions, newest first. */
export function useMapVersions(mapId: string | null, refreshKey: string) {
  const [versions, setVersions] = useState<MapVersion[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setVersions(null)
    setError(null)
    if (!mapId) return
    dataProvider.listMapVersions(mapId)
      .then((v) => { if (!cancelled) setVersions(v) })
      .catch((e: unknown) => { if (!cancelled) setError(errorText(e)) })
    return () => { cancelled = true }
  }, [mapId, refreshKey])

  return { versions, error }
}
