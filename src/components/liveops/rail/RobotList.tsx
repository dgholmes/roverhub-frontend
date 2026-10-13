import { BatteryCharging } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { reachabilityOf } from '@/lib/connectivityHealth'
import { batteryLevelColor, formatBatteryPercent } from '@/liveops/batteryDisplay'
import { robotActivity, type ActivityTone } from '@/liveops/robotActivity'
import { stateVisualFor } from '@/liveops/stateDisplay'
import { robotTypeLabel } from '@/lib/robotCapabilities'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import { ROBOT_DRAG_TYPE } from '@/liveops/gridSlots'
import { useTranslation } from 'react-i18next'

const TONE_COLOR: Record<Exclude<ActivityTone, 'state'>, string> = {
  warn: color.amber, critical: color.red, muted: color.t3,
}

/**
 * Left-rail robot list. Every row has the same two lines in the same places:
 *
 *   ● Name                      78%
 *     what it is doing now
 *
 * The status dot carries the state colour; the second line says what the
 * robot is doing (mission and progress, who is driving, fallen, unreachable)
 * rather than restating the state label beside a variant chip. The variant
 * (point-/wheel-foot) moved to the row's tooltip — it is a fixed fact about
 * the hardware, not something that changes minute to minute, and the selected
 * robot's telemetry card still shows it.
 *
 * Selection stays in sync with RobotSelector (shared selectedRobotId).
 */
export function RobotList() {
  const robots = useLiveOpsStore((s) => s.robots)
  const missions = useLiveOpsStore((s) => s.missions)
  const selectedRobotId = useSessionStore((s) => s.selectedRobotId)
  const setSelectedRobot = useSessionStore((s) => s.setSelectedRobot)
  const viewMode = useSessionStore((s) => s.viewMode)
  const { t } = useTranslation()

  return (
    <div role="list" style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      {robots.map((r) => {
        const isSelected = r.robot_id === selectedRobotId
        const v = stateVisualFor(r.abstract_state, r.sdk_state)
        const online = reachabilityOf(r) === 'online'
        const activity = robotActivity(r, missions[r.robot_id])
        const activityColor = activity.tone === 'state' ? color.t2 : TONE_COLOR[activity.tone]
        return (
          <button
            key={r.robot_id}
            role="listitem"
            onClick={() => setSelectedRobot(r.robot_id)}
            aria-current={isSelected ? 'true' : undefined}
            // Rows are what the 2×2 grid's slots accept.
            draggable
            onDragStart={(e) => { e.dataTransfer.setData(ROBOT_DRAG_TYPE, r.robot_id); e.dataTransfer.effectAllowed = 'move' }}
            title={viewMode === 'grid'
              ? t('grid.dragRobot')
              : `${r.name} · ${v.label} · ${robotTypeLabel(r.robot_type)}`}
            style={{
              display: 'grid', gridTemplateColumns: '8px 1fr auto', columnGap: space[2] + 2, rowGap: 2,
              alignItems: 'center', width: '100%', textAlign: 'left',
              padding: `${space[2]}px ${space[2] + 2}px`, borderRadius: radius.sm + 1,
              background: isSelected ? color.selected : 'transparent',
              border: 'none', fontFamily: font.family, cursor: 'pointer',
            }}
          >
            <span aria-hidden style={{
              width: 8, height: 8, borderRadius: radius.full,
              // Hollow when offline: the colour would be a last-known state.
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
              display: 'inline-flex', alignItems: 'center', gap: 3,
              fontSize: font.size.sm, fontWeight: font.weight.medium, fontVariantNumeric: 'tabular-nums',
              // Plain text when healthy; only a low battery earns colour.
              color: batteryLevelColor(r.battery.percent) === color.t1 ? color.t2 : batteryLevelColor(r.battery.percent),
            }}>
              {r.battery.charging && <BatteryCharging size={13} strokeWidth={1.75} aria-label={t('fleet.overview.charging')} />}
              {formatBatteryPercent(r.battery.percent)}
            </span>
            <span style={{
              gridColumn: '2 / 4', fontSize: font.size.sm, color: activityColor,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {activity.text}
            </span>
          </button>
        )
      })}
    </div>
  )
}
