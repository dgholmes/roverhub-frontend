import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Download, Maximize2, Minimize2 } from 'lucide-react'
import { formatLocale } from '@/i18n'
import { color, font, radius, shadow, space } from '@/design-system/tokens'
import { Badge, Button, IconButton, type Tone } from '@/components/kit'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { useMissionMap } from '@/missions/useMissionMap'
import { useTouchShell } from '@/lib/useTouchShell'
import { formatDuration } from '@/components/missions/parts'
import { describeRunEvent, runEndReason, eventOffsetMs, eventsAtOrBefore, formatClock, formatSize, laneEvents, otherRecordings, runDurationMs, type LaneEvent } from '@/data/runTimeline'
import { controllerSegments, speedSeries, trackDurationS, trackModel, videoTimeAt } from '@/data/runTrack'
import { createRunCursor, useCursor, type RunCursor } from '@/data/runCursor'
import { RunFigure, type FigureLayers } from './run/RunFigure'
import { RunTimelineLanes, type PlaybackRate } from './run/RunTimelineLanes'
import { RunLegsTable } from './run/RunLegsTable'
import type { MissionRun, MissionWaypoint, RunDetail, RunEvent, RunFile, RunResult, RunTrack, SiteMap } from '@/types'

const RESULT_TONE: Record<RunResult, Tone> = { running: 'accent', completed: 'green', aborted: 'amber', failed: 'red' }
const isStill = (path: string) => path.startsWith('photos/') || path.startsWith('detections/')
const NO_TRACK = { columns: {} } as const

/** The run video: the run log's (with its start offset), else a `video/run_*`
 * file from before run logs, taken to start with the run. Front first. */
export function runVideoOf(track: RunTrack | null | undefined, files: RunFile[]): { path: string; offset: number; camera: string } | null {
  const entries = Object.entries(track?.video ?? {})
  const pick = entries.find(([c]) => c === 'front') ?? entries[0]
  if (pick) return { camera: pick[0], path: pick[1].path, offset: pick[1].offset_s }
  const file = files.find((f) => f.path.startsWith('video/run_'))
  if (!file) return null
  return { camera: /video\/run_(.+)\.\w+$/.exec(file.path)?.[1] ?? 'front', path: file.path, offset: 0 }
}

/** The floor a run walked: the run log's, else the one at the waypoints' height, else the first. */
function floorOf(map: SiteMap | null, track: RunTrack | null | undefined, waypoints: MissionWaypoint[]): number {
  if (track?.map) return track.map.floor_index
  if (!map?.floors.length) return 0
  const z = waypoints.find((w) => w.z_m !== null)?.z_m
  if (z === undefined || z === null) return map.floors[0].index
  return map.floors.reduce((best, f) => (Math.abs(f.floor_z_m - z) < Math.abs(best.floor_z_m - z) ? f : best)).index
}

/** "The video starts n s into the run", while the cursor is before its first frame. */
function VideoNotYet({ cursor, offset }: { cursor: RunCursor; offset: number }) {
  const { t } = useTranslation()
  const before = useCursor(cursor, (v) => v < offset)
  if (!before) return null
  return (
    <span style={{ position: 'absolute', left: space[2], bottom: space[2], fontSize: font.size.xs, color: '#e8e8ea', background: 'rgba(0,0,0,0.5)', borderRadius: radius.xs, padding: `2px ${space[2]}px` }}>
      {t('data.run.videoNotYet', { s: offset.toFixed(1) })}
    </span>
  )
}

/** The run's events; the one at or before the cursor is selected, or the one
 * clicked until the cursor moves on to another. */
const RunEventsList = memo(function RunEventsList({ run, runId, events, cursor, onSeek }: {
  run: MissionRun
  runId: string
  events: RunEvent[]
  cursor: RunCursor
  onSeek: (e: RunEvent) => void
}) {
  const { t } = useTranslation()
  const following = useCursor(cursor, (v) => eventsAtOrBefore(events, v * 1000, run)?.seq ?? null)
  const [clicked, setClicked] = useState<{ seq: number; following: number | null } | null>(null)
  const selected = clicked && clicked.following === following ? clicked.seq : following
  const time = (iso: string) => formatClock(iso, formatLocale())
  return (
    <div style={{ maxHeight: 360, overflowY: 'auto', display: 'grid', gap: 2, alignContent: 'start' }}>
      {events.map((e) => {
        const view = describeRunEvent(e, { t, waypointLabel: (id) => run.mission.waypoints.find((w) => w.waypoint_id === id)?.label, snapshotUrl: (id) => dataProvider.snapshotUrl(id) })
        const thumb = view.thumbUrl ?? (e.media && isStill(e.media) ? dataProvider.runFileUrl(runId, e.media) : null)
        return (
          <button key={e.seq} type="button"
            onClick={() => { setClicked({ seq: e.seq, following: eventsAtOrBefore(events, eventOffsetMs(run, e), run)?.seq ?? null }); onSeek(e) }}
            style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr auto', gap: space[2], alignItems: 'center', padding: `${space[1]}px ${space[2]}px`, border: 'none', borderRadius: radius.sm,
              background: e.seq === selected ? color.selected : 'transparent', textAlign: 'left', cursor: 'pointer', fontFamily: font.family, color: color.t1, fontSize: font.size.sm }}>
            <span style={{ color: color.t3, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{time(e.at)}</span>
            <span>
              {view.title}
              {view.detail && <span style={{ color: color.t2 }}> · {view.detail}</span>}
              {e.actor && <span style={{ color: color.t3 }}> · {e.actor}</span>}
            </span>
            {thumb ? <img src={thumb} alt="" style={{ width: 48, height: 36, objectFit: 'cover', borderRadius: 4 }} /> : <span />}
          </button>
        )
      })}
    </div>
  )
})

const chip = { fontSize: font.size.xs, fontWeight: font.weight.semibold, color: color.t2, background: color.overlay, borderRadius: radius.xs, padding: `2px ${space[2]}px`, backdropFilter: 'blur(8px)' } as const

/**
 * Data › Missions › one run, layout A "map first" (spec 2026-11-27-mission-run-log
 * §5): the figure full width with the camera in its corner, the timeline lanes
 * under it, then the legs, the events and the recordings. Everything follows
 * one cursor (seconds into the run) held outside React state, so a scrub or
 * the playing video redraws only the cursor's own layers.
 */
export function RunPage({ siteId, runId, onBack }: { siteId: string; runId: string; onBack: () => void }) {
  const { t } = useTranslation()
  const { narrow } = useTouchShell()
  const [detail, setDetail] = useState<RunDetail | null>(null)
  const [events, setEvents] = useState<RunEvent[]>([])
  const [track, setTrack] = useState<RunTrack | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [openStill, setOpenStill] = useState<string | null>(null)
  /** A video picked from the recordings list; null plays the run video. */
  const [picked, setPicked] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const [rate, setRate] = useState<PlaybackRate>('1')
  const [layers, setLayers] = useState<FigureLayers>({ route: true, plans: true, walked: true })
  /** Camera large, map in the corner. */
  const [swapped, setSwapped] = useState(false)
  const cursor = useMemo(() => createRunCursor(0), [])
  const video = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    let cancelled = false
    setDetail(null); setEvents([]); setTrack(undefined); setError(null); setPicked(null); setPlaying(false)
    cursor.set(0, 'user')
    Promise.all([dataProvider.getRun(runId), dataProvider.getRunEvents(runId)])
      .then(([d, e]) => { if (!cancelled) { setDetail(d); setEvents(e) } })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)) })
    // The run log is extra: a backend without it (or a failed read) leaves the page as it was.
    dataProvider.runTrack(runId)
      .then((tr) => { if (!cancelled) setTrack(tr) })
      .catch((err: unknown) => { console.warn('run log could not be read', err); if (!cancelled) setTrack(null) })
    return () => { cancelled = true }
  }, [runId, cursor])

  const run = detail?.run
  const waypoints = useMemo(() => run?.mission.waypoints ?? [], [run])
  const { resolved } = useMissionMap(siteId, track?.map?.map_id ?? run?.mission.map_id ?? '')
  const map = resolved.status === 'map' ? resolved.map : null
  const floorIndex = floorOf(map, track, waypoints)
  const model = useMemo(() => trackModel(track ?? NO_TRACK), [track])
  const duration = run ? (track ? trackDurationS(track, model) : runDurationMs(run) / 1000) : 0
  const lane = useMemo(() => (run ? laneEvents(run, events, track?.markers ?? [], t) : []), [run, events, track, t])
  const controllers = useMemo(() => controllerSegments(model), [model])
  const speed = useMemo(() => speedSeries(model), [model])
  const plans = useMemo(() => track?.plans ?? [], [track])

  const runVideo = runVideoOf(track, detail?.files ?? [])
  const playingPath = picked ?? runVideo?.path ?? null
  // The cursor follows the run video only; a task clip has its own clock.
  const onRunVideo = playingPath !== null && playingPath === runVideo?.path
  const videoUrl = playingPath ? dataProvider.runFileUrl(runId, playingPath) : ''
  const offset = onRunVideo ? runVideo!.offset : 0
  /** The video keeps time while it plays; without a playable run video the page does. */
  const videoClock = onRunVideo && videoUrl !== ''

  // Every move of the cursor but the video's own seeks the video.
  useEffect(() => {
    if (!onRunVideo) return
    return cursor.subscribe((from) => {
      const el = video.current
      if (from === 'video' || !el) return
      const vt = videoTimeAt(cursor.get(), offset) ?? 0
      if (Math.abs(el.currentTime - vt) > 0.3) el.currentTime = vt
    })
  }, [cursor, onRunVideo, offset])

  useEffect(() => { if (video.current) video.current.playbackRate = Number(rate) }, [rate, videoUrl])

  // Playing without a video: the page advances the cursor itself.
  useEffect(() => {
    if (!playing || videoClock) return
    let last = performance.now()
    let id = requestAnimationFrame(function step(now) {
      const next = Math.min(duration, cursor.get() + ((now - last) / 1000) * Number(rate))
      last = now
      cursor.set(next, 'play')
      if (next >= duration) { setPlaying(false); return }
      id = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(id)
  }, [playing, videoClock, duration, rate, cursor])

  const onPlay = useCallback((play: boolean) => {
    const el = video.current
    if (videoClock && el) {
      if (play) void el.play().catch(() => setPlaying(false))
      else el.pause()
    } else {
      if (play && cursor.get() >= duration) cursor.set(0, 'user')
      setPlaying(play)
    }
  }, [videoClock, cursor, duration])

  const seekEvent = useCallback((e: RunEvent) => {
    if (!run) return
    cursor.set(Math.max(0, eventOffsetMs(run, e) / 1000), 'user')
    setPicked(null)
  }, [run, cursor])
  const onLaneEvent = useCallback((e: LaneEvent) => { cursor.set(Math.max(0, e.t), 'user'); setPicked(null) }, [cursor])
  const seekTo = useCallback((s: number) => { cursor.set(s, 'user'); setPicked(null) }, [cursor])

  if (error) return <div style={{ color: color.red }}>{error}</div>
  if (!run || !detail) return <div style={{ color: color.t3 }}>{t('data.runs.loading')}</div>

  const recordings = otherRecordings(detail.files, playingPath)
  const zipUrl = dataProvider.runZipUrl(runId)
  const svgUrl = dataProvider.runFigureUrl(runId, 'svg')
  const pngUrl = dataProvider.runFigureUrl(runId, 'png')
  const stills = detail.files.filter((f) => isStill(f.path))
  const startText = (() => {
    const d = new Date(run.started_at)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
  })()
  const hasSamples = model.t.length > 0
  const note = track?.source === 'history' ? t('data.run.coarse')
    : track !== undefined && !hasSamples ? t('data.run.noTrack') : null
  const mapNote = resolved.status === 'missing' || resolved.status === 'unavailable' ? t('data.run.noMap') : null
  const showVideo = playingPath !== null
  const pip = !narrow

  const fill = { position: 'absolute', inset: 0 } as const
  const corner = { position: 'absolute', right: space[3], bottom: space[3], width: '34%', minWidth: 160, aspectRatio: '16 / 9', borderRadius: radius.md, overflow: 'hidden', boxShadow: shadow.lg, zIndex: 2 } as const
  const linkBtn = { display: 'inline-flex', alignItems: 'center', gap: space[1], textDecoration: 'none' } as const

  const videoBox = showVideo && (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: color.videoBg }}>
      {videoUrl
        ? <video key={videoUrl} ref={video} src={videoUrl} controls={swapped || !pip} playsInline autoPlay={picked !== null}
            style={{ display: 'block', width: '100%', height: '100%', objectFit: 'contain', background: color.videoBg }}
            onLoadedMetadata={(e) => {
              e.currentTarget.playbackRate = Number(rate)
              if (onRunVideo) e.currentTarget.currentTime = videoTimeAt(cursor.get(), offset) ?? 0
            }}
            onPlay={() => { if (onRunVideo) setPlaying(true) }}
            onPause={() => { if (onRunVideo) setPlaying(false) }}
            onTimeUpdate={(e) => { if (onRunVideo) cursor.set(e.currentTarget.currentTime + offset, 'video') }} />
        : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#aeaeb2', fontSize: font.size.sm, padding: space[3], textAlign: 'center' }}>
            {t('data.run.sampleVideo')}
          </div>}
      <span style={{ position: 'absolute', left: space[2], top: space[2], fontSize: font.size.xs, color: '#e8e8ea', background: 'rgba(0,0,0,0.5)', borderRadius: radius.xs, padding: `2px ${space[2]}px` }}>
        {onRunVideo
          ? t('data.run.camera', { camera: runVideo!.camera.replace(/^./, (c) => c.toUpperCase()) })
          : playingPath!.slice(playingPath!.indexOf('/') + 1)}
      </span>
      {onRunVideo && offset > 0 && <VideoNotYet cursor={cursor} offset={offset} />}
      {pip && (
        <span style={{ position: 'absolute', right: space[1], top: space[1] }}>
          <IconButton size="sm" icon={swapped ? Minimize2 : Maximize2} label={swapped ? t('data.run.showMap') : t('data.run.enlargeCamera')} onClick={() => setSwapped((s) => !s)}
            style={{ color: '#e8e8ea', background: 'rgba(0,0,0,0.45)' }} />
        </span>
      )}
    </div>
  )

  return (
    <div style={{ display: 'grid', gap: space[4] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
        <Button size="sm" variant="ghost" icon={ChevronLeft} onClick={onBack}>{t('data.run.back')}</Button>
        <span style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.t1 }}>{run.mission.name}</span>
        <Badge tone={RESULT_TONE[run.result]}>{t(`data.runs.result.${run.result}`)}</Badge>
        {run.end_reason && <span style={{ fontSize: font.size.sm, color: color.t2 }}>{runEndReason(run, t)}</span>}
        <span style={{ fontSize: font.size.sm, color: color.t2 }}>{run.robot_id} · {new Date(run.started_at).toLocaleString(formatLocale())} · {formatDuration(duration)}</span>
        {run.source && <Badge tone="neutral">{t(`data.run.source.${run.source}`)}</Badge>}
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: font.size.sm, color: color.t3 }}>{run.bucket_copied_at ? t('data.run.copiedAt', { at: new Date(run.bucket_copied_at).toLocaleString(formatLocale()) }) : t('data.run.notCopied')}</span>
        {svgUrl && <a href={svgUrl} target="_blank" rel="noreferrer" className="rh-btn rh-btn--ghost rh-btn--sm" style={linkBtn}>{t('data.run.figureSvg')}</a>}
        {pngUrl && <a href={pngUrl} target="_blank" rel="noreferrer" className="rh-btn rh-btn--ghost rh-btn--sm" style={linkBtn}>{t('data.run.figurePng')}</a>}
        {zipUrl
          ? <a href={zipUrl} download className="rh-btn rh-btn--primary rh-btn--sm" style={linkBtn}><Download size={14} aria-hidden />{t('data.run.zip')}</a>
          : <span style={{ fontSize: font.size.sm, color: color.t3 }}>{t('data.run.zipSample')}</span>}
      </div>

      <div data-run-figure style={{ position: 'relative', height: narrow ? 360 : 520, borderRadius: radius.lg, overflow: 'hidden', background: color.card }}>
        <div style={{ ...(swapped && pip && showVideo ? corner : fill), isolation: 'isolate' }}>
          <RunFigure map={map} floorIndex={floorIndex} waypoints={waypoints} model={model} plans={plans} cursor={cursor} layers={layers} fitKey={`${runId}:${track ? 'track' : 'none'}`} corner={showVideo && pip && !swapped} />
        </div>
        {showVideo && pip && <div data-run-pip style={swapped ? { ...fill, zIndex: 1 } : corner}>{videoBox}</div>}
        <div style={{ position: 'absolute', left: space[2], top: space[2], right: space[2], display: 'flex', gap: space[2], alignItems: 'flex-start', flexWrap: 'wrap', zIndex: 3, pointerEvents: 'none' }}>
          <span style={chip}>{t('data.run.figureTitle', { mission: run.mission.name, start: startText })}</span>
          <span style={{ flex: 1 }} />
          <div role="group" aria-label={t('data.run.layersLabel')} style={{ display: 'flex', gap: space[1], pointerEvents: 'auto' }}>
            {(['route', 'plans', 'walked'] as const).map((k) => (
              <Button key={k} size="sm" active={layers[k]} onClick={() => setLayers((l) => ({ ...l, [k]: !l[k] }))}>{t(`data.run.layer.${k}`)}</Button>
            ))}
          </div>
        </div>
        {(note || mapNote) && (
          <div style={{ position: 'absolute', left: space[3], bottom: space[3], display: 'flex', gap: space[2], flexWrap: 'wrap', maxWidth: pip && showVideo ? '60%' : undefined, zIndex: 3, pointerEvents: 'none' }}>
            {note && <Badge tone="amber">{note}</Badge>}
            {mapNote && <Badge>{mapNote}</Badge>}
          </div>
        )}
      </div>
      {showVideo && !pip && <div data-run-video style={{ aspectRatio: '16 / 9', borderRadius: radius.lg, overflow: 'hidden' }}>{videoBox}</div>}

      <div style={{ borderRadius: radius.lg, background: color.card, padding: space[3] }}>
        <RunTimelineLanes duration={duration} events={lane} controllers={controllers} speed={speed}
          cursor={cursor} playing={playing} onPlay={onPlay} rate={rate} onRate={setRate} onEvent={onLaneEvent} />
      </div>

      {track?.source === 'trace' && (
        <section style={{ display: 'grid', gap: space[2] }}>
          <h3 style={{ margin: 0, fontSize: font.size.md, fontWeight: font.weight.bold, color: color.t1, letterSpacing: font.tracking.tight }}>{t('data.run.legs.title')}</h3>
          <RunLegsTable legs={track.legs} waypoints={waypoints} markers={track.markers} cursor={cursor} onSeek={seekTo} />
        </section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', columnGap: space[10], rowGap: space[4], alignItems: 'start' }}>
        <RunEventsList run={run} runId={runId} events={events} cursor={cursor} onSeek={seekEvent} />
        {(stills.length > 0 || recordings.length > 0) && (
          <div style={{ display: 'grid', gap: space[3], alignContent: 'start' }}>
            {stills.length > 0 && (
              <div style={{ display: 'flex', gap: space[2], overflowX: 'auto' }}>
                {stills.map((f) => (
                  <button key={f.path} type="button" onClick={() => setOpenStill(f.path)} title={f.path}
                    style={{ border: 'none', padding: 0, background: 'transparent', cursor: 'pointer', flexShrink: 0 }}>
                    <img src={dataProvider.runFileUrl(runId, f.path)} alt={f.path} style={{ display: 'block', width: 112, aspectRatio: '4 / 3', objectFit: 'cover', borderRadius: radius.sm, background: color.videoBg }} />
                  </button>
                ))}
              </div>
            )}
            {recordings.length > 0 && (
              <div style={{ display: 'grid', gap: 2 }}>
                <span style={{ fontSize: font.size.sm, color: color.t3 }}>{t('data.run.recordings')}</span>
                {recordings.map((f) => {
                  const name = f.path.slice(f.path.indexOf('/') + 1)
                  const url = dataProvider.runFileUrl(runId, f.path)
                  const row = { display: 'flex', gap: space[2], alignItems: 'baseline', fontSize: font.size.sm, fontFamily: font.family } as const
                  const size = <span style={{ color: color.t3, fontVariantNumeric: 'tabular-nums' }}>{formatSize(f.size_bytes)}</span>
                  return f.path.startsWith('video/')
                    ? (
                      <button key={f.path} type="button" onClick={() => setPicked(f.path === runVideo?.path ? null : f.path)} title={t('data.run.playRecording')}
                        style={{ ...row, border: 'none', padding: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', color: color.accent }}>
                        <span>{name}</span>{size}
                      </button>
                    )
                    : (
                      <span key={f.path} style={row}>
                        {url
                          ? <a href={url} target="_blank" rel="noreferrer" style={{ color: color.accent, textDecoration: 'none' }}>{name}</a>
                          : <span style={{ color: color.t2 }}>{name}</span>}
                        {size}
                      </span>
                    )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={openStill !== null} onOpenChange={(o) => !o && setOpenStill(null)}>
        <DialogContent style={{ background: color.elevated, color: color.t1, maxWidth: 880 }}>
          {openStill && (
            <>
              <DialogHeader><DialogTitle style={{ color: color.t1 }}>{openStill}</DialogTitle></DialogHeader>
              <img src={dataProvider.runFileUrl(runId, openStill)} alt={openStill} style={{ width: '100%', borderRadius: radius.md, background: color.videoBg }} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
