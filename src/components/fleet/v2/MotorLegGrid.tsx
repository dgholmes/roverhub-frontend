import { useTranslation } from 'react-i18next'
import { color, font, radius, space } from '@/design-system/tokens'
import { motorHeat, type MotorHeat } from '@/fleet/motorHeat'
import { LEG_SHORT, LEGS, legMotorLabel, motorsByLeg } from '@/fleet/motorLayout'
import type { RobotLowerState, RobotType } from '@/types'

const HEAT: Record<MotorHeat, { bg: string; border: string; text: string }> = {
  normal: { bg: color.greenBg, border: color.greenBorder, text: color.t1 },
  warm: { bg: color.amberBg, border: color.amberBorder, text: color.amber },
  hot: { bg: color.redBg, border: color.redBorder, text: color.red },
}

/**
 * Motor temperatures laid out as the robot is built: one column per leg,
 * hip → thigh → knee (→ wheel) down each column. `compact` draws bare heat
 * bars for an at-a-glance overview; `full` prints each motor's temperature
 * and torque.
 */
export function MotorLegGrid({
  lowerState, robotType, compact,
}: {
  lowerState: RobotLowerState
  robotType: RobotType
  compact?: boolean
}) {
  const { t } = useTranslation()
  const legs = motorsByLeg(lowerState.motors, robotType)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', columnGap: compact ? space[2] : space[3] }}>
      {LEGS.map((leg) => (
        <div key={leg} style={{ display: 'flex', flexDirection: 'column', gap: compact ? space[1] : space[2], minWidth: 0 }}>
          <div style={{ fontSize: font.size.xs, color: color.t3, fontWeight: font.weight.semibold }}>{LEG_SHORT[leg]}</div>
          {legs[leg].map((m) => {
            const h = HEAT[motorHeat(m.motor.motor_temp)]
            const label = t('fleetDetail.motors.motorAria', { label: legMotorLabel(m), index: m.index, temp: Math.round(m.motor.motor_temp), torque: m.motor.tau_est.toFixed(1) })
            return compact ? (
              <div
                key={m.index}
                title={label}
                aria-label={label}
                style={{ height: 12, borderRadius: 3, background: h.bg, border: `1px solid ${h.border}` }}
              />
            ) : (
              <div
                key={m.index}
                title={label}
                style={{
                  padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.sm,
                  background: h.bg, border: `1px solid ${h.border}`, minWidth: 0,
                }}
              >
                <div style={{ fontSize: font.size.xs, color: color.t3 }}>{t(`fleetDetail.jointTitle.${m.joint}`)}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: space[2], flexWrap: 'wrap' }}>
                  <span style={{ fontSize: font.size.xl, fontWeight: font.weight.bold, color: h.text, fontVariantNumeric: 'tabular-nums' }}>
                    {Math.round(m.motor.motor_temp)}°
                  </span>
                  <span style={{ fontSize: font.size.xs, color: color.t3, fontVariantNumeric: 'tabular-nums' }}>
                    {m.motor.tau_est.toFixed(1)} N·m
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
