import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload } from 'lucide-react'
import { Button } from '@/components/kit'
import { Field, inputStyle } from '@/components/missions/parts'
import { color, font, radius, space } from '@/design-system/tokens'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { isJobActive, type MapJob } from '@/types/mapPipeline'
import type { SiteMap } from '@/types/maps'
import { errorText, megabytes, newSurveyMapId, stageKey, surveyProblem, type SurveyFileProblem } from './mapPipeline'
import { JOB_POLL_MS, useJobWatch } from './useMapPipeline'

type Phase =
  | { kind: 'form'; problem?: SurveyFileProblem; error?: string; stopped?: boolean }
  | { kind: 'uploading'; fraction: number }
  | { kind: 'processing'; job: MapJob }
  | { kind: 'done'; name: string }
  | { kind: 'failed'; error: string }

const NEW = ''

/**
 * "New map from survey" (tracker 1-5-02): the FAST-LIO2 point cloud and the
 * path walked go to POST /map-surveys, and a background job on the backend
 * levels the cloud, builds the floor grid, stores a DRAFT map and runs its
 * quality check. The page shows the bytes going, then the job's stage, until
 * the draft is in the list (`onCreated`).
 *
 * Also follows survey jobs it did not start -- one from another tab, or one
 * still running when the page was reloaded -- so a draft never appears
 * unannounced.
 */
export function SurveyUpload({ siteId, maps, open, onClose, onCreated, pollMs = JOB_POLL_MS }: {
  siteId: string
  maps: SiteMap[]
  open: boolean
  onClose: () => void
  /** A survey job finished and stored this map. */
  onCreated: (mapId: string) => void
  pollMs?: number
}) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>({ kind: 'form' })
  const [target, setTarget] = useState<string>(NEW)
  const [name, setName] = useState('')
  const [floor, setFloor] = useState(0)
  const [cloud, setCloud] = useState<File | null>(null)
  const [track, setTrack] = useState<File | null>(null)
  const abort = useRef<AbortController | null>(null)
  const created = useRef(onCreated)
  useEffect(() => { created.current = onCreated })

  // Leaving the page stops an upload in flight; a job already queued carries on.
  useEffect(() => () => abort.current?.abort(), [])

  const finishJob = useCallback((job: MapJob) => {
    if (job.status === 'succeeded') {
      setPhase({ kind: 'done', name: String(job.detail?.name ?? job.map_id) })
      created.current(job.map_id)
    } else {
      setPhase({ kind: 'failed', error: job.error || job.status })
    }
  }, [])
  const ownJob = phase.kind === 'processing' ? phase.job : null
  const watched = useJobWatch(ownJob, finishJob, pollMs)

  const submit = async () => {
    const problem = await surveyProblem({ name, cloud, track })
    if (problem) { setPhase({ kind: 'form', problem }); return }
    const controller = new AbortController()
    abort.current = controller
    setPhase({ kind: 'uploading', fraction: 0 })
    try {
      const job = await dataProvider.uploadSurvey({
        siteId, name: name.trim(), floor, mapId: target === NEW ? newSurveyMapId(name) : target,
        cloud: cloud!, cloudName: cloud!.name, track: track!, trackName: track!.name,
      }, {
        signal: controller.signal,
        onProgress: (fraction) => setPhase((p) => (p.kind === 'uploading' ? { kind: 'uploading', fraction } : p)),
      })
      setPhase({ kind: 'processing', job })
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') setPhase({ kind: 'form', stopped: true })
      else setPhase({ kind: 'form', error: errorText(e) })
    } finally {
      abort.current = null
    }
  }

  const reset = () => {
    setPhase({ kind: 'form' })
    setTarget(NEW); setName(''); setFloor(0); setCloud(null); setTrack(null)
  }
  const close = () => { reset(); onClose() }

  const note: React.CSSProperties = { margin: 0, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }
  const others = <OtherSurveyJobs siteId={siteId} exclude={ownJob?.job_id ?? null} pollMs={pollMs} onCreated={onCreated} />
  const busy = phase.kind === 'uploading' || phase.kind === 'processing'
  if (!open && !busy && phase.kind === 'form') return others

  let body: React.ReactNode
  if (phase.kind === 'uploading') {
    const total = (cloud?.size ?? 0) + (track?.size ?? 0)
    const percent = Math.round(phase.fraction * 100)
    body = (
      <>
        <Progress fraction={phase.fraction} label={t('missions.maps.survey.title')} />
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
          <p role="status" style={{ ...note, color: color.t1, flex: 1 }}>
            {t('missions.maps.survey.uploading', { percent, sent: megabytes(total * phase.fraction), total: megabytes(total) })}
          </p>
          <Button size="sm" onClick={() => abort.current?.abort()}>{t('missions.maps.survey.stop')}</Button>
        </div>
      </>
    )
  } else if (phase.kind === 'processing') {
    const job = watched.job ?? phase.job
    const key = stageKey(job.stage)
    body = (
      <>
        <Progress label={t('missions.maps.survey.title')} />
        <p role="status" style={{ ...note, color: color.t1 }}>
          {t('missions.maps.survey.processing', { stage: key ? t(`missions.maps.survey.stage.${key}` as 'missions.maps.survey.stage.done') : job.stage })}
        </p>
        <p style={note}>{t('missions.maps.survey.processingNote')}</p>
        {watched.pollError && <p role="alert" style={{ ...note, color: color.red }}>{t('missions.maps.survey.pollFailed', { error: watched.pollError })}</p>}
      </>
    )
  } else if (phase.kind === 'done') {
    body = (
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
        <p role="status" style={{ ...note, color: color.t1, flex: 1, display: 'flex', alignItems: 'center', gap: space[2] }}>
          <span style={{ width: 8, height: 8, borderRadius: radius.full, background: color.green, flexShrink: 0 }} />
          {t('missions.maps.survey.done', { name: phase.name })}
        </p>
        <Button size="sm" onClick={close}>{t('missions.maps.survey.close')}</Button>
      </div>
    )
  } else if (phase.kind === 'failed') {
    body = (
      <div style={{ display: 'grid', gap: space[2], justifyItems: 'start' }}>
        <p role="alert" style={{ ...note, color: color.red }}>{t('missions.maps.survey.failed', { error: phase.error })}</p>
        <div style={{ display: 'flex', gap: space[2] }}>
          <Button size="sm" variant="primary" onClick={() => setPhase({ kind: 'form' })}>{t('missions.maps.survey.retry')}</Button>
          <Button size="sm" onClick={close}>{t('missions.maps.survey.close')}</Button>
        </div>
      </div>
    )
  } else {
    const replacing = maps.find((m) => m.map_id === target)
    const field: React.CSSProperties = { ...inputStyle, border: 'none' }
    body = (
      <form
        onSubmit={(e) => { e.preventDefault(); void submit() }}
        style={{ display: 'grid', gap: space[4] }}
      >
        <p style={note}>{t('missions.maps.survey.intro')}</p>
        <div style={{ display: 'grid', gap: space[4], gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))' }}>
          <Field label={t('missions.maps.survey.target')} hint={replacing ? t('missions.maps.survey.replaceHint') : undefined}>
            <select
              name="target" value={target} style={field}
              onChange={(e) => {
                setTarget(e.target.value)
                const m = maps.find((x) => x.map_id === e.target.value)
                if (m) setName(m.name)
              }}
            >
              <option value={NEW}>{t('missions.maps.survey.targetNew')}</option>
              {maps.map((m) => <option key={m.map_id} value={m.map_id}>{t('missions.maps.survey.targetReplace', { name: m.name })}</option>)}
            </select>
          </Field>
          <Field label={t('missions.maps.survey.name')}>
            <input name="name" value={name} maxLength={120} placeholder={t('missions.maps.survey.namePlaceholder')}
              onChange={(e) => setName(e.target.value)} style={field} />
          </Field>
          <Field label={t('missions.maps.survey.floor')} hint={t('missions.maps.survey.floorHint')}>
            <input name="floor" type="number" min={0} max={999} step={1} value={floor}
              onChange={(e) => setFloor(Math.max(0, Math.min(999, Math.round(Number(e.target.value) || 0))))}
              style={{ ...field, width: 96 }} />
          </Field>
        </div>
        <div style={{ display: 'grid', gap: space[4], gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))' }}>
          <FilePick name="cloud" accept=".pcd" label={t('missions.maps.survey.cloud')} hint={t('missions.maps.survey.cloudHint')} file={cloud} onPick={setCloud} />
          <FilePick name="track" accept=".csv,text/csv" label={t('missions.maps.survey.track')} hint={t('missions.maps.survey.trackHint')} file={track} onPick={setTrack} />
        </div>
        {phase.problem && <p role="alert" style={{ ...note, color: color.red }}>{t(`missions.maps.survey.problem.${phase.problem}`)}</p>}
        {phase.error && <p role="alert" style={{ ...note, color: color.red }}>{t('missions.maps.survey.uploadFailed', { error: phase.error })}</p>}
        {phase.stopped && <p role="status" style={note}>{t('missions.maps.survey.stopped')}</p>}
        <div style={{ display: 'flex', gap: space[2] }}>
          <Button type="submit" variant="primary" icon={Upload}>{t('missions.maps.survey.upload')}</Button>
          <Button onClick={close}>{t('missions.maps.survey.cancel')}</Button>
        </div>
      </form>
    )
  }

  return (
    <>
      {others}
      <section aria-label={t('missions.maps.survey.title')} style={{
        display: 'grid', gap: space[3], padding: space[4], borderRadius: radius.md, background: color.hover,
      }}>
        <h3 style={{ margin: 0, fontSize: font.size.md, fontWeight: font.weight.bold, color: color.t1 }}>{t('missions.maps.survey.title')}</h3>
        {body}
      </section>
    </>
  )
}

/** A thin bar: the share sent, or (no fraction) a full bar that only says "working". */
function Progress({ fraction, label }: { fraction?: number; label: string }) {
  const pct = fraction === undefined ? 100 : Math.round(fraction * 100)
  return (
    <div
      role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={fraction === undefined ? undefined : pct}
      style={{ height: 6, borderRadius: radius.full, background: color.card, overflow: 'hidden' }}
    >
      <div style={{
        width: `${pct}%`, height: '100%', borderRadius: radius.full,
        background: fraction === undefined ? color.accentDim : color.accent, transition: 'width 200ms linear',
      }} />
    </div>
  )
}

function FilePick({ name, accept, label, hint, file, onPick }: {
  name: string
  accept: string
  label: string
  hint: string
  file: File | null
  onPick: (file: File | null) => void
}) {
  const { t } = useTranslation()
  const input = useRef<HTMLInputElement>(null)
  return (
    <div style={{ display: 'grid', gap: space[1], minWidth: 0 }}>
      <span style={{ fontSize: font.size.sm, color: color.t2 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], minWidth: 0 }}>
        <Button size="sm" onClick={() => input.current?.click()}>{t('missions.maps.survey.choose')}</Button>
        <span style={{ fontSize: font.size.sm, color: file ? color.t1 : color.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {file ? `${file.name} · ${megabytes(file.size)} MB` : t('missions.maps.survey.noFile')}
        </span>
        <input
          ref={input} name={name} type="file" accept={accept} aria-label={label} hidden
          onChange={(e) => onPick(e.target.files?.[0] ?? null)}
        />
      </div>
      <span style={{ fontSize: font.size.xs, color: color.t3, lineHeight: 1.4 }}>{hint}</span>
    </div>
  )
}

/** Survey jobs at this site that this form did not start and that are still
 *  running: each gets a line until it finishes. */
function OtherSurveyJobs({ siteId, exclude, pollMs, onCreated }: {
  siteId: string
  exclude: string | null
  pollMs: number
  onCreated: (mapId: string) => void
}) {
  const { t } = useTranslation()
  const [jobs, setJobs] = useState<MapJob[]>([])
  const created = useRef(onCreated)
  useEffect(() => { created.current = onCreated })

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let known: MapJob[] = []
    const poll = async () => {
      try {
        const all = await dataProvider.listMapJobs()
        if (cancelled) return
        const mine = all.filter((j) => j.kind === 'survey' && j.site_id === siteId)
        // A job seen running last time and finished now: its draft is in the list.
        for (const was of known) {
          const now = mine.find((j) => j.job_id === was.job_id)
          if (now && !isJobActive(now) && now.status === 'succeeded') created.current(now.map_id)
        }
        known = mine.filter(isJobActive)
        setJobs(known)
        // Asked once when the page opens, then only while something is running.
        if (known.length > 0) timer = setTimeout(() => void poll(), pollMs)
      } catch {
        /* a page that cannot list jobs simply shows none */
      }
    }
    void poll()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [siteId, pollMs])

  const shown = jobs.filter((j) => j.job_id !== exclude)
  if (shown.length === 0) return null
  return (
    <div style={{ display: 'grid', gap: space[1] }}>
      {shown.map((j) => {
        const key = stageKey(j.stage)
        return (
          <p key={j.job_id} role="status" style={{ margin: 0, fontSize: font.size.sm, color: color.t2, display: 'flex', alignItems: 'center', gap: space[2] }}>
            <span style={{ width: 8, height: 8, borderRadius: radius.full, background: color.accent, flexShrink: 0 }} />
            {t('missions.maps.survey.processingOther', {
              name: String(j.detail?.name ?? j.map_id),
              stage: key ? t(`missions.maps.survey.stage.${key}` as 'missions.maps.survey.stage.done') : j.stage,
            })}
          </p>
        )
      })}
    </div>
  )
}
