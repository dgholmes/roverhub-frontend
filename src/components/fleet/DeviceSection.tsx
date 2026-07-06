import { ChevronRight } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'

interface LinkedRow {
  label: string
  value: string
  onClick?: () => void
}

/**
 * One physical device's block within DeviceDetailDrawer — image/icon +
 * identity + linked rows on the left, a dense stat grid on the right. Reused
 * for the Robot and Edge Bridge sections so each device reads like a compact
 * dashboard card, not a paragraph of text.
 */
export function DeviceSection({
  title, icon, statusColor, statusLabel, badge, image, identityLines, linkedRows, children,
}: {
  title: string
  icon?: React.ReactNode
  statusColor: string
  statusLabel: string
  badge?: React.ReactNode
  image?: string
  identityLines: { label: string; value: string }[]
  linkedRows?: LinkedRow[]
  children: React.ReactNode
}) {
  return (
    <div style={{ background: color.surface, border: `1px solid ${color.border}`, borderRadius: radius.md, overflow: 'hidden', flexShrink: 0 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: space[3],
        padding: `${space[3]}px ${space[4]}px`, borderBottom: `1px solid ${color.border}`,
      }}>
        <span style={{ fontSize: font.size.lg, fontWeight: font.weight.bold, color: color.t1 }}>{title}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
          <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: statusColor }}>{statusLabel}</span>
        </span>
        {badge}
      </div>

      <div style={{ display: 'flex', gap: space[4], padding: space[4] }}>
        <div style={{ width: 190, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: space[3] }}>
          <div style={{
            width: '100%', aspectRatio: '1', background: color.card, borderRadius: radius.md,
            display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${color.border}`,
          }}>
            {image ? <img src={image} alt="" style={{ width: '65%', height: '65%', objectFit: 'contain' }} /> : icon}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {identityLines.map((l) => (
              <div key={l.label} style={{ fontSize: font.size.sm, color: color.t2 }}>
                {l.label}: <span style={{ color: color.t1, fontFamily: 'monospace' }}>{l.value}</span>
              </div>
            ))}
          </div>

          {linkedRows && linkedRows.length > 0 && (
            <div>
              {linkedRows.map((row) => (
                <button
                  key={row.label}
                  onClick={row.onClick}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
                    background: 'transparent', border: 'none', borderTop: `1px solid ${color.border}`,
                    padding: `${space[2]}px 0`, cursor: row.onClick ? 'pointer' : 'default', textAlign: 'left',
                  }}
                >
                  <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1 }}>{row.label}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: font.size.sm, color: color.t2 }}>
                    {row.value}
                    {row.onClick && <ChevronRight size={12} />}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: `${space[1]}px ${space[3]}px`, alignContent: 'start' }}>
          {children}
        </div>
      </div>
    </div>
  )
}
