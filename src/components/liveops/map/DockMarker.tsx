import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Marker, Tooltip } from 'react-leaflet'
import L from 'leaflet'
import { color } from '@/design-system/tokens'
import { toLatLng } from '@/liveops/mapCoords'

export function DockMarker({ coord }: { coord: { x_m: number; y_m: number } }) {
  const { t } = useTranslation()
  const icon = useMemo(
    () =>
      L.divIcon({
        className: '',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        html: `<div style="width:22px;height:22px;border-radius:6px;background:${color.card};
          border:2px solid ${color.t2};display:flex;align-items:center;justify-content:center;">
          <div style="width:8px;height:8px;border-radius:2px;background:${color.t2};"></div>
        </div>`,
      }),
    [],
  )

  return (
    <Marker position={toLatLng(coord.x_m, coord.y_m)} icon={icon}>
      <Tooltip>{t('liveops.map.dock')}</Tooltip>
    </Marker>
  )
}
