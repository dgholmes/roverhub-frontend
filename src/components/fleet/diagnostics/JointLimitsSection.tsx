import { legLabel } from '@/mocks/mockDiagnostics'
import type { JointLimit } from '@/types'
import { DiagnosticsTable } from './DiagnosticsTable'

export function JointLimitsSection({ limits }: { limits: JointLimit[] }) {
  return (
    <DiagnosticsTable
      columns={['Joint', 'Position (°)', 'Torque (N·m)', 'Speed (°/s)', 'KP', 'KD']}
      rows={limits.map((l) => ({
        key: l.joint_id,
        cells: [
          `${legLabel(l.leg)} · ${l.joint_name[0].toUpperCase()}${l.joint_name.slice(1)}`,
          `${l.position_range_deg[0]}, ${l.position_range_deg[1]}`,
          `${l.torque_range_nm[0]}, ${l.torque_range_nm[1]}`,
          `${l.speed_range_dps[0]}, ${l.speed_range_dps[1]}`,
          l.kp,
          l.kd,
        ],
      }))}
    />
  )
}
