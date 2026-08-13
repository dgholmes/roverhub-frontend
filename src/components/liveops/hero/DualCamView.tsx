import { useState } from 'react'
import { color, font, glass, radius, space } from '@/design-system/tokens'
import { TelemetryOverlay } from '@/components/liveops/feed/TelemetryOverlay'
import { CommandAckToast } from '@/components/liveops/command/CommandAckToast'
import { RobotSelector } from '@/components/shell/RobotSelector'
import { ViewModeSelector } from '@/components/shell/ViewModeSelector'
import type { FullscreenControl } from '@/liveops/useFullscreenToggle'
import { useSessionStore } from '@/store/useSessionStore'
import type { CameraFacing } from '@/components/liveops/feed/CameraModeTabs'
import type { Mission, RobotState } from '@/types'
import { CameraFeedLayer } from './CameraFeedLayer'
import { FullscreenButton } from './FullscreenButton'
import { HeroInset } from './HeroInset'
import { ManualControlOverlay } from './ManualControlOverlay'

const PANES: { facing: CameraFacing; label: string }[] = [
  { facing: 'front', label: 'Front' },
  { facing: 'back', label: 'Back' },
]

/**
 * Both RGB cameras at once, side by side.
 *
 * The other modes all show one camera and make you toggle facing to see the
 * other, which is the wrong trade when the question is "is anything behind
 * me?" — reversing a quadruped, backing off an obstacle, or watching an area
 * while driving away from it. Each pane is labelled, because two near-identical
 * grey frames are otherwise indistinguishable and mistaking one for the other
 * while driving is exactly the failure this mode exists to prevent.
 *
 * Distinct from the reserved `grid` (2×2) mode, which is a multi-*robot* patrol
 * wall for R2 — this is one robot, two cameras.
 */
export function DualCamView({ robot, mission, fullscreen }: {
  robot: RobotState
  mission?: Mission
  fullscreen: FullscreenControl
}) {
  const cameraFit = useSessionStore((s) => s.cameraFit)
  const [muted] = useState(true)
  const [insetShowing, setInsetShowing] = useState<'map' | 'hidden'>('map')

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, background: '#0D0D0F', position: 'relative' }}>
      <div style={{
        height: 44, flexShrink: 0, background: color.surface, borderBottom: `1px solid ${color.border}`,
        display: 'flex', alignItems: 'center', padding: `0 ${space[4]}px`, gap: space[3],
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flex: 1, minWidth: 0 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: color.accent, boxShadow: '0 0 5px rgba(170,255,0,0.7)', flexShrink: 0 }} />
          <span style={{
            fontSize: font.size.lg, fontWeight: font.weight.semibold, color: color.t1, letterSpacing: '-0.01em',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            Dual Camera — {robot.name}
          </span>
        </div>

        <RobotSelector />
        <ViewModeSelector />
        <FullscreenButton isFullscreen={fullscreen.isFullscreen} onToggle={fullscreen.onToggle} />
      </div>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {PANES.map(({ facing, label }, i) => (
          <div
            key={facing}
            style={{
              flex: 1, position: 'relative', minWidth: 0,
              borderRight: i === 0 ? `1px solid ${color.border}` : undefined,
            }}
          >
            <CameraFeedLayer robot={robot} muted={muted} facing={facing} fit={cameraFit} />
            <span style={{
              ...glass.overlay, position: 'absolute', top: space[2], left: space[2], zIndex: 880,
              borderRadius: radius.sm, padding: '3px 9px',
              fontSize: font.size.md, fontWeight: font.weight.bold, color: color.t1,
              letterSpacing: '0.04em', fontFamily: font.family,
            }}>
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Telemetry stays on the left pane only — duplicating it over both would
          double the overlay weight for one robot's readings. */}
      <TelemetryOverlay robot={robot} />

      {insetShowing === 'map' && (
        <HeroInset
          showing="map"
          robot={robot}
          mission={mission}
          onSwap={() => setInsetShowing('hidden')}
        />
      )}

      {robot.control_owner != null && <ManualControlOverlay robot={robot} />}
      <CommandAckToast />
    </div>
  )
}
