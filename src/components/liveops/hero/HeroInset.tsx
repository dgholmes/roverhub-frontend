import { ArrowLeftRight } from 'lucide-react'
import { color, font, glass, radius } from '@/design-system/tokens'
import { MapCanvas } from '@/components/liveops/map/MapCanvas'
import { CameraThumb } from './CameraThumb'
import type { CameraFacing } from '@/components/liveops/feed/CameraModeTabs'
import type { Mission, RobotState } from '@/types'

/**
 * Bottom-left inset showing whichever view (map or camera) is NOT currently
 * the hero. Its swap icon is what promotes it to the large view — this is
 * the single control that toggles HeroView's mode.
 */
export function HeroInset({
  showing, robot, mission, onSwap, facing = 'front',
}: {
  showing: 'camera' | 'map'
  robot: RobotState
  mission?: Mission
  onSwap: () => void
  /** Which camera the inset previews. Follows the view's facing selection, so
   * swapping map/camera doesn't silently jump back to the front camera. */
  facing?: CameraFacing
}) {
  const swapLabel = `Switch ${showing === 'map' ? 'map' : 'camera'} to large view`
  return (
    <div style={{
      ...glass.overlay, position: 'absolute', bottom: 12, left: 12, zIndex: 900,
      width: 176, borderRadius: radius.md, overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '5px 10px',
        background: 'rgba(8,8,10,0.30)', backdropFilter: 'blur(4px)', borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1 }}>
          {showing === 'map' ? 'Map' : 'Camera'}
        </span>
        {/* Kept as a visible affordance — the overlay below makes the whole
            preview clickable, but the icon is what advertises that it can be. */}
        <ArrowLeftRight size={11} strokeWidth={1.6} color="rgba(255,255,255,0.5)" aria-hidden />
      </div>
      <div style={{ width: 176, height: 106, position: 'relative' }}>
        {showing === 'map' ? (
          <MapCanvas robot={robot} mission={mission} variant="mini" />
        ) : (
          <CameraThumb robot={robot} facing={facing} width={176} height={106} />
        )}
        {/* The whole preview swaps, not just the 11px icon in the header.
            Clicking the small view to promote it is the obvious gesture, and
            the inset is a ~176×106 target versus an 11px one. Implemented as a
            transparent overlay rather than by wrapping the content, so the
            Leaflet mini map is never nested inside a button. It is safe because
            `variant="mini"` disables dragging and scroll-wheel zoom, so there
            is no map interaction to swallow. */}
        <button
          onClick={onSwap}
          aria-label={swapLabel}
          title={swapLabel}
          style={{
            position: 'absolute', inset: 0, background: 'transparent',
            border: 'none', cursor: 'pointer', padding: 0,
          }}
        />
      </div>
    </div>
  )
}
