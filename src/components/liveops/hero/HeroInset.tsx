import { ArrowLeftRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { color, font, radius } from '@/design-system/tokens'
import { MapCanvas } from '@/components/liveops/map/MapCanvas'
import { useSiteMap } from '@/liveops/useSiteMap'
import { CameraThumb } from './CameraThumb'
import type { CameraFacing } from '@/components/liveops/feed/CameraModeTabs'
import type { Mission, RobotState } from '@/types'

/**
 * Bottom-left inset showing whichever view (map or camera) is NOT currently
 * the hero. Its swap icon is what promotes it to the large view — this is
 * the single control that toggles HeroView's mode.
 */
export function HeroInset({
  showing, robot, mission, onSwap, facing = 'front', width = 176, height = 106, actionLabel,
}: {
  showing: 'camera' | 'map'
  robot: RobotState
  mission?: Mission
  onSwap: () => void
  /** Which camera the inset previews. Follows the view's facing selection, so
   * swapping map/camera doesn't silently jump back to the front camera. */
  facing?: CameraFacing
  /** Preview size. The Camera view uses a larger inset (the map is the
   * operator's second most important view there); Cockpit keeps it small. */
  width?: number
  height?: number
  /** What clicking the inset does, when it is not a swap (Dual cam hides it). */
  actionLabel?: string
}) {
  const { t } = useTranslation()
  // The same map every full view draws, so the inset's boundary is that map's
  // own and not the mock site's. Only `map` is passed: the floor, the picker and
  // the cloud toggle stay out of the inset. A stable reference between frames.
  const { map } = useSiteMap()
  const swapLabel = actionLabel ?? (showing === 'map' ? t('liveops.camera.swapMap') : t('liveops.camera.swapCamera'))
  return (
    <div className="rh-panel rh-panel--float" style={{
      position: 'absolute', bottom: 12, left: 12, zIndex: 900,
      width, borderRadius: radius.md + 2, overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px',
        borderBottom: `1px solid ${color.overlayBorder}`,
      }}>
        <span style={{ fontSize: font.size.sm, fontWeight: font.weight.semibold, color: color.t1 }}>
          {showing === 'map' ? t('viewModes.map') : t('liveops.camera.camera')}
        </span>
        {/* Kept as a visible affordance — the overlay below makes the whole
            preview clickable, but the icon is what advertises that it can be. */}
        <ArrowLeftRight size={13} strokeWidth={1.75} color={color.t3} aria-hidden />
      </div>
      <div style={{ width, height, position: 'relative' }}>
        {showing === 'map' ? (
          <MapCanvas robot={robot} mission={mission} variant="mini" map={map} />
        ) : (
          <CameraThumb robot={robot} facing={facing} width={width} height={height} />
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
