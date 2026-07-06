import { color, font, space } from '@/design-system/tokens'

/**
 * Dense icon+value+label tile — glanceable at-a-glance stats instead of
 * stacked label:value text rows, matching the reference device-maintenance
 * layout the operator asked to mirror.
 */
export function StatTile({
  icon: Icon, value, label, valueColor, dot,
}: {
  icon?: React.ElementType
  value: React.ReactNode
  label: string
  valueColor?: string
  dot?: string
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: `${space[2]}px ${space[1]}px` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, minHeight: 18 }}>
        {Icon && <Icon size={13} strokeWidth={1.8} color={valueColor ?? color.t2} style={{ flexShrink: 0 }} />}
        {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: dot, flexShrink: 0 }} />}
        <span style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: valueColor ?? color.t1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {value}
        </span>
      </div>
      <span style={{ fontSize: font.size.xs, color: color.t3 }}>{label}</span>
    </div>
  )
}
