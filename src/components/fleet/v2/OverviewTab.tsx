import { useTranslation } from 'react-i18next'
import { KeyValue, Badge } from '@/components/kit'
import { color, font, space } from '@/design-system/tokens'
import { batteryLevelColor, formatBatteryPercent, formatRuntimeLeft } from '@/liveops/batteryDisplay'
import { compassLabel } from '@/liveops/waypointGeometry'
import { robotTypeLabel } from '@/lib/robotCapabilities'
import { bridgeLiveness, formatAge, schemaMatch } from '@/fleet/bridgeHealth'
import { motorHeat } from '@/fleet/motorHeat'
import { hottestLegMotor, jointDiagnosticsFromMotors } from '@/fleet/motorLayout'
import type { RobotState } from '@/types'
import { MotorLegGrid } from './MotorLegGrid'
import { JointDiagram } from '../diagnostics/JointDiagram'
import { EmptyState, Muted, PendingBadge, Section } from './parts'
import { legConfigLabelKey, legConfigOf } from '@/liveops/legConfig'

function LinkText({ ok, okLabel, badLabel }: { ok: boolean; okLabel: string; badLabel: string }) {
  return <span style={{ color: ok ? color.green : color.red }}>{ok ? okLabel : badLabel}</span>
}

/** The six overview groups: two columns of their own, beside the diagram. */
const GROUPS: React.CSSProperties = {
  display: 'grid', columnGap: space[8], rowGap: space[8], alignItems: 'start',
  gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))',
}

/** Fleet's first robot tab: one screen answering "is this robot healthy?".
 * The six groups sit on the left, set straight onto the page; the robot
 * diagram on the right shows each joint's motor temperature only — angle,
 * speed and torque stay on the Motors tab. Stacks below ~1000px. */
export function OverviewTab({ robot }: { robot: RobotState }) {
  const { t } = useTranslation()
  const b = robot.bridge
  const liveness = bridgeLiveness(b?.last_heartbeat_at)
  const bridgeColor = { live: color.green, late: color.amber, silent: color.red, unknown: color.t3 }[liveness]
  const hottest = hottestLegMotor(robot)
  const schema = schemaMatch(b?.schema_version)
  const c = robot.connectivity
  const runtime = formatRuntimeLeft(robot.battery)
  const posture = robot.posture === 'upright' ? t('fleet.overview.upright')
    : robot.posture === 'fallen' ? t('fleet.inspector.fallen') : t('common.unknown')

  return (
    <div style={{
      display: 'grid', gap: space[10], alignItems: 'start',
      gridTemplateColumns: 'repeat(auto-fit, minmax(min(460px, 100%), 1fr))',
    }}>
    <div style={GROUPS}>
      <Section title={t('fleet.overview.status')}>
        <KeyValue rows={[
          {
            label: t('fleet.overview.battery'),
            value: <span style={{ color: batteryLevelColor(robot.battery.percent) }}>{formatBatteryPercent(robot.battery.percent)}</span>,
          },
          { label: t('fleet.overview.speed'), value: `${robot.speed_mps.toFixed(1)} m/s` },
          { label: t('fleet.overview.speedLimit'), value: `${robot.speed_ratio}%` },
          { label: t('fleet.overview.heading'), value: `${Math.round(robot.position.heading_deg)}° ${compassLabel(robot.position.heading_deg)}` },
          {
            label: t('fleet.overview.posture'),
            value: robot.posture === 'fallen' ? <span style={{ color: color.red }}>{posture}</span> : posture,
          },
          { label: t('fleet.overview.legs'), value: t(legConfigLabelKey(legConfigOf(robot))) },
          { label: t('fleet.overview.avoidance'), value: robot.obstacle_avoidance ? t('fleet.overview.on') : t('common.off') },
          { label: t('fleet.overview.driver'), value: robot.control_owner ?? <Muted>{t('common.nobody')}</Muted> },
        ]} />
      </Section>

      <Section
        title={t('fleet.overview.motors')}
        aside={<span style={{ fontSize: font.size.xs, color: color.t3 }}>{robot.lowerState ? t('fleet.overview.ddsLive') : t('fleet.overview.noDds')}</span>}
      >
        {robot.lowerState ? (
          <>
            <MotorLegGrid lowerState={robot.lowerState} robotType={robot.robot_type} compact />
            {hottest && (
              <div style={{
                marginTop: 12, fontSize: font.size.sm,
                color: motorHeat(hottest.tempC) === 'hot' ? color.red : motorHeat(hottest.tempC) === 'warm' ? color.amber : color.t3,
              }}>
                {t('fleet.overview.hottest', { label: hottest.label, temp: Math.round(hottest.tempC) })}
              </div>
            )}
          </>
        ) : (
          <Muted>{t('fleet.overview.motorsNeedDds')}</Muted>
        )}
      </Section>

      <Section title={t('fleet.overview.links')}>
        <KeyValue rows={[
          {
            label: t('fleet.overview.bridge'),
            value: b
              ? <span style={{ color: bridgeColor }}>{b.bridge_id} · {formatAge(b.last_heartbeat_at)}</span>
              : <Muted>{t('fleet.overview.notRegistered')}</Muted>,
          },
          { label: t('fleet.overview.cloud'), value: <LinkText ok={c.edge_to_cloud === 'connected'} okLabel={t('common.connected')} badLabel={t('common.down')} /> },
          { label: 'gRPC', value: <LinkText ok={c.grpc === 'connected'} okLabel={t('common.connected')} badLabel={c.grpc === 'degraded' ? t('common.slow') : t('common.down')} /> },
          { label: 'DDS', value: <LinkText ok={c.dds === 'connected'} okLabel={t('common.connected')} badLabel={t('common.off')} /> },
          {
            label: t('fleet.overview.schema'),
            value: schema === 'mismatch'
              ? <Badge tone="amber">{b?.schema_version}</Badge>
              : b?.schema_version ?? <Muted>{t('common.unknown')}</Muted>,
          },
        ]} />
      </Section>

      <Section
        title={t('fleet.overview.maintenance')}
        aside={<span style={{ fontSize: font.size.xs, color: color.t3 }}>{t('fleet.overview.notStoredYet')}</span>}
      >
        <Muted>{t('fleet.overview.maintenanceBody')}</Muted>
      </Section>

      <Section title={t('fleet.overview.battery')}>
        <KeyValue rows={[
          { label: t('fleet.overview.timeLeft'), value: runtime ?? <PendingBadge field="runtime" /> },
          { label: t('fleet.overview.charging'), value: <PendingBadge field="charging" /> },
          { label: t('fleet.overview.cycles'), value: <PendingBadge field="battery_cycles" /> },
          { label: t('fleet.overview.bmsState'), value: <PendingBadge field="bms_state" /> },
        ]} />
      </Section>

      <Section title={t('fleet.overview.hardware')}>
        <KeyValue rows={[
          { label: t('fleet.overview.model'), value: `RVR-01 ${robotTypeLabel(robot.robot_type)}` },
          { label: t('fleet.overview.firmware'), value: <PendingBadge field="firmware" /> },
          { label: t('fleet.overview.serial'), value: <PendingBadge field="serial" /> },
          { label: t('fleet.overview.components'), value: <PendingBadge field="components" /> },
        ]} />
      </Section>
    </div>

    <Section title={t('fleet.overview.robot')}>
      {robot.lowerState && robot.robot_type === 'quad' ? (
        <JointDiagram joints={jointDiagnosticsFromMotors(robot.lowerState.motors)} fields={['motor_temp_c']} labelScale={2.4} />
      ) : (
        <EmptyState title={t('fleet.overview.noJointTemps')}>
          {robot.robot_type === 'wheel' ? t('fleet.overview.jointDiagramWheel') : t('fleet.overview.jointTempsNeedDds')}
        </EmptyState>
      )}
    </Section>
    </div>
  )
}
