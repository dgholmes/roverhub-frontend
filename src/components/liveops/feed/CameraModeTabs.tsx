import { Layers, Maximize2, Minimize2, Sun, SwitchCamera } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge, Button, Segmented } from '@/components/kit'
import type { CameraFit } from '@/store/useSessionStore'

export type CameraMode = 'rgb' | 'depth' | 'thermal'
export type CameraFacing = 'front' | 'back'

const TABS: { mode: CameraMode; labelKey: 'liveops.cameraTabs.rgb' | 'liveops.cameraTabs.depth'; icon: React.ElementType }[] = [
  { mode: 'rgb', labelKey: 'liveops.cameraTabs.rgb', icon: Sun },
  { mode: 'depth', labelKey: 'liveops.cameraTabs.depth', icon: Layers },
]

/**
 * Facing and fit are two-value settings, so they are single toggles showing the
 * current value rather than a pair of buttons each. Four buttons became two,
 * and choosing the other option is one click from anywhere instead of a
 * read-then-aim.
 */
const FACING_LABEL = { front: 'liveops.cameraTabs.front', back: 'liveops.cameraTabs.back' } as const
// Names the current state *and* the action (see the button below).
const FACING_TITLE = { front: 'liveops.cameraTabs.showingFront', back: 'liveops.cameraTabs.showingBack' } as const
const OTHER_FACING: Record<CameraFacing, CameraFacing> = { front: 'back', back: 'front' }

const FIT_LABEL = { fit: 'liveops.camera.fit', fill: 'liveops.camera.fill' } as const
const OTHER_FIT: Record<CameraFit, CameraFit> = { fit: 'fill', fill: 'fit' }
const FIT_TITLE = { fit: 'liveops.cameraTabs.fitTitle', fill: 'liveops.cameraTabs.fillTitle' } as const

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
  const { t } = useTranslation()
  const unavailable = t('liveops.cameraTabs.ddsUnavailable')
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <Segmented
        label={t('liveops.cameraTabs.modeAria')}
        value={mode}
        onChange={onChange}
        options={[
          ...TABS.map(({ mode: m, labelKey, icon }) => ({
            value: m, label: t(labelKey), icon, disabled: !ddsAvailable, title: !ddsAvailable ? unavailable : undefined,
          })),
          // Visible but permanently disabled in MVP, never hidden (§8, §14).
          {
            value: 'thermal' as const,
            label: <>{t('liveops.cameraTabs.thermal')} <Badge>R2</Badge></>,
            disabled: true,
            title: t('liveops.cameraTabs.thermalUnavailable'),
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
          title={t(FACING_TITLE[facing])}
          aria-label={t(FACING_TITLE[facing])}
          onClick={() => onFacingChange(OTHER_FACING[facing])}
        >
          {t(FACING_LABEL[facing])}
        </Button>
      )}

      {ddsAvailable && (
        <Button
          size="sm"
          variant="ghost"
          icon={fit === 'fit' ? Maximize2 : Minimize2}
          title={t(FIT_TITLE[fit])}
          aria-label={t(FIT_TITLE[fit])}
          onClick={() => onFitChange(OTHER_FIT[fit])}
        >
          {t(FIT_LABEL[fit])}
        </Button>
      )}
    </div>
  )
}
