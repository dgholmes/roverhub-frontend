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
  const lower = robot.lowerState
  const hottest = hottestLegMotor(robot)
  const heat = hottest ? motorHeat(hottest.tempC) : 'normal'

  return (
    <SectionGrid>
      <Section
        span
        title="Motor temperatures"
        aside={hottest && (
          <Badge tone={heat === 'normal' ? 'neutral' : heat === 'warm' ? 'amber' : 'red'}>
            Hottest: {hottest.label} at {Math.round(hottest.tempC)} °C
          </Badge>
        )}
      >
        {lower ? (
          <>
            <MotorLegGrid lowerState={lower} robotType={robot.robot_type} />
            <Note>
              Amber from {MOTOR_WARM_C} °C, red from {MOTOR_HOT_C} °C. These bands are ours, chosen to make a
              hot motor stand out; Dobot hasn't said where the real limits are. <PendingBadge field="motor_temp_limits" />
            </Note>
          </>
        ) : (
          <EmptyState title="No motor temperatures from this robot" icon={Thermometer}>
            Motor temperatures only come over DDS. Turn on low-level telemetry
            (LOW_LEVEL_DDS_ENABLED=true) on a bridge that's cabled to the robot.
          </EmptyState>
        )}
      </Section>

      <Section span title="Joints">
        {lower && robot.robot_type === 'quad' ? (
          <JointDiagram joints={jointDiagnosticsFromMotors(lower.motors)} />
        ) : robot.physics && robot.robot_type === 'quad' ? (
          <RealJointDiagnosticsSection physics={robot.physics} />
        ) : (
          <EmptyState title="No joint readings yet">
            Joint angle, speed and torque arrive with the robot's telemetry. Nothing has come in for this
            robot yet{robot.robot_type === 'wheel' ? ', and wheel robots don’t report a four-leg layout' : ''}.
          </EmptyState>
        )}
        <Note>
          {lower ? <Muted>From DDS motor state. </Muted> : null}
          Joint limits: <PendingBadge field="joint_limits" />
        </Note>
      </Section>
    </SectionGrid>
  )
}
