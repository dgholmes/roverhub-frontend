import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Map as MapIcon, Maximize2, Minimize2, Volume2, VolumeX } from 'lucide-react'
import { color } from '@/design-system/tokens'
import { Button, IconButton } from '@/components/kit'
import { TelemetryStrip } from '@/components/liveops/feed/TelemetryPanel'
import { CommandAckToast } from '@/components/liveops/command/CommandAckToast'
import { useSessionStore } from '@/store/useSessionStore'
import type { CameraFacing } from '@/components/liveops/feed/CameraModeTabs'
import type { Mission, RobotState } from '@/types'
import { CameraFeedLayer } from './CameraFeedLayer'
import { CaptureRail } from './CaptureRail'
import { HeroInset } from './HeroInset'
import { ManualControlOverlay } from './ManualControlOverlay'
import { operatorHoldsControl } from '@/liveops/controlOwner'

const PANES: { facing: CameraFacing; labelKey: 'liveops.camera.front' | 'liveops.camera.rear' }[] = [
  { facing: 'front', labelKey: 'liveops.camera.front' },
  { facing: 'back', labelKey: 'liveops.camera.rear' },
]

/**
 * Both RGB cameras at once, side by side.
 *
 * The other modes show one camera and make you toggle facing to see the other,
 * which is the wrong trade when the question is "is anything behind me?" —
 * reversing a quadruped, backing off an obstacle, or watching an area while
 * driving away from it. Each pane is labelled, because two near-identical grey
 * frames are otherwise indistinguishable and mistaking one for the other while
 * driving is exactly the failure this mode exists to prevent.
 *
 * Telemetry is the same docked strip as the Camera and Split views rather than
 * a card over the front pane, so neither feed is covered and the label never
 * collides with it. The panes are separated by a 2px gap, not a rule.
 *
 * Distinct from the reserved `grid` (2×2) mode, which is a multi-*robot* patrol
 * wall for R2 — this is one robot, two cameras.
 */
export function DualCamView({ robot, mission }: { robot: RobotState; mission?: Mission }) {
  const { t } = useTranslation()
  const cameraFit = useSessionStore((s) => s.cameraFit)
  const setCameraFit = useSessionStore((s) => s.setCameraFit)
  const [muted, setMuted] = useState(true)
  const [showMap, setShowMap] = useState(true)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, background: color.videoBg, position: 'relative' }}>
      <div style={{ flexShrink: 0, background: color.surface }}>
        <TelemetryStrip robot={robot} />
      </div>

      <div style={{ flex: 1, display: 'flex', gap: 2, overflow: 'hidden', minHeight: 0 }}>
        {PANES.map(({ facing, labelKey }) => (
          <div key={facing} style={{ flex: 1, position: 'relative', minWidth: 0 }}>
            {/* Only the front feed carries audio — two copies of the same
                microphone would just echo. */}
            <CameraFeedLayer robot={robot} muted={facing === 'back' || muted} facing={facing} fit={cameraFit} />
            {/* Each pane captures its own camera; P is bound once, to the front. */}
            <CaptureRail robot={robot} facing={facing} hotkeys={facing === 'front'} />
            <span className="rh-video-label" style={{ position: 'absolute', top: 12, left: 12, zIndex: 880 }}>
              {t(labelKey)}
            </span>
          </div>
        ))}
      </div>

      <div className="rh-on-video rh-video-bar" style={{ position: 'absolute', top: 56, right: 12, zIndex: 900 }}>
        {!showMap && (
          <Button size="sm" variant="ghost" icon={MapIcon} onClick={() => setShowMap(true)}>{t('viewModes.map')}</Button>
        )}
        <Button
          size="sm" variant="ghost" icon={cameraFit === 'fit' ? Maximize2 : Minimize2}
          title={cameraFit === 'fit' ? t('liveops.camera.fitTitle') : t('liveops.camera.fillTitle')}
          onClick={() => setCameraFit(cameraFit === 'fit' ? 'fill' : 'fit')}
        >
          {cameraFit === 'fit' ? t('liveops.camera.fit') : t('liveops.camera.fill')}
        </Button>
        <IconButton
          size="sm" icon={muted ? VolumeX : Volume2}
          label={muted ? t('liveops.camera.unmuteFront') : t('liveops.camera.muteFront')}
          onClick={() => setMuted((m) => !m)}
        />
      </div>

      {showMap && (
        <HeroInset
          showing="map"
          robot={robot}
          mission={mission}
          width={260}
          height={160}
          actionLabel={t('liveops.camera.hideMap')}
          onSwap={() => setShowMap(false)}
        />
      )}

      {operatorHoldsControl(robot) && <ManualControlOverlay robot={robot} />}
      <CommandAckToast />
    </div>
  )
}
