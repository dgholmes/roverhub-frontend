import { useTranslation } from 'react-i18next'
import { Thermometer } from 'lucide-react'
import { Badge } from '@/components/kit'
import { motorHeat, MOTOR_HOT_C, MOTOR_WARM_C } from '@/fleet/motorHeat'
import { hottestLegMotor, jointDiagnosticsFromMotors } from '@/fleet/motorLayout'
import type { RobotState } from '@/types'
import { JointDiagram } from '../diagnostics/JointDiagram'
import { RealJointDiagnosticsSection } from '../diagnostics/RealJointDiagnosticsSection'
import { MotorLegGrid } from './MotorLegGrid'
import { EmptyState, Muted, Note, PendingBadge, Section, SectionGrid } from './parts'

/**
 * Motor health from DDS lower_state (E5): temperatures by leg, and the joint
 * diagram with each joint's angle, speed, torque and temperature. DDS has the
 * SDK-documented motor-to-leg layout, so this needs no inferred ordering; the
 * gRPC joint table below it is the fallback for bridges without DDS.
 */
export function MotorsTab({ robot }: { robot: RobotState }) {
  const { t } = useTranslation()
  const lower = robot.lowerState
  const hottest = hottestLegMotor(robot)
  const heat = hottest ? motorHeat(hottest.tempC) : 'normal'

  return (
    <SectionGrid>
      <Section
        span
        title={t('fleetDetail.motors.temperatures')}
        aside={hottest && (
          <Badge tone={heat === 'normal' ? 'neutral' : heat === 'warm' ? 'amber' : 'red'}>
            {t('fleetDetail.motors.hottest', { label: hottest.label, temp: Math.round(hottest.tempC) })}
          </Badge>
        )}
      >
        {lower ? (
          <>
            <MotorLegGrid lowerState={lower} robotType={robot.robot_type} />
            <Note>
              {t('fleetDetail.motors.bandsNote', { warm: MOTOR_WARM_C, hot: MOTOR_HOT_C })} <PendingBadge field="motor_temp_limits" />
            </Note>
          </>
        ) : (
          <EmptyState title={t('fleetDetail.motors.noTempsTitle')} icon={Thermometer}>
            {t('fleetDetail.motors.noTempsBody')}
          </EmptyState>
        )}
      </Section>

      <Section span title={t('fleetDetail.motors.joints')}>
        {lower && robot.robot_type === 'quad' ? (
          <JointDiagram joints={jointDiagnosticsFromMotors(lower.motors)} />
        ) : robot.physics && robot.robot_type === 'quad' ? (
          <RealJointDiagnosticsSection physics={robot.physics} />
        ) : (
          <EmptyState title={t('fleetDetail.motors.noJointsTitle')}>
            {robot.robot_type === 'wheel' ? t('fleetDetail.motors.noJointsBodyWheel') : t('fleetDetail.motors.noJointsBody')}
          </EmptyState>
        )}
        <Note>
          {lower ? <Muted>{t('fleetDetail.motors.fromDds')}</Muted> : null}
          {t('fleetDetail.motors.jointLimits')} <PendingBadge field="joint_limits" />
        </Note>
      </Section>
    </SectionGrid>
  )
}
