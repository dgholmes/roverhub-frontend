import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { Box } from 'lucide-react'
import { color, glass, radius, space } from '@/design-system/tokens'
import { MapDetailPanel } from '@/components/maps/MapDetailPanel'
import type { SiteMap } from '@/types/maps'

/**
 * The map toolbar's switch for the 3D point-cloud panel. 3D is diagnostic --
 * reached for when localisation looks wrong or the robot stops somewhere odd --
 * so it starts closed and nobody downloads three.js until they ask.
 *
 * Memoized, with a stable `onToggle` from the caller: MapCanvas re-renders on
 * every telemetry frame, and an unmemoized control there is how GridLayer once
 * cost ~2,400 renders a second.
 */
export const CloudToggle = memo(function CloudToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t } = useTranslation()
  const label = open ? t('liveops.map.hideCloud') : t('liveops.map.showCloud')
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={open}
      onClick={onToggle}
      style={{
        ...glass.overlay, border: 'none', boxShadow: 'var(--rh-shadow-sm)',
        width: 32, height: 32, borderRadius: radius.sm + 1, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: open ? color.selected : glass.overlay.background,
        color: open ? color.accent : color.t1,
      }}
    >
      <Box size={16} strokeWidth={1.75} />
    </button>
  )
})

/**
 * The panel the toggle opens, laid over the map's bottom-right, left of the
 * controls. Closed it renders nothing at all -- nothing mounts, nothing is
 * fetched. Render it as a sibling of the Leaflet container, not inside: its
 * orbit drag and wheel zoom would otherwise pan and zoom the map underneath.
 */
export const CloudPanelOverlay = memo(function CloudPanelOverlay({ open, map, floorIndex }: {
  open: boolean
  map: SiteMap
  floorIndex: number
}) {
  if (!open) return null
  return (
    <div
      style={{
        position: 'absolute', right: 60, bottom: 12, zIndex: 1001,
        width: 'min(520px, calc(100% - 72px))', maxHeight: 'calc(100% - 24px)', overflow: 'auto',
        boxSizing: 'border-box', padding: space[4], borderRadius: radius.md,
        background: color.elevated, boxShadow: 'var(--rh-shadow-sm)',
      }}
    >
      <MapDetailPanel map={map} floorIndex={floorIndex} defaultOpen />
    </div>
  )
})
