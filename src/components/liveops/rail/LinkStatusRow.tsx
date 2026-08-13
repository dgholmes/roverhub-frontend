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
      {/* Link name and latency are how an operator judges whether teleop is
          safe; both sat at 10–11px in the lowest-contrast token.
          docs/audit/2026-08-12-ui-ux-audit.md A-19. */}
      <span style={{ fontSize: font.size.lg, color: color.t2 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[1] + 2 }}>
        {detail && (
          <span style={{ fontSize: font.size.md, color: color.t2, fontVariantNumeric: 'tabular-nums' }}>
            {detail}
          </span>
        )}
        <span style={{ width: 5, height: 5, borderRadius: radius.full, background: c, display: 'inline-block' }} />
        <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: c }}>{value}</span>
      </div>
    </div>
  )
}
