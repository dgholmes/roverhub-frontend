import { BatteryCharging } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import type { RobotBattery } from '@/types'

function runtimeLabel(min: number): string {
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function batteryLevelColor(pct: number): string {
  if (pct <= 15) return color.red
  if (pct <= 30) return color.amber
  return color.accent
}

export function BatteryStatus({ battery }: { battery: RobotBattery }) {
  const barColor = batteryLevelColor(battery.percent)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] + 2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          {battery.charging && <BatteryCharging size={12} color={color.accent} strokeWidth={2} />}
          <span style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.t1 }}>
            {battery.percent}%
          </span>
        </div>
        <span style={{ fontSize: font.size.sm, color: color.t3 }}>{runtimeLabel(battery.est_runtime_min)} left</span>
      </div>
      <div style={{ height: 4, background: color.border, borderRadius: radius.full, overflow: 'hidden' }}>
        <div style={{ width: `${battery.percent}%`, height: '100%', background: barColor, borderRadius: radius.full }} />
      </div>
    </div>
  )
}
