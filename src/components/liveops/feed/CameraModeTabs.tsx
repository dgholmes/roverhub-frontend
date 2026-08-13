import { Layers, Maximize2, Minimize2, Sun, SwitchCamera } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import type { CameraFit } from '@/store/useSessionStore'

export type CameraMode = 'rgb' | 'depth' | 'thermal'
export type CameraFacing = 'front' | 'back'

const TABS: { mode: CameraMode; label: string; icon: React.ElementType }[] = [
  { mode: 'rgb', label: 'RGB', icon: Sun },
  { mode: 'depth', label: 'Depth', icon: Layers },
]

/**
 * Facing and fit are two-value settings, so they are single toggles showing the
 * current value rather than a pair of buttons each. Four buttons became two,
 * and choosing the other option is one click from anywhere instead of a
 * read-then-aim.
 */
const FACING_LABEL: Record<CameraFacing, string> = { front: 'Front', back: 'Back' }
const OTHER_FACING: Record<CameraFacing, CameraFacing> = { front: 'back', back: 'front' }

const FIT_LABEL: Record<CameraFit, string> = { fit: 'Fit', fill: 'Fill' }
const OTHER_FIT: Record<CameraFit, CameraFit> = { fit: 'fill', fill: 'fit' }
const FIT_TITLE: Record<CameraFit, string> = {
  fit: 'Showing the entire 4:3 frame (bars at the sides)',
  fill: 'Filling the pane, cropping the top and bottom of the frame',
}

function ToggleChip({
  icon: Icon, label, title, onClick, accent = false,
}: {
  icon: React.ElementType
  label: string
  title: string
  onClick: () => void
  accent?: boolean
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      marginLeft: 4, paddingLeft: 6, borderLeft: '1px solid rgba(255,255,255,0.12)',
    }}>
      <button
        title={title}
        aria-label={title}
        onClick={onClick}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 9px', borderRadius: radius.sm,
          background: accent ? 'rgba(170,255,0,0.14)' : 'rgba(255,255,255,0.10)',
          border: `1px solid ${accent ? color.accentBorder : 'rgba(255,255,255,0.12)'}`,
          color: accent ? color.accent : color.t1,
          fontSize: font.size.sm, fontWeight: font.weight.semibold,
          cursor: 'pointer', fontFamily: font.family, whiteSpace: 'nowrap',
        }}
      >
        <Icon size={12} strokeWidth={1.8} />
        {label}
      </button>
    </div>
  )
}

/**
 * docs/05-ui-ux.md §8 — Thermal is visible-but-permanently-disabled in MVP
 * with an "R2" badge (never hidden). RGB/Depth disable together when DDS is
 * unavailable, with a tooltip explaining why (§14). RVR-01 carries a front
 * and rear RGB camera, so a Front/Back facing toggle nests inside the RGB
 * tab rather than becoming its own top-level mode.
 */
export function CameraModeTabs({
  mode, onChange, ddsAvailable, facing, onFacingChange, fit, onFitChange,
}: {
  mode: CameraMode
  onChange: (m: CameraMode) => void
  ddsAvailable: boolean
  facing: CameraFacing
  onFacingChange: (f: CameraFacing) => void
  fit: CameraFit
  onFitChange: (f: CameraFit) => void
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
        <ToggleChip
          icon={SwitchCamera}
          label={FACING_LABEL[facing]}
          accent
          // Names the current state *and* the action, so a one-button toggle
          // can't be misread as "click to select Front".
          title={`Showing the ${FACING_LABEL[facing].toLowerCase()} camera — switch to ${FACING_LABEL[OTHER_FACING[facing]].toLowerCase()}`}
          onClick={() => onFacingChange(OTHER_FACING[facing])}
        />
      )}

      {ddsAvailable && (
        <ToggleChip
          icon={fit === 'fit' ? Maximize2 : Minimize2}
          label={FIT_LABEL[fit]}
          title={`${FIT_TITLE[fit]} — switch to ${FIT_LABEL[OTHER_FIT[fit]]}`}
          onClick={() => onFitChange(OTHER_FIT[fit])}
        />
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
          fontSize: font.size.xs, fontWeight: 700, color: 'rgba(255,255,255,0.78)', border: '1px solid rgba(255,255,255,0.25)',
          borderRadius: radius.xs, padding: `0 ${space[1]}px`,
        }}>
          R2
        </span>
      </button>
    </div>
  )
}
