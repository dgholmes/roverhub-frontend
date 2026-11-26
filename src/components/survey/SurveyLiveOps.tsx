import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Radar, X } from 'lucide-react'
import { IconButton } from '@/components/kit'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import type { OverflowEntry } from '@/components/liveops/command/CommandOverflowMenu'
import { color, font, radius, space } from '@/design-system/tokens'
import { hashForMapEditor, hashForMapSurvey } from '@/app/routes'
import { useOperatorId } from '@/lib/realtime/operator'
import { useControlHolderNames } from '@/liveops/controlOwner'
import type { RobotRunView } from '@/liveops/robotRun'
import { formatClock } from '@/liveops/taskBar'
import { useCan } from '@/org/useCan'
import { useSiteRobots } from '@/org/useSiteRobots'
import {
  formatArea, isFindingMoved, isFinishing, isSurveyBusy, isSurveying, robotCanSurvey, surveyStartRefusal,
  surveyStartRefusalText,
} from '@/survey/surveyModel'
import { useSurveyStatus } from '@/survey/useSurvey'
import type { RobotState } from '@/types'
import { ProcessAgain, SkipMoving } from './SurveyActions'
import { SurveyStartForm } from './SurveyStartForm'
import { SurveyStopControls } from './SurveyStopControls'

/**
 * Survey mode inside LiveOps (option B of the 2026-11-16 choice), on the same
 * data and controls as Map › Survey:
 *   - useSurveyMenu: the "Start survey" entry for the command bar's More menu,
 *     and the start form it opens; "Open survey" while one is under way.
 *   - SurveyBanner: time, coverage and Stop & save over the view while a
 *     survey runs, then how saving went.
 *   - SurveyMapPane (its own module, SurveyMapPane.tsx): what LiveOps' map
 *     pane shows while the survey has the lidar.
 * Offered only for robots whose bridge is on schema 0.0.23 or newer.
 */

/** The More-menu entry, and the dialog it opens. Null entry: nothing to offer
 * (an older bridge, or no right to start one and none to watch). */
export function useSurveyMenu(robot: RobotState, run: RobotRunView): { entry: OverflowEntry | null; dialog: React.ReactNode } {
  const { t } = useTranslation()
  const status = useSurveyStatus(robot.robot_id)
  const operatorId = useOperatorId()
  const canConfigure = useCan('configure')
  const robots = useSiteRobots()
  const [open, setOpen] = useState(false)
  useControlHolderNames([robot.control_owner])

  if (!robotCanSurvey(robot)) return { entry: null, dialog: null }
  if (isSurveyBusy(status?.state)) {
    return {
      entry: {
        key: 'survey', label: t('survey.liveops.menuOpen'), icon: Radar, availability: { enabled: true },
        onClick: () => { window.location.hash = hashForMapSurvey(robot.site_id, robot.robot_id) },
      },
      dialog: null,
    }
  }
  if (!canConfigure) return { entry: null, dialog: null }
  const refusal = surveyStartRefusal(robot, status, run, operatorId)
  return {
    entry: {
      key: 'survey', label: t('survey.liveops.menuStart'), icon: Radar,
      availability: refusal ? { enabled: false, reason: surveyStartRefusalText(refusal, robot) } : { enabled: true },
      onClick: () => setOpen(true),
    },
    dialog: (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent style={{ background: color.elevated, border: 'none', color: color.t1, maxWidth: 560 }}>
          <DialogHeader>
            <DialogTitle>{t('survey.liveops.dialogTitle', { name: robot.name })}</DialogTitle>
            <DialogDescription style={{ color: color.t2 }}>{t('survey.start.lead')}</DialogDescription>
          </DialogHeader>
          {open && (
            <SurveyStartForm
              siteId={robot.site_id} robots={robots.length ? robots : [robot]} robotId={robot.robot_id}
              onStarted={() => setOpen(false)} onCancel={() => setOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    ),
  }
}

/**
 * The strip over LiveOps' view while the robot surveys: "Surveying · 6:12 ·
 * 142 m² covered", Open survey, Stop & save. After Stop it follows the saving
 * and ends with the draft map's link or the reason it failed, until dismissed.
 * A result from before this page was opened is not shown: survey/status is
 * retained and would otherwise announce yesterday's survey.
 */
export function SurveyBanner({ robot }: { robot: RobotState }) {
  const { t } = useTranslation()
  const status = useSurveyStatus(robot.robot_id)
  // Survey ids seen under way here, and those whose result was dismissed.
  const [seen, setSeen] = useState<Set<string>>(() => new Set())
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set())
  const id = status?.survey_id ?? null
  const busy = isSurveyBusy(status?.state)
  if (busy && id && !seen.has(id)) setSeen((s) => new Set(s).add(id))
  if (!robotCanSurvey(robot) || !status || !id) return null
  const ended = status.state === 'done' || status.state === 'failed' || status.state === 'discarded'
  if (!busy && !(ended && seen.has(id) && !dismissed.has(id))) return null

  const text = status.state === 'starting' ? t('survey.liveops.bannerStarting')
    : isSurveying(status.state) ? t('survey.liveops.bannerRecording', { time: formatClock(status.elapsed_s), area: formatArea(status.covered_m2) })
      : isFinishing(status.state) ? t('survey.liveops.bannerFinishing', { stage: t(`survey.finish.stage.${status.state as 'saving' | 'processing' | 'uploading'}`) })
        : status.state === 'done' ? t('survey.liveops.bannerDone')
          : status.state === 'failed' ? t('survey.liveops.bannerFailed', { error: status.error ?? t('survey.finish.failedUnknown') })
            : t('survey.liveops.bannerDiscarded')
  const tint = status.state === 'failed' ? color.redBg : isSurveying(status.state) ? color.redBg : color.accentDim
  const pct = isFinishing(status.state) && status.progress != null ? Math.round(status.progress * 100) : null

  return (
    <div role="status" data-survey-banner={status.state} style={{
      display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap', flexShrink: 0,
      padding: `${space[2]}px ${space[4]}px`, background: tint,
    }}>
      {isSurveying(status.state) && (
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: radius.full, background: color.red, flexShrink: 0 }} />
      )}
      <span style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1, fontVariantNumeric: 'tabular-nums', minWidth: 0 }}>
        {text}
      </span>
      {pct !== null && <span style={{ fontSize: font.size.sm, color: color.t2, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>}
      {isFindingMoved(status) && <SkipMoving robotId={robot.robot_id} surveyId={id} compact />}
      <span style={{ flex: 1 }} />
      {status.state === 'failed' && <ProcessAgain robotId={robot.robot_id} surveyId={id} />}
      {status.state === 'done' && status.map_id ? (
        <a href={hashForMapEditor(robot.site_id, status.map_id)} style={{ fontSize: font.size.sm, color: color.accent }}>
          {t('survey.liveops.openMap')}
        </a>
      ) : (
        <a href={hashForMapSurvey(robot.site_id, robot.robot_id)} style={{ fontSize: font.size.sm, color: color.accent }}>
          {t('survey.liveops.openSurvey')}
        </a>
      )}
      {isSurveying(status.state) && (
        <SurveyStopControls robotId={robot.robot_id} surveyId={id} compact disabled={status.state === 'starting'} />
      )}
      {ended && (
        <IconButton size="sm" icon={X} label={t('survey.liveops.dismiss')} onClick={() => setDismissed((s) => new Set(s).add(id))} />
      )}
    </div>
  )
}
