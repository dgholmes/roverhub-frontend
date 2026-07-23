import { color, space } from '@/design-system/tokens'
import { legLabel } from '@/mocks/mockDiagnostics'
import type { JointErrorFlag, MotorDiagnostics } from '@/types'
import { DiagnosticsTable } from './DiagnosticsTable'
import { JointDiagram } from './JointDiagram'

const ERROR_COLOR: Record<JointErrorFlag, string> = {
  normal: color.green, warning: color.amber, fault: color.red,
}

/** Position/velocity/torque/temp/error per joint — SDK-confirmed fields
 * (motor.q()/dq()/tau_est()/motor_temp()), not the reference app's fuller
 * Position/MCU Temp/MOS Temp/Motor Temp/Error Flag split (see
 * types/diagnostics.ts header for why). The illustrated diagram mirrors the
 * reference app's callout layout; the table below it is the precise,
 * sortable-by-eye readout of the same data. */
export function JointDiagnosticsSection({ joints }: { joints: MotorDiagnostics[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <JointDiagram joints={joints} />
      <DiagnosticsTable
        columns={['Joint', 'Position', 'Velocity', 'Torque', 'Motor Temp', 'Error Flag']}
        rows={joints.map((j) => ({
          key: j.joint_id,
          cells: [
            `${legLabel(j.leg)} · ${j.joint_name[0].toUpperCase()}${j.joint_name.slice(1)}`,
            `${j.position_deg.toFixed(1)}°`,
            `${j.velocity_dps.toFixed(1)}°/s`,
            `${j.torque_nm.toFixed(1)} N·m`,
            j.motor_temp_c != null ? `${j.motor_temp_c}°C` : '—',
            j.error_flag != null ? (
              <span key="flag" style={{ color: ERROR_COLOR[j.error_flag], fontWeight: 600, textTransform: 'capitalize' }}>
                {j.error_flag}
              </span>
            ) : '—',
          ],
        }))}
      />
    </div>
  )
}
