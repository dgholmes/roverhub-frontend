import { color, font, radius, space } from '@/design-system/tokens'
import type { SensorHealth, SensorHealthState } from '@/types'

const STATE_COLOR: Record<SensorHealthState, string> = {
  ok: color.green,
  degraded: color.amber,
  fault: color.red,
  unsupported: color.t3,
}

const STATE_LABEL: Record<SensorHealthState, string> = {
  ok: 'OK',
  degraded: 'Degraded',
  fault: 'Fault',
  unsupported: 'Unsupported',
}

export function SensorHealthPanel({ sensors }: { sensors: SensorHealth[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: space[1] + 2 }}>
      {sensors.map((s) => (
        <div key={s.sensor} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: font.size.sm, color: color.t1 }}>{s.label}</div>
            {s.detail && <div style={{ fontSize: font.size.xs, color: color.t3 }}>{s.detail}</div>}
          </div>
          <span style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: radius.xs,
            background: `${STATE_COLOR[s.state]}1F`, border: `1px solid ${STATE_COLOR[s.state]}40`,
            color: STATE_COLOR[s.state], fontSize: font.size.xs, fontWeight: font.weight.bold, flexShrink: 0,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: STATE_COLOR[s.state] }} />
            {STATE_LABEL[s.state]}
          </span>
        </div>
      ))}
    </div>
  )
}
