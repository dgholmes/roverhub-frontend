import { color, font, space } from '@/design-system/tokens'
import type { RobotState } from '@/types'
import { DiagnosticsTable } from './DiagnosticsTable'

function vec3(v: [number, number, number], unit: string): string {
  return `${v[0].toFixed(2)}, ${v[1].toFixed(2)}, ${v[2].toFixed(2)} ${unit}`
}

/** low_level.md's Motor Numbering table -- SDK-confirmed, unlike
 * jpos_leg's inferred 12-joint ordering below (16 real motors, this exact
 * grouping is documented, not guessed). */
const MOTOR_LEG_LABEL = (i: number): string => {
  if (i <= 3) return 'Front Left'
  if (i <= 7) return 'Front Right'
  if (i <= 11) return 'Rear Left'
  return 'Rear Right'
}

/**
 * Live body-motion, per-joint, and ground-reaction-force readout from the
 * SDK's get_state() call (see RobotPhysicsTelemetry) — the same data
 * sdk_playground's E5 example prints, previously dropped between
 * dobot_adapter and the frontend and shown nowhere in the UI. Undefined
 * `robot.physics` (mock robots, or a real robot before its first frame)
 * shows an honest empty state rather than fabricated values.
 *
 * `robot.lowerState` (IMU + all 16 motors, see RobotLowerState) is DDS-only
 * -- only present when the edge bridge is running with
 * LOW_LEVEL_DDS_ENABLED=true on a Jetson/Raspberry Pi wired to the robot
 * (docs/09-low-level-sdk.md). Shown as separate sections below the
 * gRPC-derived ones since it's a genuinely different data source (richer:
 * includes motor mode/temperature, neither of which gRPC exposes at all).
 */
export function LiveTelemetrySection({ robot }: { robot: RobotState }) {
  const physics = robot.physics
  const lowerState = robot.lowerState

  if (!physics && !lowerState) {
    return (
      <div style={{ color: color.t3, fontSize: font.size.sm, textAlign: 'center', padding: space[5] }}>
        No live telemetry yet — this section populates once a real telemetry frame arrives from the edge bridge.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[4] }}>
      {physics && (
        <>
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
              Leg Joints (gRPC, 12 values)
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
        </>
      )}

      {lowerState && (
        <>
          <div style={{ border: `1px solid ${color.border}`, borderRadius: 8, padding: space[3] }}>
            <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1, marginBottom: space[2] }}>
              IMU (DDS)
            </div>
            <DiagnosticsTable
              columns={['Field', 'Value']}
              rows={[
                { key: 'quat', cells: ['Quaternion (w,x,y,z)', lowerState.imu.quaternion.map((v) => v.toFixed(4)).join(', ')] },
                { key: 'gyro', cells: ['Gyroscope', vec3(lowerState.imu.gyroscope, 'rad/s')] },
                { key: 'accel', cells: ['Accelerometer', vec3(lowerState.imu.accelerometer, 'm/s²')] },
                { key: 'rpy', cells: ['RPY (roll, pitch, yaw)', vec3(lowerState.imu.rpy, 'rad')] },
              ]}
            />
          </div>

          <div style={{ border: `1px solid ${color.border}`, borderRadius: 8, padding: space[3] }}>
            <div style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1, marginBottom: 2 }}>
              Motors (DDS, 16 motors)
            </div>
            <div style={{ fontSize: font.size.xs, color: color.t3, marginBottom: space[2] }}>
              SDK-documented leg grouping (low_level.md's Motor Numbering table) — richer than the gRPC-derived joints
              above: includes motor mode and temperature, neither exposed over gRPC.
            </div>
            <DiagnosticsTable
              columns={['Motor', 'Leg', 'Mode', 'Position (rad)', 'Velocity (rad/s)', 'Torque (N·m)', 'Temp (°C)']}
              rows={lowerState.motors.map((m, i) => ({
                key: `motor-${i}`,
                cells: [
                  `${i}`, MOTOR_LEG_LABEL(i), `${m.mode}`,
                  m.q.toFixed(3), m.dq.toFixed(3), m.tau_est.toFixed(3), `${m.motor_temp}`,
                ],
              }))}
            />
          </div>
        </>
      )}
    </div>
  )
}
