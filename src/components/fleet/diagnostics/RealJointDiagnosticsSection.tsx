import { useTranslation } from 'react-i18next'
import { color, font, radius, space } from '@/design-system/tokens'
import { jointDiagnosticsFromPhysics } from '@/liveops/jointDiagramMapping'
import { jointTitle, legLabel } from '@/fleet/motorLayout'
import type { RobotPhysicsTelemetry } from '@/types'
import { DiagnosticsTable } from './DiagnosticsTable'
import { JointDiagram } from './JointDiagram'

/**
 * Real-telemetry counterpart to JointDiagnosticsSection — same illustrated
 * diagram, but fed from the robot's actual jpos_leg/jvel_leg/jtau_leg
 * instead of mock per-motor data. Only Position/Velocity/Torque are
 * selectable (motor_temp_c/error_flag don't exist over gRPC), and the
 * leg/joint ordering is an inferred convention, not SDK-confirmed — flagged
 * explicitly rather than presented as ground truth.
 */
export function RealJointDiagnosticsSection({ physics }: { physics: RobotPhysicsTelemetry }) {
  const { t } = useTranslation()
  const joints = jointDiagnosticsFromPhysics(physics)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: space[2], padding: `${space[2]}px ${space[3]}px`,
        background: color.amberBg, border: `1px solid ${color.amberBorder}`, borderRadius: radius.sm,
        fontSize: font.size.xs, color: color.t2,
      }}>
        {t('fleetDetail.diag.inferredNote')}
      </div>
      <JointDiagram joints={joints} fields={['position_deg', 'velocity_dps', 'torque_nm']} />
      <DiagnosticsTable
        columns={[t('fleetDetail.diag.joint'), t('fleetDetail.diag.position'), t('fleetDetail.diag.velocity'), t('fleetDetail.diag.torque')]}
        rows={joints.map((j) => ({
          key: j.joint_id,
          cells: [
            `${legLabel(j.leg)} · ${jointTitle(j.joint_name as Parameters<typeof jointTitle>[0])}`,
            `${j.position_deg.toFixed(1)}°`,
            `${j.velocity_dps.toFixed(1)}°/s`,
            `${j.torque_nm.toFixed(1)} N·m`,
          ],
        }))}
      />
    </div>
  )
}
