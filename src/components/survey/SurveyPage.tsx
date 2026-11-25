import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeftRight, ChevronLeft } from 'lucide-react'
import { Badge, type Tone } from '@/components/kit'
import { color, font, radius, space } from '@/design-system/tokens'
import { hashForMissionsMaps, mapsSurveyFromHash } from '@/app/routes'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import { CameraFeedLayer } from '@/components/liveops/hero/CameraFeedLayer'
import { ManualControlOverlay } from '@/components/liveops/hero/ManualControlOverlay'
import { CommandAckToast } from '@/components/liveops/command/CommandAckToast'
import { CurrentTaskBar } from '@/components/liveops/mission/CurrentTaskBar'
import { operatorHoldsControl } from '@/liveops/controlOwner'
import { useRobotRun } from '@/liveops/useRobotRun'
import { useSiteRobots } from '@/org/useSiteRobots'
import { useSessionStore } from '@/store/useSessionStore'
import { isSurveyBusy, surveyPhase, type SurveyPhase } from '@/survey/surveyModel'
import { useSurveyStatuses } from '@/survey/useSurvey'
import type { RobotState } from '@/types'
import type { SurveyStatus } from '@/types/survey'
import { SurveyFinishing } from './SurveyFinishing'
import { SurveyLiveMap } from './SurveyLiveMap'
import { SurveyStartForm } from './SurveyStartForm'
import { SurveyStats } from './SurveyStats'
import { SurveyStopControls } from './SurveyStopControls'

/** The survey this page follows: started here, or found running. */
interface Watch {
  robotId: string
  /** Null when found running and its status had no id. */
  surveyId: string | null
}

/**
 * Which robot's survey the page shows, and as what. A survey under way on any
 * of the site's robots is shown (the one the address names first): nobody
 * should open this page and start a second one without seeing the first. A
 * finished one (done / failed / discarded) is shown only if this page was
 * following it, because survey/status is retained and would otherwise show
 * yesterday's result to someone about to start a new survey.
 */
export function surveyPageView(
  robots: Pick<RobotState, 'robot_id'>[], statuses: Record<string, SurveyStatus>, watch: Watch | null, preferred: string | null,
): { robotId: string | null; phase: SurveyPhase | 'pending' } {
  const busy = robots.filter((r) => isSurveyBusy(statuses[r.robot_id]?.state)).map((r) => r.robot_id)
  const robotId = watch?.robotId ?? (preferred && busy.includes(preferred) ? preferred : busy[0]) ?? null
  if (!robotId) return { robotId: null, phase: 'start' }
  const status = statuses[robotId]
  // Started here and the device has not said so yet: its retained status is still the previous survey's.
  if (watch?.surveyId && status?.survey_id !== watch.surveyId) return { robotId, phase: 'pending' }
  const phase = surveyPhase(status)
  if (phase === 'start' && watch) return { robotId, phase: 'pending' }
  return { robotId, phase }
}

const PHASE_TONE: Record<SurveyPhase | 'pending', Tone> = {
  start: 'neutral', pending: 'accent', surveying: 'red', finishing: 'accent', done: 'green', failed: 'red', discarded: 'neutral',
}

/**
 * Missions › Maps › Survey: start a survey, drive the robot while the map
 * builds, Stop & save, and follow the device turning it into a draft map that
 * opens in the editor. The drive bar and E-Stop are LiveOps' own command bar,
 * and the drive pad is LiveOps' own overlay -- the same controls, not copies.
 */
export function SurveyPage({ siteId }: { siteId: string }) {
  const { t } = useTranslation()
  const robots = useSiteRobots()
  const statuses = useSurveyStatuses(robots)
  const selectedRobotId = useSessionStore((s) => s.selectedRobotId)
  const [watch, setWatch] = useState<Watch | null>(null)
  // Which view fills the page; the other sits small at the top of the side panel.
  const [large, setLarge] = useState<'map' | 'camera'>('map')
  const preferred = mapsSurveyFromHash(window.location.hash)?.robotId ?? null
  const view = surveyPageView(robots, statuses, watch, preferred)
  const robot = robots.find((r) => r.robot_id === view.robotId) ?? null
  const status = view.robotId ? statuses[view.robotId] ?? null : null
  const { view: run } = useRobotRun(view.phase === 'start' ? null : view.robotId)

  // A survey found running is followed from then on, so its result is shown when it ends.
  useEffect(() => {
    if (!watch && view.robotId && view.phase !== 'start') setWatch({ robotId: view.robotId, surveyId: status?.survey_id ?? null })
  }, [watch, view.robotId, view.phase, status?.survey_id])

  const phaseLabel = view.phase === 'pending' ? t('survey.live.starting')
    : status?.state === 'starting' ? t('survey.live.starting')
      : view.phase === 'surveying' ? t('survey.live.recording')
        : view.phase === 'finishing' ? t('survey.finish.title')
          : view.phase === 'done' ? t('survey.finish.doneTitle')
            : view.phase === 'failed' ? t('survey.finish.failedTitle')
              : view.phase === 'discarded' ? t('survey.finish.discardedTitle') : null

  const header = (
    <div style={{
      display: 'flex', alignItems: 'center', gap: space[3], flexWrap: 'wrap',
      padding: `${space[3]}px ${space[4]}px`, background: color.surface, flexShrink: 0,
    }}>
      <a href={hashForMissionsMaps(siteId)} style={{ display: 'inline-flex', alignItems: 'center', gap: 2, color: color.t2, fontSize: font.size.sm, textDecoration: 'none' }}>
        <ChevronLeft size={16} aria-hidden />{t('survey.backToMaps')}
      </a>
      <h1 style={{ margin: 0, fontSize: font.size.xl, fontWeight: font.weight.bold, color: color.t1 }}>
        {view.phase === 'start' ? t('survey.start.title') : status?.name ?? t('survey.title')}
      </h1>
      {robot && view.phase !== 'start' && <span style={{ fontSize: font.size.md, color: color.t2 }}>{robot.name}</span>}
      {phaseLabel && <Badge tone={PHASE_TONE[view.phase]} dot>{phaseLabel}</Badge>}
    </div>
  )

  if (view.phase === 'start' || !robot) {
    return (
      <div data-survey-page="start" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {header}
        <div style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: space[6], display: 'grid', gap: space[4], alignContent: 'start' }}>
          <p style={{ margin: 0, fontSize: font.size.md, color: color.t2, lineHeight: 1.5, maxWidth: 640 }}>{t('survey.start.lead')}</p>
          <SurveyStartForm
            siteId={siteId} robots={robots} initialRobotId={preferred ?? selectedRobotId}
            onStarted={(robotId, surveyId) => setWatch({ robotId, surveyId })}
          />
        </div>
      </div>
    )
  }

  const recording = view.phase === 'surveying' || view.phase === 'pending'
  return (
    <div data-survey-page={view.phase} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      {header}
      <div style={{
        flex: 1, minHeight: 0, display: 'grid', gap: 2,
        gridTemplateColumns: 'minmax(0, 1fr) clamp(300px, 30%, 420px)', background: color.bg,
      }}>
        <div data-survey-large={large} style={{ position: 'relative', minWidth: 0, minHeight: 0, isolation: 'isolate', background: large === 'camera' ? color.videoBg : undefined }}>
          {large === 'map' ? (
            <>
              <ErrorBoundary area="survey map" variant="pane" resetKeys={[robot.robot_id]}>
                <SurveyLiveMap robotId={robot.robot_id} />
              </ErrorBoundary>
              <p style={{
                position: 'absolute', top: space[3], left: space[3], right: space[3], margin: 0, pointerEvents: 'none',
                fontSize: font.size.xs, color: color.t3, lineHeight: 1.4, maxWidth: 520,
              }}>
                {t('survey.live.frameNote')}
              </p>
            </>
          ) : (
            <>
              <CameraFeedLayer robot={robot} facing="front" fit="fit" />
              <span className="rh-video-label" style={{ position: 'absolute', top: 8, left: 8, zIndex: 880 }}>{t('survey.live.camera')}</span>
            </>
          )}
          {operatorHoldsControl(robot) && <ManualControlOverlay robot={robot} />}
          <CommandAckToast />
        </div>
        <aside style={{ minHeight: 0, overflow: 'auto', background: color.surface, padding: space[4], display: 'grid', gap: space[4], alignContent: 'start' }}>
          {/* The view that is not large. Clicking it swaps the two, as LiveOps' inset does. */}
          <div style={{ position: 'relative', aspectRatio: '16 / 9', borderRadius: radius.md, overflow: 'hidden', background: large === 'map' ? color.videoBg : color.bg }}>
            {large === 'map' ? (
              <CameraFeedLayer robot={robot} facing="front" fit="fit" />
            ) : (
              <ErrorBoundary area="survey map" variant="pane" resetKeys={[robot.robot_id]}>
                <SurveyLiveMap robotId={robot.robot_id} compact />
              </ErrorBoundary>
            )}
            <span className="rh-video-label" style={{ position: 'absolute', top: 8, left: 8, zIndex: 880, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {large === 'map' ? t('survey.live.camera') : t('survey.live.map')}
              <ArrowLeftRight size={12} strokeWidth={1.75} aria-hidden />
            </span>
            <button
              type="button" data-survey-swap
              onClick={() => setLarge((v) => (v === 'map' ? 'camera' : 'map'))}
              aria-label={large === 'map' ? t('liveops.camera.swapCamera') : t('liveops.camera.swapMap')}
              title={large === 'map' ? t('liveops.camera.swapCamera') : t('liveops.camera.swapMap')}
              style={{ position: 'absolute', inset: 0, zIndex: 890, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer' }}
            />
          </div>
          {recording ? (
            <>
              {status && view.phase === 'surveying' && <SurveyStats status={status} />}
              {robot.abstract_state === 'E_STOP' && (
                <p role="status" style={{ margin: 0, padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.md, background: color.amberBg, fontSize: font.size.sm, color: color.t1, lineHeight: 1.5 }}>
                  {t('survey.live.estopNote')}
                </p>
              )}
              {status?.survey_id && view.phase === 'surveying' && (
                <SurveyStopControls robotId={robot.robot_id} surveyId={status.survey_id} disabled={status.state === 'starting'} />
              )}
              <p style={{ margin: 0, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }}>
                {operatorHoldsControl(robot) ? t('survey.live.pauseHint') : t('survey.live.driveHint')}
              </p>
            </>
          ) : status ? (
            <SurveyFinishing status={status} siteId={siteId} onAnother={() => setWatch(null)} />
          ) : null}
        </aside>
      </div>
      {/* LiveOps' own command bar: Take control, speed, posture, and the E-Stop. */}
      <CurrentTaskBar robot={robot} run={run} siteId={siteId} />
    </div>
  )
}
