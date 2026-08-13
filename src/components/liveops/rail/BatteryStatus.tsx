import { BatteryCharging } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { batteryBarWidth, batteryLevelColor, formatBatteryPercent } from '@/liveops/batteryDisplay'
import type { RobotBattery } from '@/types'

// batteryLevelColor moved to @/liveops/batteryDisplay so the display rule for an
// unknown (null) battery is unit-testable -- the frontend test environment is
// `node`, with no component renderer. Re-exported here because several
// components already import it from this path.
export { batteryLevelColor }

function runtimeLabel(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function BatteryStatus({ battery }: { battery: RobotBattery }) {
  const barColor = batteryLevelColor(battery.percent)
  const unknown = battery.percent === null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] + 2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {battery.charging && <BatteryCharging size={12} color={color.accent} strokeWidth={2} />}
          <span style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: unknown ? color.t3 : color.t1 }}>
            {formatBatteryPercent(battery.percent)}
          </span>
        </div>
        {/* No runtime estimate without a level to estimate from -- printing
            "0m left" next to an unknown battery would be a fabricated claim. */}
        <span style={{ fontSize: font.size.sm, color: color.t3 }}>
          {unknown ? 'No battery reading' : `${runtimeLabel(battery.est_runtime_min)} left`}
        </span>
      </div>
      <div style={{ height: 4, background: color.border, borderRadius: radius.full, overflow: 'hidden' }}>
        <div style={{ width: batteryBarWidth(battery.percent), height: '100%', background: barColor, borderRadius: radius.full }} />
      </div>
    </div>
  )
}
