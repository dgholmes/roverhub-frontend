import { Layers, Sun } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'

export type CameraMode = 'rgb' | 'depth' | 'thermal'

const TABS: { mode: CameraMode; label: string; icon: React.ElementType }[] = [
  { mode: 'rgb', label: 'RGB', icon: Sun },
  { mode: 'depth', label: 'Depth', icon: Layers },
]

/**
 * docs/05-ui-ux.md §8 — Thermal is visible-but-permanently-disabled in MVP
 * with an "R2" badge (never hidden). RGB/Depth disable together when DDS is
 * unavailable, with a tooltip explaining why (§14).
 */
export function CameraModeTabs({
  mode, onChange, ddsAvailable,
}: {
  mode: CameraMode
  onChange: (m: CameraMode) => void
  ddsAvailable: boolean
}) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {TABS.map(({ mode: m, label, icon: Icon }) => {
        const active = m === mode
        return (
          <button
            key={m}
            disabled={!ddsAvailable}
            title={!ddsAvailable ? 'DDS connection lost — wired Ethernet required' : undefined}
            onClick={() => ddsAvailable && onChange(m)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '4px 10px', borderRadius: radius.sm,
              background: active ? 'rgba(255,255,255,0.10)' : 'transparent',
              border: active ? '1px solid rgba(255,255,255,0.12)' : '1px solid transparent',
              color: !ddsAvailable ? color.t4 : active ? color.t1 : color.t3,
              fontSize: font.size.md, fontWeight: active ? font.weight.semibold : font.weight.regular,
              cursor: ddsAvailable ? 'pointer' : 'not-allowed', fontFamily: font.family,
            }}
          >
            <Icon size={12} strokeWidth={1.8} />
            {label}
          </button>
        )
      })}
      <button
        disabled
        title="Thermal camera not available in this release."
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', borderRadius: radius.sm,
          background: 'transparent', border: '1px solid transparent',
          color: color.t4, fontSize: font.size.md, cursor: 'not-allowed', fontFamily: font.family,
        }}
      >
        Thermal
        <span style={{
          fontSize: 8, fontWeight: 700, color: color.t3, border: `1px solid ${color.borderLt}`,
          borderRadius: radius.xs, padding: `0 ${space[1]}px`,
        }}>
          R2
        </span>
      </button>
    </div>
  )
}
