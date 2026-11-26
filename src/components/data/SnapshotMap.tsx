import { useEffect } from 'react'
import { MapContainer, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import { useTranslation } from 'react-i18next'
import { color, space } from '@/design-system/tokens'
import { Badge } from '@/components/kit'
import { GridLayer } from '@/components/liveops/map/GridLayer'
import { FloorplanLayer } from '@/components/liveops/map/FloorplanLayer'
import { GeofenceLayer } from '@/components/liveops/map/GeofenceLayer'
import { NoGoZoneLayer } from '@/components/liveops/map/NoGoZoneLayer'
import { MAP_BOUNDS } from '@/components/liveops/map/MapCanvas'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { toLatLng } from '@/liveops/mapCoords'
import { boundsForFloor } from '@/liveops/mapFloor'
import { useSiteMaps } from '@/missions/useMissionMap'
import { useFitExtent } from '@/components/missions/route-editor/useFitExtent'
import { useSessionStore } from '@/store/useSessionStore'
import { hasUsablePosition } from '@/data/mediaLibrary'
import type { SnapshotRecord } from '@/types'

/** Frames the map on `bounds` once, and again when `fitKey` changes (a new map,
 * or the surveyed extent arriving), until the operator pans or zooms. */
function FitTo({ bounds, fitKey }: { bounds: L.LatLngBoundsLiteral | undefined; fitKey: string }) {
  const map = useMap()
  useEffect(() => {
    if (!bounds) return
    let touched = false
    const mark = () => { touched = true }
    map.invalidateSize({ animate: false })
    map.fitBounds(bounds, { padding: [24, 24], animate: false })
    map.on('dragstart', mark)
    const el = map.getContainer()
    el.addEventListener('wheel', mark, { passive: true })
    const ro = new ResizeObserver(() => { if (!touched) map.fitBounds(bounds, { padding: [24, 24], animate: false }) })
    ro.observe(el)
    return () => { map.off('dragstart', mark); el.removeEventListener('wheel', mark); ro.disconnect() }
    // `bounds` is read when fitting; `fitKey` says when it is a different question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitKey])
  return null
}

/**
 * Snapshots pinned where the robot thought it was when it took them, on the
 * site's own map (its floor plan, framed on where it was surveyed) rather than
 * a blank grid (operator, 2026-11-26). With no map at the site: the grid, as before. Only
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
  const siteId = useSessionStore((s) => s.activeSiteId)
  // The map the selected robot runs, else the site's newest active one (pickSiteMap).
  const { shown: siteMap } = useSiteMaps(siteId)
  const floor = siteMap?.floors[0]
  const fit = useFitExtent(siteMap, floor?.index, floor ? boundsForFloor(floor) : undefined)
  return (
    <div style={{ position: 'relative', height: 520, borderRadius: 10, overflow: 'hidden', border: `1px solid ${color.border}` }}>
      <MapContainer
        crs={L.CRS.Simple} bounds={MAP_BOUNDS} style={{ height: '100%', width: '100%', background: color.mapBg }}
        zoomControl={false} attributionControl={false} minZoom={1} maxZoom={7} zoomSnap={0.25}
      >
        {siteMap && floor ? (
          <>
            <FitTo bounds={fit.extent} fitKey={`${siteMap.map_id}:${floor.index}:${fit.fitKeySuffix}`} />
            <FloorplanLayer map={siteMap} floorIndex={floor.index} captions={false} />
            <GeofenceLayer zones={siteMap.zones} />
            <NoGoZoneLayer zones={siteMap.zones} />
          </>
        ) : (
          <>
            <GridLayer bounds={MAP_BOUNDS} />
            {/* The provider's sample site: the mock site in mock mode, nothing on the real backend. */}
            <GeofenceLayer zones={dataProvider.sampleSite().zones} />
            <NoGoZoneLayer zones={dataProvider.sampleSite().zones} />
          </>
        )}
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
