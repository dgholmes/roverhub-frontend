import { Info } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import type { FootTypeInfo } from '@/types'

/**
 * Read-only. Foot type is a physical hardware configuration (confirmed by
 * the vendored SDK: `get_robot_type()` reports 'miniQuad' vs 'miniQuadW',
 * with no corresponding "set robot type" RPC) — changing it means swapping
 * the physical leg/foot hardware, not a software toggle. This only reports
 * what's currently installed.
 */
export function FootTypeSection({ footType }: { footType: FootTypeInfo }) {
  return (
    <div style={{ border: `1px solid ${color.border}`, borderRadius: radius.md, padding: space[4], display: 'flex', flexDirection: 'column', gap: space[3] }}>
      <div>
        <div style={{ fontSize: font.size.sm, color: color.t3, marginBottom: 4 }}>Installed foot type</div>
        <div style={{ fontSize: font.size.lg, fontWeight: font.weight.semibold, color: color.t1 }}>
          {footType.current}
        </div>
      </div>
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: space[2], padding: space[3],
        background: color.card, border: `1px solid ${color.border}`, borderRadius: radius.sm,
        color: color.t3, fontSize: font.size.xs,
      }}>
        <Info size={13} strokeWidth={1.8} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>
          Foot type is a physical hardware configuration, not a software setting — changing it requires swapping the
          robot's leg/foot hardware. Other variant this model supports: {footType.options.filter((o) => o !== footType.current).join(', ') || 'none'}.
        </span>
      </div>
    </div>
  )
}
