import { useTranslation } from 'react-i18next'
import { color, font, radius, space } from '@/design-system/tokens'
import { robotCanSurvey, surveyHoldsLidar } from '@/survey/surveyModel'
import { useSurveyStatus } from '@/survey/useSurvey'
import type { RobotState } from '@/types'
import { SurveyLiveMap } from './SurveyLiveMap'

// Its own module, apart from SurveyLiveOps.tsx: LiveOps' map canvas imports
// this, and must not pull in the command store and start form with it.

/** Is this robot's survey holding the lidar? LiveOps' map pane swaps on it. */
export function useSurveyHoldsLidar(robot: RobotState): boolean {
  const status = useSurveyStatus(robot.robot_id)
  return robotCanSurvey(robot) && surveyHoldsLidar(status?.state)
}

/** LiveOps' map pane while the robot surveys: the live survey map in place of
 * the site map, and a line saying why Go to point and Set position are gone. */
export function SurveyMapPane({ robot, variant = 'full' }: { robot: RobotState; variant?: 'full' | 'mini' }) {
  const { t } = useTranslation()
  const mini = variant === 'mini'
  return (
    <div data-survey-pane style={{ position: 'relative', width: '100%', height: '100%' }}>
      <SurveyLiveMap robotId={robot.robot_id} compact={mini} />
      {!mini && (
        <div style={{
          // Top centre: the legend has the bottom-left, and the view's own
          // labels and cards the top-left.
          position: 'absolute', left: 96, right: 96, top: 8, display: 'flex', justifyContent: 'center', pointerEvents: 'none',
        }}>
          <span style={{
            padding: `${space[1]}px ${space[2]}px`, borderRadius: radius.md, background: color.overlay,
            fontSize: font.size.xs, color: color.t2, lineHeight: 1.4, textAlign: 'center', maxWidth: 420,
          }}>
            {t('survey.liveops.navOff')}
          </span>
        </div>
      )}
    </div>
  )
}

