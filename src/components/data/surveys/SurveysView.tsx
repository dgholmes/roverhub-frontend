import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Footprints, HardDrive, Layers, Timer } from 'lucide-react'
import { formatLocale } from '@/i18n'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge } from '@/components/kit'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { useSiteRobots } from '@/org/useSiteRobots'
import { Placeholder, SampleBadge } from '@/components/org/parts'
import type { SurveySummary } from '@/types/surveyReplay'
import { formatClock } from '@/survey/replay/replayModel'
import { selectStyle } from '../selectStyle'
import { VerdictBadge } from './VerdictBadge'
import { answersMapReady } from '@/components/survey/SurveyActions'
import { RecordingControls } from './RecordingControls'

const COLS = 'minmax(220px, 1fr) 64px 72px 170px 84px 160px'
const COUNT: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: space[1] }

/**
 * Data › Surveys: every survey recorded at the site, newest first, with the
 * live take's drift verdict against the robot's leg odometry. A row opens the
 * survey's replay; under it, the recording on the robot (0.0.29): its size,
 * Keep, Process again, Rebuild from recording and Delete recording. The
 * robots' free disk sits above the list.
 */
export function SurveysView({ siteId, onOpen }: { siteId: string; onOpen: (surveyId: string) => void }) {
  const { t } = useTranslation()
  const robots = useSiteRobots()
  const [robotId, setRobotId] = useState('')
  const [list, setList] = useState<{ items: SurveySummary[]; sample: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const nameOf = useMemo(() => Object.fromEntries(robots.map((r) => [r.robot_id, r.name])), [robots])
  const robotOf = useMemo(() => Object.fromEntries(robots.map((r) => [r.robot_id, r])), [robots])
  const disks = robots.filter((r) => typeof r.bridge?.disk_free_gb === 'number' && (!robotId || r.robot_id === robotId))

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
        {disks.length > 0 && (
          <span data-free-disk="" title={t('survey.recording.freeDiskTitle')} style={{ display: 'inline-flex', gap: space[3], flexWrap: 'wrap', fontSize: font.size.sm, color: color.t2 }}>
            {disks.map((r) => (
              <span key={r.robot_id} style={COUNT}>
                <HardDrive size={13} aria-hidden />
                {t('survey.recording.freeDisk', { robot: r.name, gb: (r.bridge!.disk_free_gb as number).toLocaleString(formatLocale(), { maximumFractionDigits: 1 }) })}
              </span>
            ))}
          </span>
        )}
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
              // The row's card holds the survey (a button that opens it) and,
              // under it, its recording on the robot: buttons cannot nest.
              <div key={s.survey_id} data-survey={s.survey_id} style={{ display: 'grid', minWidth: 720, borderRadius: radius.md, background: color.card }}>
              <button type="button" onClick={() => onOpen(s.survey_id)}
                aria-label={t('surveyReplay.list.open', { name: s.name })}
                style={{ display: 'grid', gridTemplateColumns: COLS, gap: space[3], alignItems: 'center', width: '100%',
                  padding: space[3], border: 'none', borderRadius: radius.md, background: 'transparent', textAlign: 'left',
                  cursor: 'pointer', fontFamily: font.family, fontSize: font.size.md, color: color.t1 }}
                onMouseEnter={(e) => { e.currentTarget.style.background = color.cardHover }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}>
                <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                  <span style={{ fontWeight: font.weight.semibold, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                  <span style={{ fontSize: font.size.sm, color: color.t3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {robot} · {new Date(s.started_at).toLocaleString(formatLocale(), { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </span>
                <span style={{ ...COUNT, color: color.t2, fontVariantNumeric: 'tabular-nums' }} title={t('surveyReplay.list.durationTitle')}>
                  <Timer size={13} aria-hidden /> {formatClock(s.duration_s)}
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
              {answersMapReady(robotOf[s.robot_id]) && (
                <div style={{ padding: `0 ${space[3]}px ${space[3]}px` }}>
                  <RecordingControls survey={s} robot={robotOf[s.robot_id]} siteId={siteId} />
                </div>
              )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
