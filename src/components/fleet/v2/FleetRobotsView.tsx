import { color, font, radius, space } from '@/design-system/tokens'
import { reachabilityOf } from '@/lib/connectivityHealth'
import { batteryLevelColor, formatBatteryPercent } from '@/liveops/batteryDisplay'
import { fleetSortPriority, getFleetReadiness } from '@/liveops/fleetReadiness'
import { stateVisualFor } from '@/liveops/stateDisplay'
import { hottestMotor, motorHeat } from '@/fleet/motorHeat'
import type { RobotState } from '@/types'
import { RobotInspector } from './RobotInspector'
import { EmptyState } from './parts'

/** The one line under a robot's name: the most important thing to know. */
function attentionLine(r: RobotState): { text: string; tone: string } {
  if (r.posture === 'fallen') return { text: 'Fallen', tone: color.red }
  if (r.abstract_state === 'E_STOP') return { text: 'E-Stop engaged', tone: color.red }
  if (r.abstract_state === 'FAULT') return { text: 'Fault', tone: color.red }
  if (reachabilityOf(r) !== 'online') return { text: 'Unreachable', tone: color.amber }
  const hot = hottestMotor(r.lowerState?.motors.map((m) => m.motor_temp) ?? [])
  if (hot && motorHeat(hot.tempC) !== 'normal') {
    return { text: `Motor ${hot.index + 1} at ${Math.round(hot.tempC)} °C`, tone: motorHeat(hot.tempC) === 'hot' ? color.red : color.amber }
  }
  const readiness = getFleetReadiness(r)
  if (!readiness.ready) return { text: readiness.failing[0] ?? 'Not ready', tone: color.t2 }
  return { text: 'Ready', tone: color.t3 }
}

/**
 * Layout A: an attention-sorted roster beside a full-height inspector, the
 * same shape as LiveOps' rail and stage. Robots that need a look sort first.
 */
export function FleetRobotsView({
  robots, selectedRobotId, onSelect, onOpenBridge,
}: {
  robots: RobotState[]
  selectedRobotId: string | null
  onSelect: (robotId: string) => void
  onOpenBridge: (robotId: string) => void
}) {
  const sorted = [...robots].sort((a, b) => fleetSortPriority(a) - fleetSortPriority(b))
  const selected = robots.find((r) => r.robot_id === selectedRobotId) ?? sorted[0]

  return (
    <div style={{ flex: 1, display: 'flex', minHeight: 0, minWidth: 0 }}>
      <aside style={{
        width: 280, flexShrink: 0, borderRight: `1px solid ${color.border}`, background: color.surface,
        display: 'flex', flexDirection: 'column', minHeight: 0,
      }}>
        <div style={{
          padding: `${space[3]}px ${space[4]}px ${space[2]}px`, fontSize: font.size.sm,
          color: color.t3, fontWeight: font.weight.semibold,
        }}>
          {robots.length} {robots.length === 1 ? 'robot' : 'robots'} · needs attention first
        </div>
        <div role="list" style={{ flex: 1, overflowY: 'auto', padding: `0 ${space[2]}px ${space[3]}px`, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {sorted.map((r) => {
            const v = stateVisualFor(r.abstract_state, r.sdk_state)
            const online = reachabilityOf(r) === 'online'
            const line = attentionLine(r)
            const isSelected = r.robot_id === selected?.robot_id
            return (
              <button
                key={r.robot_id}
                role="listitem"
                aria-current={isSelected ? 'true' : undefined}
                onClick={() => onSelect(r.robot_id)}
                style={{
                  display: 'grid', gridTemplateColumns: '8px 1fr auto', columnGap: space[3], rowGap: 2,
                  alignItems: 'center', width: '100%', textAlign: 'left',
                  padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.sm + 1,
                  background: isSelected ? color.selected : 'transparent',
                  border: 'none', fontFamily: font.family, cursor: 'pointer',
                }}
              >
                <span aria-hidden title={v.label} style={{
                  width: 8, height: 8, borderRadius: radius.full,
                  background: online ? v.color : 'transparent',
                  border: online ? 'none' : `1.5px solid ${color.t3}`,
                }} />
                <span style={{
                  fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {r.name}
                </span>
                <span style={{
                  fontSize: font.size.sm, fontVariantNumeric: 'tabular-nums',
                  color: batteryLevelColor(r.battery.percent) === color.t1 ? color.t2 : batteryLevelColor(r.battery.percent),
                }}>
                  {formatBatteryPercent(r.battery.percent)}
                </span>
                <span style={{
                  gridColumn: '2 / 4', fontSize: font.size.sm, color: line.tone,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {v.label} · {line.text}
                </span>
              </button>
            )
          })}
        </div>
      </aside>
      {selected
        ? <RobotInspector robot={selected} onOpenBridge={() => onOpenBridge(selected.robot_id)} />
        : (
          <div style={{ flex: 1, padding: space[6] }}>
            <EmptyState title="No robots yet">
              Robots appear here as soon as their edge bridge registers with the cloud.
            </EmptyState>
          </div>
        )}
    </div>
  )
}
