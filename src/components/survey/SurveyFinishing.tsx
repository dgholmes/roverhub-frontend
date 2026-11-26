import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, CircleX, Loader2, PenLine, Play, Plus } from 'lucide-react'
import { Button } from '@/components/kit'
import { color, font, radius, space } from '@/design-system/tokens'
import { hashForMapEditor, hashForSiteSurvey } from '@/app/routes'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { FINISH_STAGES, isFindingMoved, type FinishStage } from '@/survey/surveyModel'
import { ProcessAgain, SkipMoving } from './SurveyActions'
import type { SurveyStatus } from '@/types/survey'

/**
 * After Stop & save: the device saves the recording, finds what moved and
 * builds the map, then uploads a draft. One step at a time from survey/status,
 * with the device's own words for the step and its progress; then a link
 * straight to the draft in the map editor, or the reason it failed. A discarded
 * survey says so and nothing more.
 */
export function SurveyFinishing({ status, siteId, onAnother }: {
  status: SurveyStatus
  siteId: string
  /** Back to the start form. */
  onAnother?: () => void
}) {
  const { t } = useTranslation()
  const box: React.CSSProperties = {
    display: 'grid', gap: space[3], padding: space[5], borderRadius: radius.lg, background: color.card, maxWidth: 640,
  }

  if (status.state === 'discarded') {
    return (
      <section data-survey-phase="discarded" style={box}>
        <h2 style={heading}>{t('survey.finish.discardedTitle')}</h2>
        <p style={body}>{t('survey.finish.discardedBody')}</p>
        {onAnother && <div><Button icon={Plus} onClick={onAnother}>{t('survey.finish.another')}</Button></div>}
      </section>
    )
  }

  if (status.state === 'failed') {
    return (
      <section data-survey-phase="failed" role="alert" style={{ ...box, background: color.redBg }}>
        <h2 style={{ ...heading, display: 'flex', alignItems: 'center', gap: space[2] }}>
          <CircleX size={18} color={color.red} aria-hidden />{t('survey.finish.failedTitle')}
        </h2>
        <p style={body}>{status.error || t('survey.finish.failedUnknown')}</p>
        {/* Process again (0.0.29): the recording is still on the robot. */}
        {status.survey_id && <ProcessAgain robotId={status.robot_id} surveyId={status.survey_id} />}
        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
          {status.survey_id && <WatchReplay siteId={siteId} surveyId={status.survey_id} />}
          {onAnother && <Button icon={Plus} onClick={onAnother}>{t('survey.finish.another')}</Button>}
        </div>
      </section>
    )
  }

  const current: FinishStage = status.state === 'done' ? 'done'
    : (FINISH_STAGES as readonly string[]).includes(status.state) ? status.state as FinishStage : 'saving'
  const at = FINISH_STAGES.indexOf(current)
  const pct = status.progress != null ? Math.round(status.progress * 100) : null

  return (
    <section data-survey-phase={status.state === 'done' ? 'done' : 'finishing'} style={box}>
      <h2 style={heading}>{status.state === 'done' ? t('survey.finish.doneTitle') : t('survey.finish.title')}</h2>
      <ol aria-label={t('survey.finish.stepsAria')} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: space[2] }}>
        {FINISH_STAGES.map((stage, i) => {
          const done = i < at || status.state === 'done'
          const now = i === at && status.state !== 'done'
          return (
            <li key={stage} data-stage={stage} aria-current={now ? 'step' : undefined}
              style={{ display: 'grid', gridTemplateColumns: '20px 1fr', gap: space[2], alignItems: 'start' }}>
              <span style={{ display: 'inline-flex', justifyContent: 'center', paddingTop: 2 }}>
                {done ? <Check size={15} color={color.green} aria-hidden />
                  : now ? <Loader2 size={15} color={color.accent} className="animate-spin" aria-hidden />
                    : <span aria-hidden style={{ width: 7, height: 7, marginTop: 4, borderRadius: radius.full, background: color.t4 }} />}
              </span>
              <span style={{ display: 'grid', gap: 4 }}>
                <span style={{ fontSize: font.size.md, color: done || now ? color.t1 : color.t3, fontWeight: now ? font.weight.semibold : font.weight.regular }}>
                  {t(`survey.finish.stage.${stage}`)}
                </span>
                {now && status.stage && <span style={{ fontSize: font.size.sm, color: color.t2 }}>{status.stage}</span>}
                {now && status.survey_id && isFindingMoved(status) && (
                  <span><SkipMoving robotId={status.robot_id} surveyId={status.survey_id} /></span>
                )}
                {now && pct !== null && (
                  <span role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
                    style={{ height: 3, maxWidth: 320, background: color.hover, borderRadius: radius.full, overflow: 'hidden' }}>
                    <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: color.accentSolid }} />
                  </span>
                )}
              </span>
            </li>
          )
        })}
      </ol>
      {status.state === 'done' && (
        <>
          <p style={body}>
            {t('survey.finish.doneBody', { name: status.name ?? '' })}{' '}
            {status.moved_spots == null ? null
              : status.moved_spots > 0 ? t('survey.finish.movedSpots', { count: status.moved_spots })
                : t('survey.finish.noMovedSpots')}
          </p>
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
            {status.map_id && (
              <a className="rh-btn rh-btn--primary" href={hashForMapEditor(siteId, status.map_id)} style={{ textDecoration: 'none' }}>
                <PenLine size={16} strokeWidth={1.75} aria-hidden />{t('survey.finish.openEditor')}
              </a>
            )}
            {status.survey_id && <WatchReplay siteId={siteId} surveyId={status.survey_id} />}
            {onAnother && <Button icon={Plus} onClick={onAnother}>{t('survey.finish.another')}</Button>}
          </div>
          <p style={{ ...body, fontSize: font.size.sm, color: color.t3 }}>{t('survey.finish.keptNote')}</p>
        </>
      )}
    </section>
  )
}

/**
 * The link to the survey's replay, shown only once the backend has the
 * survey's record: a failed survey may never have uploaded one, and the link
 * must not lead to a bare "answered 404" page.
 */
function WatchReplay({ siteId, surveyId }: { siteId: string; surveyId: string }) {
  const { t } = useTranslation()
  const [known, setKnown] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    dataProvider.getSurvey(surveyId).then(
      () => { if (!cancelled) setKnown(surveyId) },
      () => { if (!cancelled) setKnown(null) },
    )
    return () => { cancelled = true }
  }, [surveyId])
  if (known !== surveyId) return null
  return (
    <a className="rh-btn" href={hashForSiteSurvey(siteId, surveyId)} style={{ textDecoration: 'none' }}>
      <Play size={16} strokeWidth={1.75} aria-hidden />{t('survey.finish.watchReplay')}
    </a>
  )
}

const heading: React.CSSProperties = { margin: 0, fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.t1 }
const body: React.CSSProperties = { margin: 0, fontSize: font.size.md, color: color.t2, lineHeight: 1.5 }
