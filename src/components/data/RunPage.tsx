import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Download } from 'lucide-react'
import { MapContainer } from 'react-leaflet'
import L from 'leaflet'
import { formatLocale } from '@/i18n'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge, Button, type Tone } from '@/components/kit'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { GridLayer } from '@/components/liveops/map/GridLayer'
import { GeofenceLayer } from '@/components/liveops/map/GeofenceLayer'
import { NoGoZoneLayer } from '@/components/liveops/map/NoGoZoneLayer'
import { MAP_BOUNDS } from '@/components/liveops/map/MapCanvas'
import { EditableRouteLayer } from '@/components/missions/route-editor/EditableRouteLayer'
import { formatDuration } from '@/components/missions/parts'
import { eventOffsetMs, eventsAtOrBefore, followsPlayback, formatClock, formatSize, markColor, otherRecordings, runDurationMs, timelineMarks } from '@/data/runTimeline'
import type { RunDetail, RunEvent, RunResult } from '@/types'

const RESULT_TONE: Record<RunResult, Tone> = { running: 'accent', completed: 'green', aborted: 'amber', failed: 'red' }
const isStill = (path: string) => path.startsWith('photos/') || path.startsWith('detections/')

export function RunPage({ runId, onBack }: { siteId: string; runId: string; onBack: () => void }) {
  const { t } = useTranslation()
  const [detail, setDetail] = useState<RunDetail | null>(null)
  const [events, setEvents] = useState<RunEvent[]>([])
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [position, setPosition] = useState(0)
  const [openStill, setOpenStill] = useState<string | null>(null)
  /** A video picked from the recordings list; null plays the run video. */
  const [picked, setPicked] = useState<string | null>(null)
  const video = useRef<HTMLVideoElement>(null)
  const clickedAt = useRef(0)
  /** Seek to apply once the run video has loaded again after a picked clip. */
  const pendingSeek = useRef<number | null>(null)

  useEffect(() => {
    let cancelled = false
    setDetail(null); setEvents([]); setError(null); setSelected(null); setPosition(0); setPicked(null)
    Promise.all([dataProvider.getRun(runId), dataProvider.getRunEvents(runId)])
      .then(([d, e]) => { if (!cancelled) { setDetail(d); setEvents(e) } })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : String(err)) })
    return () => { cancelled = true }
  }, [runId])

  const run = detail?.run
  const marks = useMemo(() => (run ? timelineMarks(run, events) : []), [run, events])
  if (error) return <div style={{ color: color.red }}>{error}</div>
  if (!run || !detail) return <div style={{ color: color.t3 }}>{t('data.runs.loading')}</div>

  const duration = runDurationMs(run)
  const videoFile = detail.files.find((f) => f.path.startsWith('video/run_'))
  const playing = picked ?? videoFile?.path ?? null
  // The timeline and events follow the run video only; a task clip has its own clock.
  const onRunVideo = playing === (videoFile?.path ?? null)
  const videoUrl = playing ? dataProvider.runFileUrl(runId, playing) : ''
  const recordings = otherRecordings(detail.files, playing)
  const zipUrl = dataProvider.runZipUrl(runId)
  const selectedEvent = events.find((e) => e.seq === selected) ?? null
  const stills = detail.files.filter((f) => isStill(f.path))

  function seek(e: RunEvent) {
    clickedAt.current = Date.now()
    setSelected(e.seq)
    const seconds = Math.max(0, eventOffsetMs(run!, e) / 1000)
    if (!onRunVideo) {
      pendingSeek.current = seconds
      setPicked(null)
    } else if (video.current) video.current.currentTime = seconds
  }
  const time = (iso: string) => formatClock(iso, formatLocale())

  return (
    <div style={{ display: 'grid', gap: space[4] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
        <Button size="sm" variant="ghost" icon={ChevronLeft} onClick={onBack}>{t('data.run.back')}</Button>
        <span style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.t1 }}>{run.mission.name}</span>
        <Badge tone={RESULT_TONE[run.result]}>{t(`data.runs.result.${run.result}`)}</Badge>
        <span style={{ fontSize: font.size.sm, color: color.t2 }}>{new Date(run.started_at).toLocaleString(formatLocale())} · {formatDuration(duration / 1000)}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: font.size.sm, color: color.t3 }}>{run.bucket_copied_at ? t('data.run.copiedAt', { at: new Date(run.bucket_copied_at).toLocaleString(formatLocale()) }) : t('data.run.notCopied')}</span>
        {zipUrl
          ? <a href={zipUrl} download className="rh-btn rh-btn--primary rh-btn--sm" style={{ display: 'inline-flex', alignItems: 'center', gap: space[1], textDecoration: 'none' }}><Download size={14} aria-hidden />{t('data.run.zip')}</a>
          : <span style={{ fontSize: font.size.sm, color: color.t3 }}>{t('data.run.zipSample')}</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(280px, 1fr)', gap: space[4] }}>
        <div style={{ display: 'grid', gap: space[2], alignContent: 'start' }}>
          {videoUrl
            ? <video key={videoUrl} ref={video} controls src={videoUrl} autoPlay={picked !== null} style={{ width: '100%', borderRadius: radius.md, background: color.videoBg }}
                onLoadedMetadata={(e) => {
                  if (onRunVideo && pendingSeek.current !== null) {
                    e.currentTarget.currentTime = pendingSeek.current
                    pendingSeek.current = null
                  }
                }}
                onTimeUpdate={(e) => {
                  if (!onRunVideo) return
                  const ms = e.currentTarget.currentTime * 1000
                  setPosition(ms)
                  if (followsPlayback(Date.now(), clickedAt.current)) setSelected(eventsAtOrBefore(events, ms, run)?.seq ?? null)
                }} />
            : <div style={{ aspectRatio: '16 / 9', borderRadius: radius.md, background: color.videoBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: color.t3, fontSize: font.size.md, padding: space[4], textAlign: 'center' }}>
                {playing ? t('data.run.sampleVideo') : t('data.run.noVideo')}
              </div>}
          <div style={{ position: 'relative', height: 40, borderRadius: radius.md, background: color.card }}>
            <span aria-hidden style={{ position: 'absolute', top: 4, bottom: 4, width: 2, background: color.t1, left: `${Math.min(100, (position / (duration || 1)) * 100)}%` }} />
            {marks.map((m) => {
              const e = events.find((x) => x.seq === m.seq)!
              return (
                <button key={m.seq} type="button" onClick={() => seek(e)} aria-label={`${time(e.at)} ${t(`data.run.kind.${e.kind}`)}`} title={`${time(e.at)} · ${t(`data.run.kind.${e.kind}`)}`}
                  style={{ position: 'absolute', top: 8, left: `calc(${m.pct}% - 2px)`, width: 4, height: 24, borderRadius: 2, border: 'none', padding: 0, cursor: 'pointer',
                    background: markColor(m.kind), outline: m.seq === selected ? `2px solid ${color.t1}` : 'none' }} />
              )
            })}
          </div>
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
                    <button key={f.path} type="button" onClick={() => setPicked(f.path === videoFile?.path ? null : f.path)} title={t('data.run.playRecording')}
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

        <div style={{ display: 'grid', gap: space[3], alignContent: 'start' }}>
          <div style={{ maxHeight: 360, overflowY: 'auto', display: 'grid', gap: 2 }}>
            {events.map((e) => (
              <button key={e.seq} type="button" onClick={() => seek(e)}
                style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr auto', gap: space[2], alignItems: 'center', padding: `${space[1]}px ${space[2]}px`, border: 'none', borderRadius: radius.sm,
                  background: e.seq === selected ? color.selected : 'transparent', textAlign: 'left', cursor: 'pointer', fontFamily: font.family, color: color.t1, fontSize: font.size.sm }}>
                <span style={{ color: color.t3, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{time(e.at)}</span>
                <span>
                  {t(`data.run.kind.${e.kind}`)}
                  {(e.message || e.waypoint_id) && <span style={{ color: color.t2 }}> · {e.message ?? run.mission.waypoints.find((w) => w.waypoint_id === e.waypoint_id)?.label}</span>}
                  {e.actor && <span style={{ color: color.t3 }}> · {e.actor}</span>}
                </span>
                {e.media && isStill(e.media)
                  ? <img src={dataProvider.runFileUrl(runId, e.media)} alt="" style={{ width: 48, height: 36, objectFit: 'cover', borderRadius: 4 }} />
                  : <span />}
              </button>
            ))}
          </div>
          <div style={{ height: 200, borderRadius: radius.md, overflow: 'hidden' }}>
            <MapContainer crs={L.CRS.Simple} bounds={MAP_BOUNDS} style={{ height: '100%', width: '100%', background: color.mapBg }}
              zoomControl={false} attributionControl={false} minZoom={2} maxZoom={7} dragging={false} scrollWheelZoom={false}>
              <GridLayer bounds={MAP_BOUNDS} />
              <GeofenceLayer />
              <NoGoZoneLayer />
              <EditableRouteLayer waypoints={run.mission.waypoints} selectedId={selectedEvent?.waypoint_id ?? null} onSelect={() => {}} />
            </MapContainer>
          </div>
        </div>
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
