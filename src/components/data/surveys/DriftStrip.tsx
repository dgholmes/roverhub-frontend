import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { color, font, radius, space } from '@/design-system/tokens'
import { formatClock, verdictColour } from '@/survey/replay/replayModel'
import type { TakeSegment } from '@/types/surveyReplay'

/** The width of the take-name column; the page's scrubber sits beside the same
 * column so the strip lines up with it. */
export const STRIP_LABEL_W = 132
const ROW_H = 18
const ROW_GAP = 6

export interface DriftRow {
  takeId: string
  label: string
  colour: string
  segments: TakeSegment[]
  /** False for a take FAST-LIO2 fell behind on: its segments are drawn grey and
   * named "not judged", still there to seek by but clearly not a verdict. */
  judged: boolean
}

/** The late mark's radius: a dot in the middle of a segment that ran late. */
const LATE_DOT_R = 2.5

const num = (v: number | null, digits: number) => (v === null || !Number.isFinite(v) ? '—' : v.toFixed(digits))

const pctOf = (span: number) => (s: number) => `${(Math.min(span, Math.max(0, s)) / span) * 100}%`

/**
 * The segments, memoised apart from the cursor: playback moves the cursor about
 * 10 times a second, and every segment carries two translated strings.
 */
const Segments = memo(function Segments({ rows, end, onSeek }: { rows: DriftRow[]; end: number; onSeek: (s: number) => void }) {
  const { t } = useTranslation()
  const pct = pctOf(end > 0 ? end : 1)
  return (
    <>
      {rows.map((r, i) => {
        const y = i * (ROW_H + ROW_GAP)
        return (
          <g key={r.takeId} data-judged={r.judged ? undefined : 'false'}
            style={r.judged ? undefined : { filter: 'grayscale(1)', opacity: 0.45 }}>
            <rect x="0" y={y} width="100%" height={ROW_H} rx={3} style={{ fill: color.hover }} />
            {r.segments.map((s) => {
              const from = formatClock(s.start_s)
              const verdict = r.judged
                ? t('surveyReplay.strip.segment', { take: r.label, from, verdict: t(`surveyReplay.strip.verdict.${s.verdict}`) })
                : t('surveyReplay.strip.notJudged', { take: r.label, from })
              const name = s.late ? t('surveyReplay.strip.late', { segment: verdict }) : verdict
              const title = t('surveyReplay.strip.title', {
                ratio: num(s.ratio, 2), heading: num(s.heading_diff_deg === null ? null : Math.abs(s.heading_diff_deg), 0),
                z: num(s.z_range_m, 1), late: num(s.late_p95_s, 2),
              })
              const seek = () => onSeek(s.start_s)
              return (
                <g key={s.start_s}>
                  <rect role="button" tabIndex={0} aria-label={name}
                    x={pct(s.start_s)} y={y + 1} height={ROW_H - 2} width={pct(s.end_s - s.start_s)}
                    style={{ fill: verdictColour(s.verdict), cursor: 'pointer', outlineOffset: 1 }}
                    onClick={seek}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); seek() } }}>
                    <title>{title}</title>
                  </rect>
                  {s.late && (
                    <circle data-late-mark="" aria-hidden cx={pct((s.start_s + s.end_s) / 2)} cy={y + ROW_H / 2} r={LATE_DOT_R}
                      style={{ fill: color.t1, pointerEvents: 'none' }} />
                  )}
                </g>
              )
            })}
          </g>
        )
      })}
    </>
  )
})

/**
 * One row per visible take, its 20 s segments coloured by verdict against the
 * legs, all on the survey's one time axis (0 -> `end`), with a cursor at the
 * playhead. A segment is a button: clicking it seeks to its start, and hovering
 * shows its ratio, heading difference, z range and lateness. A segment that ran
 * late carries a dot; a take that was not judged (FAST-LIO2 fell behind) is
 * drawn grey. Pass `rows` and
 * `onSeek` stable (memoised) so the segments are not rebuilt as `time` moves.
 */
export function DriftStrip({ rows, end, time, onSeek }: {
  rows: DriftRow[]
  /** The axis length, seconds. */
  end: number
  time: number
  onSeek: (s: number) => void
}) {
  const { t } = useTranslation()
  const pct = pctOf(end > 0 ? end : 1)

  if (rows.length === 0) {
    return <div style={{ fontSize: font.size.sm, color: color.t3 }}>{t('surveyReplay.strip.none')}</div>
  }

  const height = rows.length * ROW_H + (rows.length - 1) * ROW_GAP
  const anyLate = rows.some((r) => r.segments.some((s) => s.late))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `${STRIP_LABEL_W}px minmax(0, 1fr)`, columnGap: space[3], rowGap: space[2] }}>
      <div style={{ display: 'grid', gridAutoRows: ROW_H, rowGap: ROW_GAP }}>
        {rows.map((r) => (
          <span key={r.takeId} title={r.judged ? r.label : `${r.label} — ${t('surveyReplay.verdict.fellBehindTitle')}`}
            style={{ display: 'flex', alignItems: 'center', gap: space[2], minWidth: 0, fontSize: font.size.sm,
              color: r.judged ? color.t2 : color.t3 }}>
            <span aria-hidden style={{ width: 8, height: 8, flexShrink: 0, borderRadius: radius.full, background: r.colour }} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
          </span>
        ))}
      </div>
      <svg role="group" aria-label={t('surveyReplay.strip.aria')} width="100%" height={height} style={{ display: 'block', overflow: 'visible' }}>
        <Segments rows={rows} end={end} onSeek={onSeek} />
        <line x1={pct(time)} x2={pct(time)} y1={-3} y2={height + 3} aria-hidden style={{ stroke: color.t1, strokeWidth: 2 }} />
      </svg>
      {anyLate && (
        <span title={t('surveyReplay.strip.lateLegendTitle')}
          style={{ gridColumn: 2, display: 'inline-flex', alignItems: 'center', gap: space[1], fontSize: font.size.sm, color: color.t3 }}>
          <span aria-hidden style={{ width: LATE_DOT_R * 2, height: LATE_DOT_R * 2, borderRadius: radius.full, background: color.t1 }} />
          {t('surveyReplay.strip.lateLegend')}
        </span>
      )}
    </div>
  )
}
