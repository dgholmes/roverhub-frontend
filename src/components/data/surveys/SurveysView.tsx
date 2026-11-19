import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Footprints, Layers, Timer } from 'lucide-react'
import { formatLocale } from '@/i18n'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge } from '@/components/kit'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { useSiteRobots } from '@/org/useSiteRobots'
import { Placeholder, SampleBadge } from '@/components/org/parts'
import type { SurveySummary } from '@/types/surveyReplay'
import { selectStyle } from '../selectStyle'
import { mmss } from './format'
import { VerdictBadge } from './VerdictBadge'

const COLS = 'minmax(220px, 1fr) 64px 72px 170px 84px 160px'
const COUNT: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: space[1] }

/**
 * Data › Surveys: every survey recorded at the site, newest first, with the
 * live take's drift verdict against the robot's leg odometry. A row opens the
 * survey's replay.
 */
export function SurveysView({ siteId, onOpen }: { siteId: string; onOpen: (surveyId: string) => void }) {
  const { t } = useTranslation()
  const robots = useSiteRobots()
  const [robotId, setRobotId] = useState('')
  const [list, setList] = useState<{ items: SurveySummary[]; sample: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const nameOf = useMemo(() => Object.fromEntries(robots.map((r) => [r.robot_id, r.name])), [robots])

  useEffect(() => {
    let cancelled = false
    setError(null)
    dataProvider.listSurveys({ site_id: siteId, robot_id: robotId || undefined })
      .then((l) => { if (!cancelled) setList(l) })
      .catch((e: unknown) => { if (!cancelled) { setList(null); setError(e instanceof Error ? e.message : String(e)) } })
    return () => { cancelled = true }
  }, [siteId, robotId])

  return (
    <div style={{ display: 'grid', gap: space[4] }}>
      <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
        <label htmlFor="surveys-robot" style={{ fontSize: font.size.sm, color: color.t2 }}>{t('data.robot')}</label>
        <select id="surveys-robot" style={selectStyle} value={robotId} onChange={(e) => setRobotId(e.target.value)}>
          <option value="">{t('data.allRobots')}</option>
          {robots.map((r) => <option key={r.robot_id} value={r.robot_id}>{r.name}</option>)}
        </select>
        <span style={{ flex: 1 }} />
        {list?.sample && <SampleBadge />}
      </div>

      {error ? (
        <Placeholder title={t('surveyReplay.list.errorTitle')}>{t('surveyReplay.list.errorBody', { error })}</Placeholder>
      ) : !list ? (
        <div style={{ fontSize: font.size.md, color: color.t3 }}>{t('surveyReplay.list.loading')}</div>
      ) : list.items.length === 0 ? (
        <Placeholder title={t('surveyReplay.list.emptyTitle')}>{t('surveyReplay.list.emptyBody')}</Placeholder>
      ) : (
        <div style={{ display: 'grid', gap: space[2], overflowX: 'auto' }}>
          {list.items.map((s) => {
            const robot = nameOf[s.robot_id] ?? s.robot_id
            return (
              <button key={s.survey_id} type="button" onClick={() => onOpen(s.survey_id)}
                aria-label={t('surveyReplay.list.open', { name: s.name })}
                style={{ display: 'grid', gridTemplateColumns: COLS, gap: space[3], alignItems: 'center', width: '100%', minWidth: 720,
                  padding: space[3], border: 'none', borderRadius: radius.md, background: color.card, textAlign: 'left',
                  cursor: 'pointer', fontFamily: font.family, fontSize: font.size.md, color: color.t1 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = color.cardHover }}
                onMouseLeave={(e) => { e.currentTarget.style.background = color.card }}>
                <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                  <span style={{ fontWeight: font.weight.semibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                  <span style={{ fontSize: font.size.sm, color: color.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {robot} · {new Date(s.started_at).toLocaleString(formatLocale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </span>
                <span style={{ ...COUNT, color: color.t2, fontVariantNumeric: 'tabular-nums' }} title={t('surveyReplay.list.durationTitle')}>
                  <Timer size={13} aria-hidden /> {mmss(s.duration_s)}
                </span>
                {/* Without legs the original take walked 0 m by them: say nothing rather than "0 m". */}
                <span style={{ ...COUNT, color: color.t2, fontVariantNumeric: 'tabular-nums' }}>
                  {s.has_legs && s.legs_m !== null && (
                    <span style={COUNT} title={t('surveyReplay.list.walkedTitle')}>
                      <Footprints size={13} aria-hidden /> {t('surveyReplay.list.walked', { m: Math.round(s.legs_m).toLocaleString(formatLocale()) })}
                    </span>
                  )}
                </span>
                {/* The original take's verdict. */}
                <span><VerdictBadge hasLegs={s.has_legs} firstBadS={s.first_bad_s} /></span>
                <span style={{ ...COUNT, color: color.t2, fontSize: font.size.sm }} title={t('surveyReplay.list.takesTitle')}>
                  <Layers size={13} aria-hidden /> {t('surveyReplay.list.takes', { count: s.take_count })}
                </span>
                <span>
                  {!s.recording_kept && <Badge title={t('surveyReplay.list.recordingDeletedTitle')}>{t('surveyReplay.list.recordingDeleted')}</Badge>}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
