import { Thermometer } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge } from '@/components/kit'
import { hottestMotor, motorHeat, MOTOR_HOT_C, MOTOR_WARM_C, type MotorHeat } from '@/fleet/motorHeat'
import type { RobotState } from '@/types'
import { RealJointDiagnosticsSection } from '../diagnostics/RealJointDiagnosticsSection'
import { EmptyState, Note, PendingBadge, Section, SectionGrid } from './parts'

const HEAT_STYLE: Record<MotorHeat, { bg: string; border: string; text: string }> = {
  normal: { bg: color.card, border: color.border, text: color.t1 },
  warm: { bg: color.amberBg, border: color.amberBorder, text: color.amber },
  hot: { bg: color.redBg, border: color.redBorder, text: color.red },
}

/**
 * All 16 motors' temperatures from DDS lower_state (E5), the one motor reading
 * gRPC cannot give us. Motors are numbered as the SDK reports them; the SDK
 * does not document which leg each index drives, so no leg names are invented.
 */
export function MotorsTab({ robot }: { robot: RobotState }) {
  const motors = robot.lowerState?.motors
  const temps = motors?.map((m) => m.motor_temp) ?? []
  const hottest = hottestMotor(temps)

  return (
    <SectionGrid>
      <Section
        span
        title="Motor temperatures"
        aside={hottest && (
          <Badge tone={motorHeat(hottest.tempC) === 'normal' ? 'neutral' : motorHeat(hottest.tempC) === 'warm' ? 'amber' : 'red'}>
            Hottest: M{hottest.index + 1} at {Math.round(hottest.tempC)} °C
          </Badge>
        )}
      >
        {motors ? (
          <>
            <div style={{
              display: 'grid', gap: space[2],
              gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))',
            }}>
              {motors.map((m, i) => {
                const s = HEAT_STYLE[motorHeat(m.motor_temp)]
                return (
                  <div
                    key={i}
                    title={`Motor ${i + 1}: ${m.motor_temp} °C, mode ${m.mode}, torque ${m.tau_est.toFixed(2)} N·m`}
                    style={{
                      padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.md,
                      background: s.bg, border: `1px solid ${s.border}`,
                    }}
                  >
                    <div style={{ fontSize: font.size.xs, color: color.t3 }}>M{i + 1}</div>
                    <div style={{
                      fontSize: font.size.xl, fontWeight: font.weight.bold, color: s.text,
                      fontVariantNumeric: 'tabular-nums',
                    }}>
                      {Math.round(m.motor_temp)}°
                    </div>
                    <div style={{ fontSize: font.size.xs, color: color.t3, fontVariantNumeric: 'tabular-nums' }}>
                      {m.tau_est.toFixed(1)} N·m
                    </div>
                  </div>
                )
              })}
            </div>
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
        {robot.physics && robot.robot_type === 'quad'
          ? <RealJointDiagnosticsSection physics={robot.physics} />
          : (
            <EmptyState title="No joint readings yet">
              Joint position, speed and torque arrive with the robot's telemetry. Nothing has come in for this
              robot yet{robot.robot_type === 'wheel' ? ', and wheel robots don’t report a four-leg layout' : ''}.
            </EmptyState>
          )}
        <Note>Joint limits: <PendingBadge field="joint_limits" /></Note>
      </Section>
    </SectionGrid>
  )
}
