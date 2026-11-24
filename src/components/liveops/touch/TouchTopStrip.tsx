import { useTranslation } from 'react-i18next'
import { color, font, radius, space } from '@/design-system/tokens'
import { EstimatedBadge } from '@/components/common/EstimatedBadge'
import { StaleBadge } from '@/components/common/StaleBadge'
import { StatePill } from '@/components/common/StatePill'
import { ConnectionStatus } from '@/components/shell/ConnectionStatus'
import { RobotSelector } from '@/components/shell/RobotSelector'
import { batteryLevelColor, formatBatteryPercent } from '@/liveops/batteryDisplay'
import { legConfigLabelKey, legConfigOf } from '@/liveops/legConfig'
import { compassLabel } from '@/liveops/waypointGeometry'
import type { RobotState } from '@/types'

/**
 * The touch shell's chrome at the top: one row of readings, and the robot
 * selector that scopes them (design §7.2).
 *
 * ⚠️ **One row, always.** It scrolls horizontally when it overflows and never
 * wraps to a second row: on a handheld the body height is the scarce resource,
 * and a wrapped strip takes 44 px off the map and the camera to show a reading
 * nobody asked to be taller. `TelemetryStripPane` (feed/TelemetryPanel.tsx) is
 * the desktop counterpart and wraps on purpose, which is why this is its own
 * component rather than a prop on that one.
 *
 * The composite chips -- the selector, the state pill and the link chip -- are
 * the same components the desktop bar uses, so there is one answer per reading
 * in the console rather than a touch-flavoured copy of each.
 */

/** Strip height, which is also the minimum height of every control inside it:
 * 44 px on a tablet, 40 px on a phone (design §7.2). */
export function touchStripHeight(big: boolean): number {
  return big ? 44 : 40
}

/** Shared controls hard-code a 36 px height (`commandButtonStyle`), which is
 * below a comfortable touch target. Rather than fork those components for one
 * shell, the touch chrome raises them from the outside. Scoped to the two
 * class names below, and both set `--rh-touch-target` on their own root. */
export const TOUCH_TARGET_CSS = `
.rh-touchstrip::-webkit-scrollbar,.rh-touchdeck::-webkit-scrollbar{display:none}
.rh-touchstrip button,.rh-touchdeck button{min-height:var(--rh-touch-target,44px)}
`

/** One label/value pair. `name` is what a test names when a reading goes
 * missing, and what the drive layout reads to hide a reading it covers. */
function Item({ name, label, children }: { name: string; label?: string; children: React.ReactNode }) {
  return (
    <span
      data-strip-item={name}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
        fontSize: font.size.sm, color: color.t1, whiteSpace: 'nowrap',
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {label && (
        <span style={{ color: color.t3, fontSize: font.size.xs, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
          {label}
        </span>
      )}
      {children}
    </span>
  )
}

function Divider() {
  return <span aria-hidden style={{ width: 1, height: 16, background: color.border, flexShrink: 0 }} />
}

export function TouchTopStrip({ robot, big }: { robot: RobotState; big: boolean }) {
  const { t } = useTranslation()
  const h = touchStripHeight(big)
  const heading = Math.round(robot.position.heading_deg)
  const legs = legConfigOf(robot)

  return (
    <div
      data-touch-strip=""
      className="rh-touchstrip"
      aria-label={t('liveops.telemetry.aria', { name: robot.name })}
      style={{
        // `--rh-touch-target` is read by TOUCH_TARGET_CSS above.
        ['--rh-touch-target' as string]: `${h}px`,
        height: h, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: space[3],
        padding: `0 ${space[3]}px`,
        background: color.surface, borderBottom: `1px solid ${color.border}`,
        // The whole point of this component: one row, scrolled, never wrapped.
        flexWrap: 'nowrap', overflowX: 'auto', overflowY: 'hidden',
        WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
      } as React.CSSProperties}
    >
      <style>{TOUCH_TARGET_CSS}</style>

      <Item name="robot"><RobotSelector /></Item>
      <Item name="state"><StatePill state={robot.abstract_state} sdkState={robot.sdk_state} size="sm" /></Item>
      <Divider />

      {/* `null` is unknown, not flat: gRPC carries no battery field, so a
          gRPC-only host reports it forever. formatBatteryPercent and
          batteryLevelColor own that rule -- never a bare comparison, since
          `null < 30` is `false` and paints a dead battery healthy. */}
      <Item name="battery" label={t('fleet.overview.battery')}>
        <span style={{ color: batteryLevelColor(robot.battery.percent), fontWeight: font.weight.semibold }}>
          {formatBatteryPercent(robot.battery.percent)}
        </span>
      </Item>
      <Item name="speed" label={t('fleet.overview.speed')}>{robot.speed_mps.toFixed(1)} m/s</Item>
      <Item name="heading" label={t('fleet.overview.heading')}>{heading}° {compassLabel(heading)}</Item>
      <Item name="gait" label={t('liveops.telemetry.gait')}>{robot.gait.replace(/_/g, ' ')}</Item>
      {/* 'unknown' is never a synonym for normal: a gRPC-only host has no
          joint feed and reports it permanently (schema 0.0.12). */}
      <Item name="legs" label={t('liveops.telemetry.legs')}>{t(legConfigLabelKey(legs))}</Item>
      {/* docs/05-ui-ux.md §7.1/§18.4: every position value carries its quality. */}
      <Item name="position" label={t('liveops.telemetry.position')}>
        <span>{robot.position.x_m.toFixed(1)}, {robot.position.y_m.toFixed(1)} m</span>
        {robot.position.freshness !== 'live'
          ? <StaleBadge freshness={robot.position.freshness} updatedAt={robot.position.updated_at} />
          : <EstimatedBadge compact quality={robot.position.quality} />}
      </Item>

      <Divider />
      {/* Last, and allowed to sit at the right edge on a wide tablet: the one
          connection no per-reading badge can report. */}
      <Item name="link"><ConnectionStatus robot={robot} /></Item>
      <span aria-hidden style={{ flex: 1, minWidth: space[1], borderRadius: radius.xs }} />
    </div>
  )
}
