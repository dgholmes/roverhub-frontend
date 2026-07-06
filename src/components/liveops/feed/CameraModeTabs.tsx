import { Layers, Sun } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'

export type CameraMode = 'rgb' | 'depth' | 'thermal'
export type CameraFacing = 'front' | 'back'

const TABS: { mode: CameraMode; label: string; icon: React.ElementType }[] = [
  { mode: 'rgb', label: 'RGB', icon: Sun },
  { mode: 'depth', label: 'Depth', icon: Layers },
]

const FACINGS: { facing: CameraFacing; label: string }[] = [
  { facing: 'front', label: 'Front' },
  { facing: 'back', label: 'Back' },
]

/**
 * docs/05-ui-ux.md §8 — Thermal is visible-but-permanently-disabled in MVP
 * with an "R2" badge (never hidden). RGB/Depth disable together when DDS is
 * unavailable, with a tooltip explaining why (§14). RVR-01 carries a front
 * and rear RGB camera, so a Front/Back facing toggle nests inside the RGB
 * tab rather than becoming its own top-level mode.
 */
export function CameraModeTabs({
  mode, onChange, ddsAvailable, facing, onFacingChange,
}: {
  mode: CameraMode
  onChange: (m: CameraMode) => void
  ddsAvailable: boolean
  facing: CameraFacing
  onFacingChange: (f: CameraFacing) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
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
              color: !ddsAvailable ? 'rgba(255,255,255,0.35)' : active ? color.t1 : 'rgba(255,255,255,0.6)',
              fontSize: font.size.md, fontWeight: active ? font.weight.semibold : font.weight.regular,
              cursor: ddsAvailable ? 'pointer' : 'not-allowed', fontFamily: font.family,
            }}
          >
            <Icon size={12} strokeWidth={1.8} />
            {label}
          </button>
        )
      })}

      {mode === 'rgb' && ddsAvailable && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2,
          marginLeft: 4, paddingLeft: 6, borderLeft: '1px solid rgba(255,255,255,0.12)',
        }}>
          {FACINGS.map(({ facing: f, label }) => {
            const active = f === facing
            return (
              <button
                key={f}
                title={`${label} camera`}
                onClick={() => onFacingChange(f)}
                style={{
                  padding: '3px 8px', borderRadius: radius.sm,
                  background: active ? 'rgba(170,255,0,0.14)' : 'transparent',
                  border: active ? `1px solid ${color.accentBorder}` : '1px solid transparent',
                  color: active ? color.accent : 'rgba(255,255,255,0.6)',
                  fontSize: font.size.sm, fontWeight: active ? font.weight.semibold : font.weight.regular,
                  cursor: 'pointer', fontFamily: font.family,
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      <button
        disabled
        title="Thermal camera not available in this release."
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 10px', borderRadius: radius.sm,
          background: 'transparent', border: '1px solid transparent',
          color: 'rgba(255,255,255,0.35)', fontSize: font.size.md, cursor: 'not-allowed', fontFamily: font.family,
        }}
      >
        Thermal
        <span style={{
          fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.25)',
          borderRadius: radius.xs, padding: `0 ${space[1]}px`,
        }}>
          R2
        </span>
      </button>
    </div>
  )
}
