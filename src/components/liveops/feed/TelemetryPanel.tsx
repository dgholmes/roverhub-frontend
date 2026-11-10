import { useTranslation } from 'react-i18next'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
import type { TFunction } from 'i18next'
import { color, font, space } from '@/design-system/tokens'
import { EstimatedBadge } from '@/components/common/EstimatedBadge'
import { StaleBadge } from '@/components/common/StaleBadge'
import { LastKnownBadge } from '@/components/common/LastKnownBadge'
import { RobotTypeBadge } from '@/components/common/RobotTypeBadge'
import { StatePill } from '@/components/common/StatePill'
import { KeyValue } from '@/components/kit'
import { batteryLevelColor, formatBatteryPercent, formatRuntimeLeft } from '@/liveops/batteryDisplay'
import { reachabilityOf } from '@/lib/connectivityHealth'
import { compassLabel } from '@/liveops/waypointGeometry'
import { legConfigLabelKey, legConfigOf } from '@/liveops/legConfig'
import type { RobotState } from '@/types'

/** The live vitals every LiveOps view shows, in one place, so the views can
 * differ in layout without disagreeing about content.
 *
 * Obstacle avoidance is deliberately absent: it is a toggle on the command bar
 * and an item in the status bar already, and a third copy here was one of the
 * duplicated readouts docs/05-ui-ux.md §1.4 asks LiveOps to avoid. */
function vitals(t: TFunction, robot: RobotState) {
  const heading = Math.round(robot.position.heading_deg)
  const runtime = formatRuntimeLeft(robot.battery)
  const position = (
    <>
      {robot.position.x_m.toFixed(1)}, {robot.position.y_m.toFixed(1)} m
      {/* docs/05-ui-ux.md §7.1/§18.4: every position value carries its quality. */}
      {robot.position.freshness !== 'live'
        ? <StaleBadge freshness={robot.position.freshness} updatedAt={robot.position.updated_at} />
        : <EstimatedBadge compact quality={robot.position.quality} />}
    </>
  )
  return [
    {
      label: t('fleet.overview.battery'),
      value: (
        <>
          <span style={{ color: batteryLevelColor(robot.battery.percent) }}>{formatBatteryPercent(robot.battery.percent)}</span>
          {runtime && <span style={{ color: color.t3, fontWeight: font.weight.regular }}>{runtime}</span>}
        </>
      ),
    },
    { label: t('fleet.overview.speed'), value: `${robot.speed_mps.toFixed(1)} m/s` },
    // SDK speed_ratio (10-100): the persistent cap SET_SPEED_RATIO changes,
    // distinct from the measured speed above.
    { label: t('fleet.overview.speedLimit'), value: `${robot.speed_ratio}%` },
    { label: t('fleet.overview.heading'), value: `${heading}° ${compassLabel(heading)}` },
    { label: t('liveops.telemetry.gait'), value: robot.gait.replace(/_/g, ' ') },
    // The bridge's reading of the rear knees; CHANGE_MODE itself is blind.
    { label: t('liveops.telemetry.legs'), value: t(legConfigLabelKey(legConfigOf(robot))) },
    { label: t('liveops.telemetry.position'), value: position },
  ]
}

function Identity({ robot }: { robot: RobotState }) {
  return (
    // State first: it is spec'd as the topmost element wherever a robot is
    // shown (docs/05-ui-ux.md §18.1). The last-known badge stops a powered-off
    // robot's frozen state from reading as live.
    <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap', minWidth: 0 }}>
      <StatePill state={robot.abstract_state} sdkState={robot.sdk_state} size="sm" />
      <RobotTypeBadge robotType={robot.robot_type} />
      <LastKnownBadge reachability={reachabilityOf(robot)} />
    </div>
  )
}

/** A floating card of aligned label/value rows — Map and Split views. */
function TelemetryCardPane({ robot, style }: { robot: RobotState; style?: React.CSSProperties }) {
  const { t } = useTranslation()
  return (
    <section
      aria-label={t('liveops.telemetry.aria', { name: robot.name })}
      className="rh-panel rh-panel--float"
      style={{ width: 260, padding: space[3], display: 'flex', flexDirection: 'column', gap: space[3], ...style }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: space[2] }}>
        <div style={{
          fontSize: font.size.lg, fontWeight: font.weight.semibold, color: color.t1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {robot.name}
        </div>
        <Identity robot={robot} />
      </div>
      <KeyValue rows={vitals(t, robot)} />
    </section>
  )
}

/** One horizontal instrument strip — the Camera view's top band. Wraps rather
 * than clipping when the pane is narrow. */
function TelemetryStripPane({ robot, trailing }: { robot: RobotState; trailing?: React.ReactNode }) {
  const { t } = useTranslation()
  return (
    <section
      aria-label={t('liveops.telemetry.aria', { name: robot.name })}
      style={{
        display: 'flex', alignItems: 'center', gap: space[4], flexWrap: 'wrap',
        padding: `${space[2]}px ${space[3]}px`, minHeight: 44,
      }}
    >
      <Identity robot={robot} />
      <div className="rh-strip" style={{ flexWrap: 'wrap', rowGap: space[1], flex: 1 }}>
        {vitals(t, robot).map((v) => (
          <span key={v.label} className="rh-strip__item">
            <span className="rh-strip__label">{v.label}</span>
            <span className="rh-strip__value" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{v.value}</span>
          </span>
        ))}
      </div>
      {trailing}
    </section>
  )
}

/** The telemetry card behind its own error boundary. Its fallback takes the
 * card's own position, so a fault never lands in the middle of the map. */
export function TelemetryCard(props: React.ComponentProps<typeof TelemetryCardPane>) {
  return (
    <ErrorBoundary area="telemetry card" variant="strip" fallbackStyle={props.style} resetKeys={[props.robot.robot_id]}>
      <TelemetryCardPane {...props} />
    </ErrorBoundary>
  )
}

/** The telemetry strip behind its own error boundary: a bad reading takes down
 * the strip, not the cameras or the map beside it. */
export function TelemetryStrip(props: React.ComponentProps<typeof TelemetryStripPane>) {
  return (
    <ErrorBoundary area="telemetry strip" variant="strip" resetKeys={[props.robot.robot_id]}>
      <TelemetryStripPane {...props} />
    </ErrorBoundary>
  )
}
