import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeftRight, Maximize2 } from 'lucide-react'
import { color } from '@/design-system/tokens'
import { IconButton } from '@/components/kit'
import { type CameraFacing, type CameraMode } from '@/components/liveops/feed/CameraModeTabs'
import { TelemetryStrip } from '@/components/liveops/feed/TelemetryPanel'
import { MapCanvas } from '@/components/liveops/map/MapCanvas'
import { CommandAckToast } from '@/components/liveops/command/CommandAckToast'
import { operatorHoldsControl } from '@/liveops/controlOwner'
import { useSessionStore } from '@/store/useSessionStore'
import type { Mission, RobotState } from '@/types'
import { CameraFeedLayer } from './CameraFeedLayer'
import { CameraModeTabsOverlay } from './CameraModeTabsOverlay'
import { CaptureRail } from './CaptureRail'
import { ManualControlOverlay } from './ManualControlOverlay'

const OTHER: Record<CameraFacing, CameraFacing> = { front: 'back', back: 'front' }

/**
 * FlightHub 2's live layout (2026-11-06): a left column with the map above a
 * second camera, and the main camera large on the right. Map, front and rear
 * are all on screen at once, which none of the other modes manage — Split has
 * no rear camera, Dual cam's map is a small inset.
 *
 * The second camera is always the one the main camera is not showing, so the
 * main pane's Front ⇄ Rear switch and the swap button on the small pane are
 * the same action.
 *
 * Telemetry is the same docked strip as Split and Dual cam, spanning all three
 * panes, so no feed is covered by readouts. Panes are separated by a 2px gap,
 * not a rule.
 */
export function StackedView({ robot, mission }: { robot: RobotState; mission?: Mission }) {
  const { t } = useTranslation()
  const cameraFit = useSessionStore((s) => s.cameraFit)
  const setCameraFit = useSessionStore((s) => s.setCameraFit)
  const setViewMode = useSessionStore((s) => s.setViewMode)
  const [cameraMode, setCameraMode] = useState<CameraMode>('rgb')
  const [facing, setFacing] = useState<CameraFacing>('front')
  const ddsAvailable = robot.connectivity.dds === 'connected'
  const second = OTHER[facing]
  const swapLabel = facing === 'front' ? t('liveops.camera.switchToRear') : t('liveops.camera.switchToFront')

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, background: color.videoBg, position: 'relative' }}>
      <div style={{ flexShrink: 0, background: color.surface }}>
        <TelemetryStrip robot={robot} />
      </div>

      <div style={{
        flex: 1, display: 'grid', gridTemplateColumns: 'clamp(280px, 31%, 520px) minmax(0, 1fr)',
        gap: 2, overflow: 'hidden', minHeight: 0,
      }}>
        <div style={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 2, minHeight: 0 }}>
          <div style={{ position: 'relative', minWidth: 0, minHeight: 0 }}>
            <MapCanvas robot={robot} mission={mission} variant="full" />
            <PaneHeader label={t('viewModes.map')}>
              <IconButton size="sm" icon={Maximize2} label={t('liveops.stacked.enlargeMap')} onClick={() => setViewMode('map')} />
            </PaneHeader>
          </div>

          <div style={{ position: 'relative', minWidth: 0, minHeight: 0 }}>
            <CameraFeedLayer robot={robot} facing={second} fit={cameraFit} />
            {/* The whole pane swaps, not just the icon in its header. */}
            <button
              type="button"
              onClick={() => setFacing(second)}
              aria-label={swapLabel}
              title={swapLabel}
              style={{ position: 'absolute', inset: 0, zIndex: 870, background: 'transparent', border: 'none', cursor: 'pointer' }}
            />
            <PaneHeader label={second === 'back' ? t('liveops.camera.rear') : t('liveops.camera.front')}>
              <IconButton size="sm" icon={ArrowLeftRight} label={swapLabel} onClick={() => setFacing(second)} />
            </PaneHeader>
          </div>
        </div>

        <div style={{ position: 'relative', minWidth: 0, minHeight: 0 }}>
          <CameraFeedLayer robot={robot} facing={facing} fit={cameraFit} />
          <span className="rh-video-label" style={{ position: 'absolute', top: 12, left: 12, zIndex: 880 }}>
            {facing === 'back' ? t('liveops.camera.rear') : t('liveops.camera.front')}
          </span>
          <CameraModeTabsOverlay
            mode={cameraMode} onChange={setCameraMode} ddsAvailable={ddsAvailable}
            facing={facing} onFacingChange={setFacing}
            fit={cameraFit} onFitChange={setCameraFit}
          />
          <CaptureRail robot={robot} facing={facing} hotkeys />
        </div>
      </div>

      {operatorHoldsControl(robot) && <ManualControlOverlay robot={robot} />}
      <CommandAckToast />
    </div>
  )
}

/** A small pane's name at top left and its one action at top right. */
function PaneHeader({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <span className="rh-video-label" style={{ position: 'absolute', top: 8, left: 8, zIndex: 880, pointerEvents: 'none' }}>
        {label}
      </span>
      <div className="rh-on-video rh-video-bar" style={{ position: 'absolute', top: 8, right: 8, zIndex: 880 }}>
        {children}
      </div>
    </>
  )
}
