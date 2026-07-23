import { color, font, space } from '@/design-system/tokens'
import type { RobotState } from '@/types'
import { DiagnosticsTable } from './DiagnosticsTable'

function vec3(v: [number, number, number], unit: string): string {
  return `${v[0].toFixed(2)}, ${v[1].toFixed(2)}, ${v[2].toFixed(2)} ${unit}`
}

/**
 * Live body-motion, per-joint, and ground-reaction-force readout from the
 * SDK's get_state() call (see RobotPhysicsTelemetry) — the same data
 * sdk_playground's E5 example prints, previously dropped between
 * dobot_adapter and the frontend and shown nowhere in the UI. Undefined
 * `robot.physics` (mock robots, or a real robot before its first frame)
 * shows an honest empty state rather than fabricated values.
 */
export function LiveTelemetrySection({ robot }: { robot: RobotState }) {
  const physics = robot.physics

  if (!physics) {
    return (
      <div style={{ color: color.t3, fontSize: font.size.sm, textAlign: 'center', padding: space[5] }}>
        No live telemetry yet — this section populates once a real telemetry frame arrives from the edge bridge.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      <div style={{ border: `1px solid ${color.border}`, borderRadius: 8, padding: space[3] }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1, marginBottom: space[2] }}>
          Body Motion
        </div>
        <DiagnosticsTable
          columns={['Field', 'Value']}
          rows={[
            { key: 'pos', cells: ['Position (x, y, z)', vec3(robot.position ? [robot.position.x_m, robot.position.y_m, 0] : [0, 0, 0], 'm')] },
            { key: 'acc', cells: ['Acceleration', vec3(physics.acc_body, 'm/s²')] },
            { key: 'omega', cells: ['Angular velocity', vec3(physics.omega_body, 'rad/s')] },
            { key: 'ori', cells: ['Orientation (roll, pitch, yaw)', vec3(physics.ori_body, 'rad')] },
          ]}
        />
      </div>

      <div style={{ border: `1px solid ${color.border}`, borderRadius: 8, padding: space[3] }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1, marginBottom: space[2] }}>
          Ground Reaction Force
        </div>
        <DiagnosticsTable
          columns={['Foot', 'Force (N)']}
          rows={[
            { key: 'grf-left', cells: ['Left', vec3(physics.grf_left, 'N')] },
            { key: 'grf-right', cells: ['Right', vec3(physics.grf_right, 'N')] },
          ]}
        />
      </div>

      <div style={{ border: `1px solid ${color.border}`, borderRadius: 8, padding: space[3] }}>
        <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1, marginBottom: 2 }}>
          Leg Joints
        </div>
        <div style={{ fontSize: font.size.xs, color: color.t3, marginBottom: space[2] }}>
          Raw SDK order — the vendored SDK docs don't publish a per-leg/joint index mapping, so joints are shown by
          index rather than a guessed leg/joint name.
        </div>
        <DiagnosticsTable
          columns={['Joint', 'Position (rad)', 'Velocity (rad/s)', 'Torque (N·m)']}
          rows={physics.jpos_leg.map((pos, i) => ({
            key: `joint-${i}`,
            cells: [
              `Joint ${i}`,
              pos.toFixed(2),
              (physics.jvel_leg[i] ?? 0).toFixed(2),
              (physics.jtau_leg[i] ?? 0).toFixed(2),
            ],
          }))}
        />
      </div>
    </div>
  )
}
