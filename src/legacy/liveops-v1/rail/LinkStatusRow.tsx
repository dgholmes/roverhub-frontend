import { color, font, radius, space } from '@/design-system/tokens'

const QUALITY_COLOR: Record<'good' | 'degraded' | 'bad', string> = {
  good: color.accent,
  degraded: color.amber,
  bad: color.red,
}

export function LinkStatusRow({
  label, value, quality, detail,
}: {
  label: string
  value: string
  quality: 'good' | 'degraded' | 'bad'
  detail?: string
}) {
  const c = QUALITY_COLOR[quality]
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: font.size.sm, color: color.t3 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[1] + 2 }}>
        {detail && <span style={{ fontSize: font.size.xs, color: color.t3 }}>{detail}</span>}
        <span style={{ width: 5, height: 5, borderRadius: radius.full, background: c, display: 'inline-block' }} />
        <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: c }}>{value}</span>
      </div>
    </div>
  )
}
