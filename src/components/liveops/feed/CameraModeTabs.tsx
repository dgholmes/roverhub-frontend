import { Fragment, useEffect } from 'react'
import { CAMERA_KEYS, cameraModeFor } from '@/liveops/cameraHotkeys'
import { Layers, Maximize2, Minimize2, Sun, SwitchCamera } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/kit'
import type { CameraFit } from '@/store/useSessionStore'

export type CameraMode = 'rgb' | 'depth' | 'thermal'
export type CameraFacing = 'front' | 'back'

const TABS: { mode: CameraMode; labelKey: 'liveops.cameraTabs.rgb' | 'liveops.cameraTabs.depth'; icon: React.ElementType; key: string }[] = [
  { mode: 'rgb', labelKey: 'liveops.cameraTabs.rgb', icon: Sun, key: CAMERA_KEYS.rgb },
  { mode: 'depth', labelKey: 'liveops.cameraTabs.depth', icon: Layers, key: CAMERA_KEYS.depth },
]

/** The key badge beside a camera tab's label. */
function Kbd({ children }: { children: string }) {
  return <kbd className="rh-kbd" aria-hidden>{children}</kbd>
}

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
 * RGB and Depth, with the Front/Rear toggle right after RGB, inside the same
 * pill, since facing only applies to the RGB cameras. Thermal is hidden until
 * a robot has one (user's call, 2026-11-06; it used to sit disabled with an R2
 * badge per docs/05-ui-ux.md §8). RGB and Depth disable together when DDS is
 * unavailable, with a tooltip explaining why (§14).
 *
 * Not a Segmented: the facing toggle sits between two of its options, so the
 * modes are pressed-state buttons in a group rather than tabs.
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

  // 1 and 2 pick RGB and Depth, as FlightHub's number keys pick a lens. Only
  // one camera bar is mounted at a time, so there is one listener. Ignored
  // while typing, with a modifier held, or when the cameras are unavailable.
  useEffect(() => {
    if (!ddsAvailable) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target instanceof HTMLElement ? e.target : null
      const m = cameraModeFor({
        key: e.key, repeat: e.repeat, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey,
        targetTag: el?.tagName, targetEditable: el?.isContentEditable,
      })
      if (m) onChange(m)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ddsAvailable, onChange])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
      <div role="group" aria-label={t('liveops.cameraTabs.modeAria')} className="rh-seg">
        {TABS.map(({ mode: m, labelKey, icon: Icon, key }) => (
          <Fragment key={m}>
            <button
              type="button"
              className="rh-seg__item"
              aria-pressed={mode === m}
              disabled={!ddsAvailable}
              title={!ddsAvailable ? unavailable : t('liveops.cameraTabs.keyHint', { key })}
              onClick={() => onChange(m)}
            >
              <Icon size={14} strokeWidth={1.75} aria-hidden />
              <span className="rh-seg__label">{t(labelKey)} <Kbd>{key}</Kbd></span>
            </button>
            {m === 'rgb' && mode === 'rgb' && ddsAvailable && (
              <button
                type="button"
                className="rh-seg__item"
                // Names the current state *and* the action, so a one-button
                // toggle can't be misread as "click to select Front".
                title={t(FACING_TITLE[facing])}
                aria-label={t(FACING_TITLE[facing])}
                onClick={() => onFacingChange(OTHER_FACING[facing])}
              >
                <SwitchCamera size={14} strokeWidth={1.75} aria-hidden />
                <span className="rh-seg__label">{t(FACING_LABEL[facing])}</span>
              </button>
            )}
          </Fragment>
        ))}
      </div>

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
