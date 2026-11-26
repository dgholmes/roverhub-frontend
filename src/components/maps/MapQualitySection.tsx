import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import { Badge, Button, type Tone } from '@/components/kit'
import { Section } from '@/components/fleet/v2/parts'
import { color, font, radius, space } from '@/design-system/tokens'
import { formatLocale } from '@/i18n'
import type { MapJob, MapQualityReport, QualityCheck, QualityCheckStatus } from '@/types/mapPipeline'
import { checkThresholdText, checkValueText, isKnownCheck, stageKey } from './mapPipeline'

const STATUS_TONE: Record<QualityCheckStatus, Tone> = {
  pass: 'green', fail: 'red', warn: 'amber', info: 'neutral', skipped: 'neutral',
}

export const whenText = (iso: string) =>
  new Date(iso).toLocaleString(formatLocale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

/** A check's name in the console's words; an id a newer backend added is shown as is. */
export function useCheckName() {
  const { t } = useTranslation()
  return (id: string) => (isKnownCheck(id) ? t(`missions.maps.quality.check.${id}`) : id)
}

/**
 * A map's quality report (tracker 1-5-05): the figures a reviewer reads before
 * freezing it -- tilt, flatness, drift, free area, path coverage -- each
 * against its limit, and whether the report still describes the files the map
 * holds. The backend computes it after every upload, restore and planning-grid
 * change; "Check again" queues another.
 */
export function MapQualitySection({ report, error, job, jobError, floorIndex, canRecheck, onRecheck }: {
  /** undefined while loading; null when no check has run. */
  report: MapQualityReport | null | undefined
  error: string | null
  /** A check running now, if any. */
  job: MapJob | null
  jobError: string | null
  floorIndex: number
  canRecheck: boolean
  onRecheck: () => void
}) {
  const { t } = useTranslation()
  const name = useCheckName()
  const note: React.CSSProperties = { margin: 0, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }
  const running = job !== null
  const stage = job ? stageKey(job.stage) : null

  const checks = report ? report.checks.filter((c) => c.floor === null || c.floor === floorIndex) : []

  return (
    <Section
      title={t('missions.maps.quality.title')}
      span
      aside={canRecheck ? (
        <Button size="sm" icon={RefreshCw} onClick={onRecheck} disabled={running}>
          {t('missions.maps.quality.recheck')}
        </Button>
      ) : undefined}
    >
      <div style={{ display: 'grid', gap: space[3] }}>
        {running && (
          <p role="status" style={{ ...note, display: 'flex', alignItems: 'center', gap: space[2], color: color.t2 }}>
            <span style={{ width: 8, height: 8, borderRadius: radius.full, background: color.accent, flexShrink: 0 }} />
            {t('missions.maps.quality.running', { stage: stage ? t(`missions.maps.survey.stage.${stage}` as 'missions.maps.survey.stage.quality') : job.stage })}
          </p>
        )}
        {jobError !== null && <p role="alert" style={{ ...note, color: color.red }}>{t('missions.maps.quality.jobFailed', { error: jobError })}</p>}
        {error && <p role="alert" style={{ ...note, color: color.red }}>{t('missions.maps.quality.loadFailed', { error })}</p>}
        {report === undefined && !error && <p style={note}>{t('missions.maps.quality.loading')}</p>}
        {/* After a save the backend has no report until its queued check ends: that is "checking", not "none". */}
        {report === null && !error && !running && <p style={{ ...note, color: color.t2 }}>{t('missions.maps.quality.none')}</p>}
        {report && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
              <Badge tone={report.passed ? 'green' : 'red'} dot>
                {report.passed ? t('missions.maps.quality.passed') : t('missions.maps.quality.failed')}
              </Badge>
              <Badge tone={report.current ? 'neutral' : 'amber'} dot>
                {report.current ? t('missions.maps.quality.current') : t('missions.maps.quality.stale')}
              </Badge>
              <span style={note}>{t('missions.maps.quality.computed', { when: whenText(report.computed_at), version: report.version })}</span>
            </div>
            {!report.current && <p style={{ ...note, color: color.amber }}>{t('missions.maps.quality.staleHint')}</p>}
            {!report.passed && report.failed.length > 0 && (
              <p style={{ ...note, color: color.t2 }}>
                {t('missions.maps.quality.failedList', { checks: report.failed.map(name).join(', ') })}
              </p>
            )}
            <CheckList checks={checks} />
          </>
        )}
      </div>
    </Section>
  )
}

/** Failed checks first, then warnings, then the rest in the backend's order:
 *  what a reviewer has to act on is never below the fold. */
const STATUS_RANK: Partial<Record<QualityCheckStatus, number>> = { fail: 0, warn: 1 }
export function orderChecks(checks: readonly QualityCheck[]): QualityCheck[] {
  return checks
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (STATUS_RANK[a.c.status] ?? 2) - (STATUS_RANK[b.c.status] ?? 2) || a.i - b.i)
    .map(({ c }) => c)
}

/**
 * The checks as a list sized for the Map page's ~320 px panel: each check is
 * two lines -- its name (and "Required" for the ones that must pass before the
 * map can be frozen) with its result on the right, then "measured · limit" --
 * so nothing is cut off and nothing scrolls sideways at any width. No rules
 * between rows: a red or amber tint marks a check that failed or warned, and
 * those come first.
 */
function CheckList({ checks }: { checks: QualityCheck[] }) {
  const { t } = useTranslation()
  const name = useCheckName()
  const valueOf = (c: QualityCheck) => {
    if (typeof c.value === 'boolean') return c.value ? t('missions.maps.quality.yes') : t('missions.maps.quality.no')
    return checkValueText(c)
  }
  return (
    <ul aria-label={t('missions.maps.quality.title')} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 2, minWidth: 0 }}>
      {orderChecks(checks).map((c, i) => {
        const tint = c.status === 'fail' ? color.redBg : c.status === 'warn' ? color.amberBg : 'transparent'
        const value = valueOf(c)
        const limit = checkThresholdText(c)
        return (
          <li
            key={`${c.id}:${c.floor}:${i}`} data-check={c.id} data-status={c.status} title={c.detail}
            style={{ display: 'grid', gap: 2, padding: `6px ${space[2]}px`, borderRadius: radius.xs, background: tint, minWidth: 0 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: space[2], minWidth: 0 }}>
              <span data-part="name" style={{
                flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: space[2], rowGap: 2,
                fontSize: font.size.md, color: color.t1, overflowWrap: 'anywhere',
              }}>
                {name(c.id)}
                {c.blocking && (
                  <span title={t('missions.maps.quality.blocking')} style={{
                    fontSize: font.size.xs, color: color.t2, background: color.hover,
                    borderRadius: radius.xs, padding: '0 6px', lineHeight: '18px', whiteSpace: 'nowrap',
                  }}>
                    {t('missions.maps.quality.required')}
                  </span>
                )}
              </span>
              <span data-part="result" style={{ flexShrink: 0 }}>
                <Badge tone={STATUS_TONE[c.status] ?? 'neutral'}>{t(`missions.maps.quality.status.${c.status}` as 'missions.maps.quality.status.pass')}</Badge>
              </span>
            </div>
            {(value !== null || limit !== null) && (
              <div style={{ fontSize: font.size.sm, color: color.t3, fontVariantNumeric: 'tabular-nums', overflowWrap: 'anywhere' }}>
                <span data-part="value" style={{ color: color.t2 }}>{value ?? '—'}</span>
                {limit !== null && <>{' · '}<span data-part="limit">{limit}</span></>}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
