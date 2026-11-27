import { memo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Pause, Play } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { IconButton, Segmented } from '@/components/kit'
import { useCursor, type RunCursor } from '@/data/runCursor'
import { formatRunClock, type ControllerSegment, type Series, type SpeedSeries } from '@/data/runTrack'
import type { LaneEvent } from '@/data/runTimeline'

export const PLAYBACK_RATES = ['1', '4', '16'] as const
export type PlaybackRate = (typeof PLAYBACK_RATES)[number]

const LABEL_W = 88
const SPEED_H = 72
const W = 1000

const pct = (t: number, duration: number) => `${Math.min(100, Math.max(0, (t / (duration || 1)) * 100))}%`

function controllerColor(name: string): string {
  if (name === 'FollowPath') return color.routeA
  if (name === 'FollowPathTight') return color.routeB
  return color.t3
}

function points(series: Series, duration: number, scale: number): string[] {
  const mid = SPEED_H / 2
  return series.map((run) => run.map(([t, v]) => `${((t / (duration || 1)) * W).toFixed(1)},${(mid - (v / scale) * (mid - 3)).toFixed(1)}`).join(' '))
}

/** The time under the cursor, and the line across every lane. */
function CursorLine({ cursor, duration }: { cursor: RunCursor; duration: number }) {
  const at = useCursor(cursor, (t) => Math.round((t / (duration || 1)) * 2000) / 20)
  return <span aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, width: 2, marginLeft: -1, left: `${Math.min(100, Math.max(0, at))}%`, background: color.t1, pointerEvents: 'none' }} />
}

function CursorClock({ cursor, duration }: { cursor: RunCursor; duration: number }) {
  const s = useCursor(cursor, (t) => Math.floor(t))
  return (
    <span style={{ fontSize: font.size.sm, color: color.t2, fontVariantNumeric: 'tabular-nums' }}>
      {formatRunClock(s)} / {formatRunClock(duration)}
    </span>
  )
}

const Lane = ({ label, height, children }: { label: string; height: number; children: React.ReactNode }) => (
  <>
    <span style={{ fontSize: font.size.xs, color: color.t3, alignSelf: 'center' }}>{label}</span>
    <div style={{ position: 'relative', height, borderRadius: radius.xs, background: color.hover }}>{children}</div>
  </>
)

/**
 * The run's timeline under the figure: Events, Controller and Speed lanes on
 * one time axis. Drag or click anywhere on the lanes to move the cursor; the
 * video, the figure and the lists follow it. The lanes themselves never
 * re-render as the cursor moves -- only the cursor line and the clock do.
 */
export const RunTimelineLanes = memo(function RunTimelineLanes({
  duration, events, controllers, speed, cursor, playing, onPlay, rate, onRate, onEvent,
}: {
  duration: number
  events: LaneEvent[]
  controllers: ControllerSegment[]
  /** A lane with nothing in it is left out: a run with no log has Events
   * only, and history samples have no controller and only measured speed. */
  speed: SpeedSeries
  cursor: RunCursor
  playing: boolean
  onPlay: (play: boolean) => void
  rate: PlaybackRate
  onRate: (rate: PlaybackRate) => void
  onEvent: (e: LaneEvent) => void
}) {
  const { t } = useTranslation()
  const track = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)
  // The slider's value for assistive tech, kept current without re-rendering the lanes.
  useEffect(() => {
    const sync = () => track.current?.setAttribute('aria-valuenow', String(Math.round(cursor.get())))
    sync()
    return cursor.subscribe(sync)
  }, [cursor])

  const seekTo = (clientX: number) => {
    const box = track.current?.getBoundingClientRect()
    if (!box || box.width <= 0) return
    cursor.set(Math.min(1, Math.max(0, (clientX - box.left - LABEL_W - space[2]) / (box.width - LABEL_W - space[2]))) * duration, 'user')
  }
  const hasSpeed = speed.ask.length + speed.sent.length + speed.meas.length > 0
  const lineStyle = { fill: 'none', vectorEffect: 'non-scaling-stroke' } as const

  return (
    <div style={{ display: 'grid', gap: space[2] }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
        <IconButton icon={playing ? Pause : Play} label={playing ? t('data.run.pause') : t('data.run.play')} onClick={() => onPlay(!playing)} />
        <CursorClock cursor={cursor} duration={duration} />
        <span style={{ flex: 1 }} />
        <Segmented label={t('data.run.rate')} value={rate} onChange={onRate} options={PLAYBACK_RATES.map((r) => ({ value: r, label: `${r}×` }))} />
      </div>
      <div
        ref={track} role="slider" aria-label={t('data.run.timeline')} aria-valuemin={0} aria-valuemax={Math.round(duration)} tabIndex={0}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 10 : 1
          if (e.key === 'ArrowRight') cursor.set(Math.min(duration, cursor.get() + step), 'user')
          else if (e.key === 'ArrowLeft') cursor.set(Math.max(0, cursor.get() - step), 'user')
          else return
          e.preventDefault()
        }}
        onPointerDown={(e) => { dragging.current = true; e.currentTarget.setPointerCapture?.(e.pointerId); seekTo(e.clientX) }}
        onPointerMove={(e) => { if (dragging.current) seekTo(e.clientX) }}
        onPointerUp={() => { dragging.current = false }}
        onPointerCancel={() => { dragging.current = false }}
        style={{ position: 'relative', display: 'grid', gridTemplateColumns: `${LABEL_W}px 1fr`, columnGap: space[2], rowGap: space[1], cursor: 'pointer', touchAction: 'none', userSelect: 'none' }}
      >
        <Lane label={t('data.run.lane.events')} height={28}>
          {/* Numbered arrivals last, so a task done at the same moment cannot cover the number. */}
          {[...events.filter((e) => !e.num), ...events.filter((e) => e.num)].map((e, i) => (
            <button key={i} type="button" title={e.title} aria-label={e.title}
              onPointerDown={(ev) => ev.stopPropagation()}
              onClick={() => onEvent(e)}
              style={{
                position: 'absolute', top: 4, left: pct(e.t, duration), transform: 'translateX(-50%)',
                minWidth: e.num ? 16 : 4, height: 20, padding: e.num ? '0 3px' : 0, border: 'none', borderRadius: e.num ? 8 : 2,
                background: e.color, color: color.accentText, fontSize: font.size['2xs'], fontWeight: font.weight.bold, fontFamily: font.family, cursor: 'pointer',
              }}>
              {e.num}
            </button>
          ))}
        </Lane>
        {controllers.length > 0 && (
          <Lane label={t('data.run.lane.controller')} height={20}>
            {controllers.map((c, i) => (
              <span key={i} title={c.name} style={{
                position: 'absolute', top: 3, bottom: 3, left: pct(c.t0, duration), width: `max(2px, calc(${pct(c.t1, duration)} - ${pct(c.t0, duration)}))`,
                borderRadius: 3, background: controllerColor(c.name), overflow: 'hidden', whiteSpace: 'nowrap',
                fontSize: font.size['2xs'], lineHeight: '14px', color: color.accentText, paddingLeft: 4,
              }}>{c.name}</span>
            ))}
          </Lane>
        )}
        {hasSpeed && (
          <Lane label={t('data.run.lane.speed')} height={SPEED_H}>
            {(
              <svg viewBox={`0 0 ${W} ${SPEED_H}`} preserveAspectRatio="none" width="100%" height={SPEED_H} style={{ position: 'absolute', inset: 0, display: 'block' }} aria-hidden>
                <line x1={0} x2={W} y1={SPEED_H / 2} y2={SPEED_H / 2} stroke={color.border} strokeWidth={1} style={{ vectorEffect: 'non-scaling-stroke' }} />
                {points(speed.wz, duration, speed.maxW).map((p, i) => <polyline key={`w${i}`} points={p} stroke={color.t3} strokeWidth={1} strokeDasharray="3 3" style={lineStyle} />)}
                {points(speed.ask, duration, speed.maxV).map((p, i) => <polyline key={`a${i}`} points={p} stroke={color.amber} strokeWidth={1.5} style={lineStyle} />)}
                {points(speed.sent, duration, speed.maxV).map((p, i) => <polyline key={`s${i}`} points={p} stroke={color.green} strokeWidth={1.5} style={lineStyle} />)}
                {points(speed.meas, duration, speed.maxV).map((p, i) => <polyline key={`m${i}`} points={p} stroke={color.blue} strokeWidth={1.5} style={lineStyle} />)}
                {speed.dropped.map((d, i) => {
                  const x = (d / (duration || 1)) * W
                  return <line key={`d${i}`} x1={x} x2={x} y1={SPEED_H - 8} y2={SPEED_H} stroke={color.red} strokeWidth={2} style={{ vectorEffect: 'non-scaling-stroke' }} />
                })}
              </svg>
            )}
            <span style={{ position: 'absolute', right: 4, top: 2, fontSize: font.size['2xs'], color: color.t3, pointerEvents: 'none' }}>±{speed.maxV.toFixed(2)} m/s</span>
          </Lane>
        )}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: LABEL_W + space[2], right: 0, pointerEvents: 'none' }}>
          <CursorLine cursor={cursor} duration={duration} />
        </div>
      </div>
      {hasSpeed && (
        <div style={{ display: 'flex', gap: space[4], flexWrap: 'wrap', fontSize: font.size.xs, color: color.t2, paddingLeft: LABEL_W + space[2] }}>
          {([['ask', color.amber, speed.ask.length], ['sent', color.green, speed.sent.length], ['meas', color.blue, speed.meas.length], ['wz', color.t3, speed.wz.length], ['dropped', color.red, speed.dropped.length]] as const).filter(([, , n]) => n > 0).map(([k, c]) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: space[1] }}>
              <span aria-hidden style={{ width: 14, height: 2, borderRadius: 1, background: c }} />{t(`data.run.speed.${k}`)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
})
