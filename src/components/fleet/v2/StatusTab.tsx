import { KeyValue, Badge } from '@/components/kit'
import { formatBatteryPercent, formatRuntimeLeft, batteryLevelColor } from '@/liveops/batteryDisplay'
import { stateVisualFor } from '@/liveops/stateDisplay'
import { compassLabel } from '@/liveops/waypointGeometry'
import { robotTypeLabel } from '@/lib/robotCapabilities'
import { getFleetReadiness } from '@/liveops/fleetReadiness'
import type { RobotState } from '@/types'
import { Muted, Note, PendingBadge, Section, SectionGrid } from './parts'

const deg = (rad: number) => `${((rad * 180) / Math.PI).toFixed(1)}°`

const POSTURE_LABEL: Record<RobotState['posture'], string> = {
  upright: 'Upright', fallen: 'Fallen', unknown: 'Unknown',
}

/** Everything the robot reports right now, plus the hardware facts we have
 * asked Dobot for. Pending values stay visible with the question number
 * instead of being removed or filled with sample data. */
export function StatusTab({ robot }: { robot: RobotState }) {
  const v = stateVisualFor(robot.abstract_state, robot.sdk_state)
  const readiness = getFleetReadiness(robot)
  const runtime = formatRuntimeLeft(robot.battery)
  const rpy = robot.lowerState?.imu.rpy ?? robot.physics?.ori_body

  return (
    <SectionGrid>
      <Section title="Now">
        <KeyValue rows={[
          { label: 'State', value: <span style={{ color: v.color }}>{v.label}</span> },
          {
            label: 'Posture',
            value: robot.posture === 'fallen'
              ? <Badge tone="red" dot>Fallen</Badge>
              : POSTURE_LABEL[robot.posture],
          },
          { label: 'Ready for a mission', value: readiness.ready ? 'Yes' : <span title={readiness.failing.join('; ')}>No</span> },
          { label: 'Driver', value: robot.control_owner ?? <Muted>Nobody</Muted> },
          { label: 'Gait', value: robot.gait.replace(/_/g, ' ') },
          { label: 'Speed', value: `${robot.speed_mps.toFixed(2)} m/s` },
          { label: 'Speed limit', value: `${robot.speed_ratio}%` },
          { label: 'Obstacle avoidance', value: robot.obstacle_avoidance ? 'On' : 'Off' },
        ]} />
        {!readiness.ready && <Note>Not ready: {readiness.failing.join('; ')}.</Note>}
      </Section>

      <Section title="Battery">
        <KeyValue rows={[
          {
            label: 'Charge',
            value: <span style={{ color: batteryLevelColor(robot.battery.percent) }}>{formatBatteryPercent(robot.battery.percent)}</span>,
          },
          { label: 'Time left', value: runtime ?? <PendingBadge field="runtime" /> },
          { label: 'Charging', value: <PendingBadge field="charging" /> },
          { label: 'Cycles', value: <PendingBadge field="battery_cycles" /> },
          { label: 'BMS state', value: <PendingBadge field="bms_state" /> },
        ]} />
        {robot.battery.percent === null && (
          <Note>No reading. Charge only comes from DDS, so a bridge without low-level telemetry never knows it.</Note>
        )}
      </Section>

      <Section title="Position">
        <KeyValue rows={[
          { label: 'X, Y', value: `${robot.position.x_m.toFixed(1)}, ${robot.position.y_m.toFixed(1)} m` },
          {
            label: 'Heading',
            value: `${Math.round(robot.position.heading_deg)}° ${compassLabel(robot.position.heading_deg)}`,
          },
          { label: 'Source', value: robot.position.provider === 'dead_reckoning' ? 'Odometry' : robot.position.provider.toUpperCase() },
          { label: 'Trust', value: robot.position.quality === 'estimated' ? 'Estimated' : robot.position.quality === 'localized' ? 'Localized' : 'Lost' },
        ]} />
      </Section>

      <Section title="Body angle">
        {rpy ? (
          <KeyValue rows={[
            { label: 'Roll', value: deg(rpy[0]) },
            { label: 'Pitch', value: deg(rpy[1]) },
            { label: 'Yaw', value: deg(rpy[2]) },
            { label: 'Source', value: robot.lowerState ? 'IMU (DDS)' : 'Body estimate (gRPC)' },
          ]} />
        ) : (
          <Muted>No telemetry from this robot yet.</Muted>
        )}
      </Section>

      <Section title="Hardware">
        <KeyValue rows={[
          { label: 'Model', value: `RVR-01 ${robotTypeLabel(robot.robot_type)}` },
          { label: 'Robot address', value: robot.ip_address ?? <Muted>Not registered</Muted> },
          { label: 'Firmware', value: <PendingBadge field="firmware" /> },
          { label: 'Serial number', value: <PendingBadge field="serial" /> },
          { label: 'Component versions', value: <PendingBadge field="components" /> },
        ]} />
      </Section>
    </SectionGrid>
  )
}
