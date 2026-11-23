import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, Footprints, Maximize2, Pause, Play, TriangleAlert } from 'lucide-react'
import { formatLocale } from '@/i18n'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge, Button, IconButton, Segmented, type Tone } from '@/components/kit'
import { Placeholder, SampleBadge } from '@/components/org/parts'
import { dataProvider, USE_REAL_BACKEND } from '@/lib/realtime/dataProvider'
import { useThemeStore } from '@/lib/theme'
import { useSiteRobots } from '@/org/useSiteRobots'
import { resolveScenePalette } from '@/scene3d/palette'
import type { ScenePalette } from '@/scene3d/types'
import { ReplayScene, type ReplayPath } from '@/survey/replay/ReplayScene'
import { anyJudged, formatClock, toBuffers, viewBounds, type PathBuffer } from '@/survey/replay/replayModel'
import type { ReplayTake, SurveyRecord, TakeSegment } from '@/types/surveyReplay'
import { DriftStrip, STRIP_LABEL_W, type DriftRow } from './DriftStrip'
import { RecordingControls } from './RecordingControls'
import { VerdictBadge } from './VerdictBadge'

const SPEEDS = ['1', '4', '16'] as const
type Speed = typeof SPEEDS[number]
/** "Ran late" when more than this share of a take's segments did. */
const LATE_SHARE = 0.1
/** How often playback commits React state per second of playback at 1x. */
const COMMIT_HZ = 10

interface LoadedTake {
  take: ReplayTake
  /** Null when paths.json or segments.json was not there: the take cannot play. */
  buffers: { take: PathBuffer; legs: PathBuffer } | null
  segments: TakeSegment[] | null
  /** Why its files could not be read, when that was an error rather than a 404. */
  error: string | null
}

interface Loaded {
  record: SurveyRecord
  takes: LoadedTake[]
}

const isComplete = (l: LoadedTake): l is LoadedTake & { buffers: NonNullable<LoadedTake['buffers']>; segments: TakeSegment[] } =>
  l.buffers !== null && l.segments !== null

/** A CSS colour variable as the theme resolves it now (WebGL needs the value). */
function cssVar(name: string, fallback: string): string {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
  } catch {
    return fallback
  }
}

/** Take colours, by the take's place in the list: the live take in the scene's
 * track colour, then colours that are not a status (the legs are amber). */
function takeColours(p: ScenePalette): string[] {
  return [p.track, p.robot, cssVar('--rh-map-scan', '#bf5af2'), cssVar('--rh-route-b', '#c69c6d'), p.accent]
}

const last = (t: Float64Array) => (t.length > 0 ? t[t.length - 1] : 0)

/** A show/hide switch drawn like the profile menu's: a track and a thumb. */
function ShowSwitch({ on, label, onChange }: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} title={label} onClick={() => onChange(!on)}
      style={{ width: 32, height: 18, borderRadius: 9, flexShrink: 0, position: 'relative', border: 'none', padding: 0, cursor: 'pointer',
        background: on ? color.accentSolid : color.t4, transition: 'background 0.15s' }}>
      <span aria-hidden style={{
        position: 'absolute', top: 2, left: on ? 16 : 2, width: 14, height: 14, borderRadius: '50%',
        background: on ? color.accentText : '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.3)', transition: 'left 0.15s',
      }} />
    </button>
  )
}

/**
 * Data › Surveys › one survey: its takes (FAST-LIO2's paths) and the robot's
 * leg odometry, drawn from above and growing as the survey plays, with a
 * timeline, the drift strip (each take judged against the legs every 20 s) and
 * the takes list. One time axis: seconds since the original take's first pose,
 * so a take over a window simply starts drawing later.
 */
export function SurveyReplayPage({ siteId, surveyId, onBack }: { siteId: string; surveyId: string; onBack: () => void }) {
  const { t } = useTranslation()
  const robots = useSiteRobots()
  const [data, setData] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set())
  const [time, setTime] = useState(0)
  const timeRef = useRef(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState<Speed>('1')
  const [noWebgl, setNoWebgl] = useState(false)
  const sceneHost = useRef<HTMLDivElement>(null)
  const scene = useRef<ReplayScene | null>(null)
  const theme = useThemeStore((s) => s.theme)
  const accent = useThemeStore((s) => s.accent)

  useEffect(() => {
    let cancelled = false
    setData(null); setError(null); setHidden(new Set()); setPlaying(false)
    timeRef.current = 0
    setTime(0)
    ;(async () => {
      const detail = await dataProvider.getSurvey(surveyId)
      // The live take first, then the others as the backend lists them.
      const ordered = [...detail.takes].sort((a, b) => Number(b.take_id === 'original') - Number(a.take_id === 'original'))
      const takes = await Promise.all(ordered.map(async (take): Promise<LoadedTake> => {
        try {
          const [paths, segments] = await Promise.all([
            dataProvider.getTakePaths(surveyId, take.take_id), dataProvider.getTakeSegments(surveyId, take.take_id),
          ])
          return { take, buffers: paths && toBuffers(paths), segments, error: null }
        } catch (e) {
          // One take's files failing must not stop the others playing.
          return { take, buffers: null, segments: null, error: e instanceof Error ? e.message : String(e) }
        }
      }))
      if (!cancelled) setData({ record: detail.record, takes })
    })().catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [surveyId])

  const palette = useMemo(() => resolveScenePalette(), [theme, accent]) // eslint-disable-line react-hooks/exhaustive-deps
  const colours = useMemo(() => takeColours(palette), [palette])
  const colourOf = useCallback((i: number) => colours[i % colours.length], [colours])

  const original = data?.takes.find((l) => l.take.take_id === 'original') ?? null
  // Ruling R9: the legs are drawn from the original take's paths.json only.
  const legs = original?.buffers?.legs ?? null
  const hasLegs = !!legs && legs.t.length > 0
  const end = useMemo(() => {
    if (!data) return 0
    let e = legs ? last(legs.t) : 0
    for (const l of data.takes) if (isComplete(l)) e = Math.max(e, last(l.buffers.take.t))
    return e > 0 ? e : data.record.duration_s
  }, [data, legs])

  const visible = useMemo(() => (data?.takes ?? [])
    .map((l, i) => ({ l, colour: colourOf(i) }))
    .filter(({ l }) => isComplete(l) && !hidden.has(l.take.take_id)), [data, hidden, colourOf])

  const paths = useMemo((): ReplayPath[] => [
    ...(hasLegs && legs ? [{ id: 'legs', colour: palette.amber, t: legs.t, xyz: legs.xyz }] : []),
    ...visible.map(({ l, colour }) => ({ id: l.take.take_id, colour, t: l.buffers!.take.t, xyz: l.buffers!.take.xyz })),
  ], [hasLegs, legs, palette, visible])

  const bounds = useMemo(() => {
    if (!data) return null
    const frameTake = original && isComplete(original) ? original : data.takes.find(isComplete)
    return viewBounds(legs, frameTake?.buffers?.take ?? null)
  }, [data, legs, original])

  const seek = useCallback((s: number) => {
    timeRef.current = s
    setTime(s)
  }, [])

  // The scene, once there is something to draw. Effects run in order, so the
  // ones below find it.
  const ready = data !== null
  useEffect(() => {
    if (!ready || !sceneHost.current) return
    try {
      scene.current = new ReplayScene(sceneHost.current)
      setNoWebgl(false)
    } catch (e) {
      console.warn('survey replay: WebGL is not available', e)
      setNoWebgl(true)
    }
    return () => {
      scene.current?.dispose()
      scene.current = null
    }
  }, [ready])
  useEffect(() => { scene.current?.setPaths(paths) }, [paths])
  useEffect(() => { if (bounds) scene.current?.fit(bounds) }, [bounds])
  // timeRef, not `time`: while playing, the state lags the playhead by up to a
  // tenth, and the scene must not be stepped back to it.
  useEffect(() => { scene.current?.setTime(timeRef.current) }, [time, paths])

  // Playback on requestAnimationFrame at the chosen speed. The scene follows
  // every frame directly; React state (the clock, the slider, the strip's
  // cursor) is committed only when the playhead enters a new tenth of a
  // second at 1x, about 10 Hz, so a 22-minute survey is not ~80k page renders.
  useEffect(() => {
    if (!playing) return
    const rate = Number(speed)
    let before = performance.now()
    let shown = Math.floor(timeRef.current * COMMIT_HZ / rate)
    let id = requestAnimationFrame(function step(now) {
      // The first frame's timestamp can predate `before`: never step back.
      const next = Math.min(end, timeRef.current + (Math.max(0, now - before) / 1000) * rate)
      before = now
      timeRef.current = next
      scene.current?.setTime(next)
      const tick = Math.floor(next * COMMIT_HZ / rate)
      if (next >= end) {
        setTime(next)
        setPlaying(false)
        return
      }
      if (tick !== shown) {
        shown = tick
        setTime(next)
      }
      id = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(id)
  }, [playing, speed, end])

  const rows = useMemo((): DriftRow[] => visible.map(({ l, colour }) => ({
    takeId: l.take.take_id, label: l.take.label, colour, segments: l.segments!,
    // FAST-LIO2 fell behind the player: the path is not a fair test (spec §2).
    judged: l.take.kept_up !== false,
  })), [visible])
  const showTake = useCallback((takeId: string, on: boolean) => setHidden((h) => {
    const next = new Set(h)
    if (on) next.delete(takeId)
    else next.add(takeId)
    return next
  }), [])

  if (error) return (
    <div style={{ display: 'grid', gap: space[3], justifyItems: 'start' }}>
      <Button size="sm" variant="ghost" icon={ChevronLeft} onClick={onBack}>{t('surveyReplay.page.back')}</Button>
      <Placeholder title={t('surveyReplay.page.errorTitle')}>{t('surveyReplay.page.errorBody', { error })}</Placeholder>
    </div>
  )
  if (!data) return <div style={{ fontSize: font.size.md, color: color.t3 }}>{t('surveyReplay.page.loading')}</div>

  const { record } = data
  const robotState = robots.find((r) => r.robot_id === record.robot_id)
  const robot = robotState?.name ?? record.robot_id
  const togglePlay = () => {
    if (playing) {
      // Commit the exact playhead: playback commits only every tenth (at 1x),
      // so without this the clock and slider would stop short of the scene.
      setTime(timeRef.current)
      setPlaying(false)
      return
    }
    if (timeRef.current >= end) seek(0)
    setPlaying(true)
  }
  const small: React.CSSProperties = { fontSize: font.size.sm, color: color.t3 }

  return (
    <div style={{ display: 'grid', gap: space[4] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
        <Button size="sm" variant="ghost" icon={ChevronLeft} onClick={onBack}>{t('surveyReplay.page.back')}</Button>
        <span style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.t1 }}>{record.name}</span>
        <VerdictBadge hasLegs={original?.take.has_legs ?? false} firstBadS={original?.take.first_bad_s ?? null}
          judged={original?.segments ? anyJudged(original.segments) : false} keptUp={original?.take.kept_up} />
        <span style={{ fontSize: font.size.sm, color: color.t2 }}>
          {robot} · {new Date(record.started_at).toLocaleString(formatLocale())} · {formatClock(record.duration_s)}
        </span>
        <span style={{ flex: 1 }} />
        {!USE_REAL_BACKEND && <SampleBadge />}
      </div>

      {/* The recording on the robot (0.0.29): Keep, Process again, Rebuild from recording, Delete. */}
      <RecordingControls survey={record} robot={robotState} siteId={siteId} detailed />

      <div style={{ position: 'relative', height: '55vh', minHeight: 260, borderRadius: radius.md, overflow: 'hidden', background: color.sceneBg }}>
        <div ref={sceneHost} role="img" aria-label={t('surveyReplay.page.sceneAria')} style={{ position: 'absolute', inset: 0 }} />
        {noWebgl
          ? <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: space[4], textAlign: 'center', ...small }}>{t('surveyReplay.page.noWebgl')}</div>
          : bounds && (
            <div style={{ position: 'absolute', top: space[2], right: space[2] }}>
              <IconButton icon={Maximize2} label={t('surveyReplay.page.fit')} size="sm" onClick={() => scene.current?.fit(bounds)} />
            </div>
          )}
      </div>

      <div style={{ display: 'grid', gap: space[3], padding: space[3], borderRadius: radius.md, background: color.card }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap' }}>
          <Button size="sm" variant="primary" icon={playing ? Pause : Play} onClick={togglePlay}
            aria-label={playing ? t('surveyReplay.page.pause') : t('surveyReplay.page.play')}>
            {playing ? t('surveyReplay.page.pause') : t('surveyReplay.page.play')}
          </Button>
          <span style={{ fontSize: font.size.md, color: color.t1, fontVariantNumeric: 'tabular-nums' }}>
            {formatClock(time)} <span style={{ color: color.t3 }}>/ {formatClock(end)}</span>
          </span>
          <span style={{ flex: 1 }} />
          <Segmented label={t('surveyReplay.page.speed')} value={speed} onChange={setSpeed}
            options={SPEEDS.map((value) => ({ value, label: `${value}×` }))} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `${STRIP_LABEL_W}px minmax(0, 1fr)`, columnGap: space[3], alignItems: 'center' }}>
          <span style={small}>{t('surveyReplay.page.stripTitle')}</span>
          <input type="range" min={0} max={end} step={0.1} value={time} aria-label={t('surveyReplay.page.time')}
            onChange={(e) => seek(Number(e.target.value))}
            style={{ width: '100%', margin: 0, accentColor: color.accentSolid }} />
        </div>
        <DriftStrip rows={rows} end={end} time={time} onSeek={seek} />
      </div>

      <div style={{ display: 'flex', gap: space[2], alignItems: 'flex-start', ...small, lineHeight: 1.5 }}>
        {!original || !isComplete(original) ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: space[1] }}>
            <Footprints size={14} aria-hidden /> {original ? t('surveyReplay.page.originalIncomplete') : t('surveyReplay.page.noOriginal')}
          </span>
        ) : hasLegs ? (
          <>
            <span title={t('surveyReplay.page.legsTitle')} style={{ display: 'inline-flex', alignItems: 'center', gap: space[1], flexShrink: 0, color: color.t2 }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: radius.full, background: color.amber }} />
              {t('surveyReplay.page.legs')}
            </span>
            <span>{t('surveyReplay.page.legend')}</span>
          </>
        ) : (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: space[1] }}>
            <Footprints size={14} aria-hidden /> {t('surveyReplay.page.noLegs')}
          </span>
        )}
      </div>

      <section style={{ display: 'grid', gap: space[2] }}>
        <h3 style={{ margin: 0, fontSize: font.size.md, fontWeight: font.weight.bold, color: color.t1 }}>{t('surveyReplay.page.takesTitle')}</h3>
        {data.takes.map((l, i) => (
          <TakeRow key={l.take.take_id} loaded={l} colour={colourOf(i)} end={end}
            shown={!hidden.has(l.take.take_id)} onShow={showTake} />
        ))}
      </section>
    </div>
  )
}

/** Memoised, with a stable `onShow`: playback commits the page about 10 times
 * a second, and none of that changes a take's row. */
const TakeRow = memo(function TakeRow({ loaded, colour, end, shown, onShow }: {
  loaded: LoadedTake
  colour: string
  end: number
  shown: boolean
  onShow: (takeId: string, on: boolean) => void
}) {
  const { t } = useTranslation()
  const { take } = loaded
  const complete = isComplete(loaded)
  const segments = loaded.segments ?? []
  const lateCount = segments.filter((s) => s.late).length
  const ranLate = segments.length > 0 && lateCount / segments.length > LATE_SHARE
  const whole = take.window_start_s === 0 && take.window_duration_s === null
  const windowEnd = take.window_duration_s === null ? end : take.window_start_s + take.window_duration_s
  const kept: [Tone, string, string] = take.kept_up === true
    ? ['green', t('surveyReplay.take.keptUp'), t('surveyReplay.take.keptUpTitle')]
    : take.kept_up === false
      ? ['amber', t('surveyReplay.take.fellBehind'), t('surveyReplay.take.fellBehindTitle')]
      : ['neutral', t('surveyReplay.take.keptUpUnknown'), t('surveyReplay.take.keptUpUnknownTitle')]
  const meta: React.CSSProperties = { fontSize: font.size.sm, color: color.t3 }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: space[3], alignItems: 'center',
      padding: space[3], borderRadius: radius.md, background: color.card }}>
      <span aria-hidden style={{ width: 10, height: 10, borderRadius: radius.full, background: complete ? colour : color.t4 }} />
      <span style={{ display: 'grid', gap: space[1], minWidth: 0 }}>
        <span style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1 }}>{take.label}</span>
          <Badge>{t(`surveyReplay.take.source.${take.source}`)}</Badge>
          {complete && <VerdictBadge hasLegs={take.has_legs} firstBadS={take.first_bad_s} judged={anyJudged(segments)} keptUp={take.kept_up} />}
          {complete && <Badge tone={kept[0]} title={kept[2]}>{kept[1]}</Badge>}
        </span>
        <span style={{ ...meta, display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
          {take.preset && <span>{t('surveyReplay.take.preset', { preset: take.preset })}</span>}
          <span title={t('surveyReplay.take.windowTitle')} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {whole ? t('surveyReplay.take.wholeSurvey') : t('surveyReplay.take.window', { from: formatClock(take.window_start_s), to: formatClock(windowEnd) })}
          </span>
          {complete && ranLate && (
            <span title={t('surveyReplay.take.ranLateTitle')} style={{ color: color.amber }}>
              {t('surveyReplay.take.ranLate', { count: lateCount, total: segments.length })}
            </span>
          )}
        </span>
        {!complete && (
          <span style={{ ...meta, color: color.t2 }}>
            {loaded.error ? t('surveyReplay.take.unreadable', { error: loaded.error }) : t('surveyReplay.take.incomplete')}
          </span>
        )}
        {take.warnings.length > 0 && (
          <ul aria-label={t('surveyReplay.take.warningsAria', { label: take.label })}
            style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: space[1] }}>
            {take.warnings.map((w, i) => (
              <li key={i} style={{ ...meta, color: color.t2, display: 'flex', gap: space[1], alignItems: 'flex-start', lineHeight: 1.4 }}>
                <TriangleAlert size={13} color={color.amber} aria-hidden style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        )}
      </span>
      {complete ? <ShowSwitch on={shown} label={t('surveyReplay.take.show', { label: take.label })} onChange={(on) => onShow(take.take_id, on)} /> : <span />}
    </div>
  )
})
