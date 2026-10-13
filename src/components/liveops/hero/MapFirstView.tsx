import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Expand, Shrink, SwitchCamera, Video } from 'lucide-react'
import { color, font, radius, space } from '@/design-system/tokens'
import { IconButton } from '@/components/kit'
import { TelemetryCard } from '@/components/liveops/feed/TelemetryPanel'
import { MapCanvas } from '@/components/liveops/map/MapCanvas'
import { CommandAckToast } from '@/components/liveops/command/CommandAckToast'
import { QuickActionsMenu } from '@/components/liveops/command/QuickActionsMenu'
import type { CameraFacing } from '@/components/liveops/feed/CameraModeTabs'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSessionStore } from '@/store/useSessionStore'
import type { Mission, RobotState } from '@/types'
import { CameraFeedLayer } from './CameraFeedLayer'
import { ManualControlOverlay } from './ManualControlOverlay'

const DOCK_WIDTH = { sm: 320, lg: 520 } as const

/** The live camera, docked in the map's top-right corner. Two sizes, a
 * front/back toggle, and a one-click jump to the camera-first view for when
 * the operator needs to drive by it. */
function CameraDock({ robot }: { robot: RobotState }) {
  const { t } = useTranslation()
  const [size, setSize] = useState<'sm' | 'lg'>('sm')
  const [facing, setFacing] = useState<CameraFacing>('front')
  const cameraFit = useSessionStore((s) => s.cameraFit)
  const setViewMode = useSessionStore((s) => s.setViewMode)
  const width = DOCK_WIDTH[size]

  return (
    <section
      aria-label={t('liveops.camera.liveCamera')}
      className="rh-panel rh-panel--float"
      style={{
        position: 'absolute', top: 12, right: 12, zIndex: 900, width,
        maxWidth: 'calc(100% - 300px)', borderRadius: radius.md + 2, overflow: 'hidden',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: space[1], height: 36,
        padding: `0 ${space[1]}px 0 ${space[3]}px`, borderBottom: `1px solid ${color.overlayBorder}`,
      }}>
        <span style={{ flex: 1, fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1 }}>
          {facing === 'front' ? t('liveops.camera.front') : t('liveops.camera.rear')}
        </span>
        <IconButton
          size="sm" icon={SwitchCamera}
          label={facing === 'front' ? t('liveops.camera.switchToRear') : t('liveops.camera.switchToFront')}
          onClick={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))}
        />
        <IconButton
          size="sm" icon={size === 'sm' ? Expand : Shrink}
          label={size === 'sm' ? t('liveops.camera.enlarge') : t('liveops.camera.shrink')}
          onClick={() => setSize((s) => (s === 'sm' ? 'lg' : 'sm'))}
        />
        <IconButton size="sm" icon={Video} label={t('liveops.camera.openCameraView')} onClick={() => setViewMode('cockpit')} />
      </div>
      {/* 4:3 is the robot's native frame (640x480), so the dock never letterboxes. */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '4 / 3', background: color.videoBg }}>
        <CameraFeedLayer robot={robot} muted facing={facing} fit={cameraFit} />
      </div>
    </section>
  )
}

/**
 * Map-first LiveOps view, after DJI FlightHub 2: the map is the canvas, and
 * everything else floats over it — telemetry top-left, camera top-right, map
 * controls and quick actions bottom-right. This is what docs/05-ui-ux.md §1.1
 * and PRD §8 describe ("the map dominates LiveOps").
 *
 * Positions are dead-reckoned until a geodetic anchor exists, so the canvas is
 * the site grid rather than a satellite basemap; the robot marker and every
 * position readout carry their estimated badge.
 */
export function MapFirstView({ robot, mission }: { robot: RobotState; mission?: Mission }) {
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)

  return (
    <div style={{ flex: 1, position: 'relative', overflow: 'hidden', minHeight: 0, background: color.mapBg }}>
      {/* Fit the site into the space between the telemetry card (left) and
          the camera dock (right) rather than underneath them. */}
      <MapCanvas
        robot={robot} mission={mission} variant="full"
        fitPadding={{ topLeft: [300, 32], bottomRight: [DOCK_WIDTH.sm + 40, 32] }}
      />
      <TelemetryCard robot={robot} style={{ position: 'absolute', top: 12, left: 12, zIndex: 900 }} />
      <CameraDock robot={robot} />
      {robot.control_owner != null && <ManualControlOverlay robot={robot} />}
      <QuickActionsMenu
        robot={robot}
        onSetState={(state, label) => dispatchCommand(robot.robot_id, 'SET_STATE', label, { state })}
      />
      <CommandAckToast />
    </div>
  )
}
