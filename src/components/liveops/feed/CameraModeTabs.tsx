import { Layers, Maximize2, Minimize2, Sun, SwitchCamera } from 'lucide-react'
import { Badge, Button, Segmented } from '@/components/kit'
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
  const unavailable = 'DDS connection lost — wired Ethernet required'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Segmented
        label="Camera mode"
        value={mode}
        onChange={onChange}
        options={[
          ...TABS.map(({ mode: m, label, icon }) => ({
            value: m, label, icon, disabled: !ddsAvailable, title: !ddsAvailable ? unavailable : undefined,
          })),
          // Visible but permanently disabled in MVP, never hidden (§8, §14).
          {
            value: 'thermal' as const,
            label: <>Thermal <Badge>R2</Badge></>,
            disabled: true,
            title: 'Thermal camera not available in this release',
          },
        ]}
      />

      {mode === 'rgb' && ddsAvailable && (
        <Button
          size="sm"
          variant="ghost"
          icon={SwitchCamera}
          // Names the current state *and* the action, so a one-button toggle
          // can't be misread as "click to select Front".
          title={`Showing the ${FACING_LABEL[facing].toLowerCase()} camera — switch to ${FACING_LABEL[OTHER_FACING[facing]].toLowerCase()}`}
          aria-label={`Showing the ${FACING_LABEL[facing].toLowerCase()} camera — switch to ${FACING_LABEL[OTHER_FACING[facing]].toLowerCase()}`}
          onClick={() => onFacingChange(OTHER_FACING[facing])}
        >
          {FACING_LABEL[facing]}
        </Button>
      )}

      {ddsAvailable && (
        <Button
          size="sm"
          variant="ghost"
          icon={fit === 'fit' ? Maximize2 : Minimize2}
          title={`${FIT_TITLE[fit]} — switch to ${FIT_LABEL[OTHER_FIT[fit]]}`}
          aria-label={`${FIT_TITLE[fit]} — switch to ${FIT_LABEL[OTHER_FIT[fit]]}`}
          onClick={() => onFitChange(OTHER_FIT[fit])}
        >
          {FIT_LABEL[fit]}
        </Button>
      )}
    </div>
  )
}
