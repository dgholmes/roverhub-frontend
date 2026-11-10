import { MapContainer, CircleMarker, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import { useTranslation } from 'react-i18next'
import { color, space } from '@/design-system/tokens'
import { Badge } from '@/components/kit'
import { GridLayer } from '@/components/liveops/map/GridLayer'
import { GeofenceLayer } from '@/components/liveops/map/GeofenceLayer'
import { NoGoZoneLayer } from '@/components/liveops/map/NoGoZoneLayer'
import { MAP_BOUNDS } from '@/components/liveops/map/MapCanvas'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { toLatLng } from '@/liveops/mapCoords'
import { hasUsablePosition } from '@/data/mediaLibrary'
import type { SnapshotRecord } from '@/types'

/**
 * Snapshots pinned where the robot thought it was when it took them. Only
 * positions the bridge marked usable are drawn: a "lost" position is a
 * placeholder 0,0, not a place. Every pin is an estimate (dead reckoning),
 * and the map says so.
 */
export function SnapshotMap({ items, nameOf, onOpen }: {
  items: SnapshotRecord[]
  nameOf: Record<string, string>
  onOpen: (s: SnapshotRecord) => void
}) {
  const { t } = useTranslation()
  const placed = items.filter(hasUsablePosition)
  return (
    <div style={{ position: 'relative', height: 520, borderRadius: 10, overflow: 'hidden', border: `1px solid ${color.border}` }}>
      <MapContainer
        crs={L.CRS.Simple} bounds={MAP_BOUNDS} style={{ height: '100%', width: '100%', background: color.mapBg }}
        zoomControl={false} attributionControl={false} minZoom={2} maxZoom={7}
      >
        <GridLayer bounds={MAP_BOUNDS} />
        {/* The provider's sample site: the mock site in mock mode, nothing on the real backend. */}
        <GeofenceLayer zones={dataProvider.sampleSite().zones} />
        <NoGoZoneLayer zones={dataProvider.sampleSite().zones} />
        {placed.map((s) => (
          <CircleMarker
            key={s.snapshot_id} center={toLatLng(s.position!.x_m, s.position!.y_m)} radius={6}
            pathOptions={{ color: color.accent, weight: 2, fillColor: color.accent, fillOpacity: 0.5 }}
            eventHandlers={{ click: () => onOpen(s) }}
          >
            <Tooltip direction="top" offset={[0, -6]}>{`${nameOf[s.robot_id] ?? s.robot_id} · ${new Date(s.captured_at ?? s.received_at).toLocaleString()}`}</Tooltip>
          </CircleMarker>
        ))}
      </MapContainer>
      <div style={{ position: 'absolute', left: space[3], bottom: space[3], display: 'flex', gap: space[2], zIndex: 500, pointerEvents: 'none' }}>
        <Badge tone="amber">{t('fleetDetail.dataWs.mapEstimated')}</Badge>
        {placed.length < items.length && <Badge>{t('fleetDetail.dataWs.mapUnplaced', { count: items.length - placed.length })}</Badge>}
      </div>
    </div>
  )
}
