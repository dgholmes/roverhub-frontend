import { KeyValue, Badge } from '@/components/kit'
import { color, font } from '@/design-system/tokens'
import { batteryLevelColor, formatBatteryPercent, formatRuntimeLeft } from '@/liveops/batteryDisplay'
import { compassLabel } from '@/liveops/waypointGeometry'
import { robotTypeLabel } from '@/lib/robotCapabilities'
import { bridgeLiveness, formatAge, schemaMatch } from '@/fleet/bridgeHealth'
import { motorHeat } from '@/fleet/motorHeat'
import type { RobotState } from '@/types'
import { hottestLegMotor } from './MotorsTab'
import { MotorLegGrid } from './MotorLegGrid'
import { JointDiagram } from '../diagnostics/JointDiagram'
import { jointDiagnosticsFromMotors } from '@/fleet/motorLayout'
import { space } from '@/design-system/tokens'
import { EmptyState, Muted, PendingBadge, Section } from './parts'

const POSTURE: Record<RobotState['posture'], string> = { upright: 'Upright', fallen: 'Fallen', unknown: 'Unknown' }

function linkText(ok: boolean, okLabel = 'Connected', badLabel = 'Down') {
  return <span style={{ color: ok ? color.green : color.red }}>{ok ? okLabel : badLabel}</span>
}

/** The six overview groups: two columns of their own, beside the diagram. */
const GROUPS: React.CSSProperties = {
  display: 'grid', columnGap: space[8], rowGap: space[8], alignItems: 'start',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))',
}

/** Sheet layout's first tab: one screen answering "is this robot healthy?".
 * The six groups sit on the left, set straight onto the page; the robot
 * diagram on the right shows each joint's motor temperature only — angle,
 * speed and torque stay on the Motors tab. Stacks below ~1000px. */
export function OverviewTab({ robot }: { robot: RobotState }) {
  const b = robot.bridge
  const liveness = bridgeLiveness(b?.last_heartbeat_at)
  const bridgeColor = { live: color.green, late: color.amber, silent: color.red, unknown: color.t3 }[liveness]
  const hottest = hottestLegMotor(robot)
  const schema = schemaMatch(b?.schema_version)
  const c = robot.connectivity
  const runtime = formatRuntimeLeft(robot.battery)

  return (
    <div style={{
      display: 'grid', gap: space[10], alignItems: 'start',
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(460px, 100%), 1fr))',
    }}>
    <div style={GROUPS}>
      <Section title="Status">
        <KeyValue rows={[
          {
            label: 'Battery',
            value: <span style={{ color: batteryLevelColor(robot.battery.percent) }}>{formatBatteryPercent(robot.battery.percent)}</span>,
          },
          { label: 'Speed', value: `${robot.speed_mps.toFixed(1)} m/s` },
          { label: 'Speed limit', value: `${robot.speed_ratio}%` },
          { label: 'Heading', value: `${Math.round(robot.position.heading_deg)}° ${compassLabel(robot.position.heading_deg)}` },
          {
            label: 'Posture',
            value: robot.posture === 'fallen' ? <span style={{ color: color.red }}>Fallen</span> : POSTURE[robot.posture],
          },
          { label: 'Avoidance', value: robot.obstacle_avoidance ? 'On' : 'Off' },
          { label: 'Driver', value: robot.control_owner ?? <Muted>Nobody</Muted> },
        ]} />
      </Section>

      <Section
        title="Motors"
        aside={<span style={{ fontSize: font.size.xs, color: color.t3 }}>{robot.lowerState ? 'DDS · live' : 'No DDS'}</span>}
      >
        {robot.lowerState ? (
          <>
            <MotorLegGrid lowerState={robot.lowerState} robotType={robot.robot_type} compact />
            {hottest && (
              <div style={{
                marginTop: 12, fontSize: font.size.sm,
                color: motorHeat(hottest.tempC) === 'hot' ? color.red : motorHeat(hottest.tempC) === 'warm' ? color.amber : color.t3,
              }}>
                Hottest: {hottest.label} {Math.round(hottest.tempC)} °C
              </div>
            )}
          </>
        ) : (
          <Muted>Motor temperatures need a bridge with low-level telemetry on.</Muted>
        )}
      </Section>

      <Section title="Links">
        <KeyValue rows={[
          {
            label: 'Bridge',
            value: b
              ? <span style={{ color: bridgeColor }}>{b.bridge_id} · {formatAge(b.last_heartbeat_at)}</span>
              : <Muted>Not registered</Muted>,
          },
          { label: 'Cloud', value: linkText(c.edge_to_cloud === 'connected') },
          { label: 'gRPC', value: linkText(c.grpc === 'connected', 'Connected', c.grpc === 'degraded' ? 'Slow' : 'Down') },
          { label: 'DDS', value: linkText(c.dds === 'connected', 'Connected', 'Off') },
          {
            label: 'Schema',
            value: schema === 'mismatch'
              ? <Badge tone="amber">{b?.schema_version}</Badge>
              : b?.schema_version ?? <Muted>Unknown</Muted>,
          },
        ]} />
      </Section>

      <Section
        title="Maintenance"
        aside={<span style={{ fontSize: font.size.xs, color: color.t3 }}>not stored yet</span>}
      >
        <Muted>Log and flags arrive with the database.</Muted>
      </Section>

      <Section title="Battery">
        <KeyValue rows={[
          { label: 'Time left', value: runtime ?? <PendingBadge field="runtime" /> },
          { label: 'Charging', value: <PendingBadge field="charging" /> },
          { label: 'Cycles', value: <PendingBadge field="battery_cycles" /> },
          { label: 'BMS state', value: <PendingBadge field="bms_state" /> },
        ]} />
      </Section>

      <Section title="Hardware">
        <KeyValue rows={[
          { label: 'Model', value: `RVR-01 ${robotTypeLabel(robot.robot_type)}` },
          { label: 'Firmware', value: <PendingBadge field="firmware" /> },
          { label: 'Serial number', value: <PendingBadge field="serial" /> },
          { label: 'Components', value: <PendingBadge field="components" /> },
        ]} />
      </Section>
    </div>

    <Section title="Robot">
      {robot.lowerState && robot.robot_type === 'quad' ? (
        <JointDiagram joints={jointDiagnosticsFromMotors(robot.lowerState.motors)} fields={['motor_temp_c']} labelScale={2.4} />
      ) : (
        <EmptyState title="No joint temperatures">
          {robot.robot_type === 'wheel'
            ? 'The joint diagram is drawn for point-foot robots.'
            : 'Joint temperatures need a bridge with low-level telemetry (DDS) on.'}
        </EmptyState>
      )}
    </Section>
    </div>
  )
}
