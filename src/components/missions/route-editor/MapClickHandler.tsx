import { useMapEvents } from 'react-leaflet'
import { fromLatLng } from '@/liveops/mapCoords'

/** Click-to-place-waypoint — the interactive counterpart to LiveOps' MapCanvas,
 * which is read-only (docs/05-ui-ux.md §11.2: "MapCanvas is reused from
 * LiveOps but in planning mode"). Renders nothing itself.
 *
 * It places wherever the operator clicks, over free floor or not: whether the
 * spot is open ground is shown on the waypoint afterwards (MissionMapEditor),
 * not decided here, because an operator may rightly plan through a doorway the
 * survey missed. */
export function MapClickHandler({ onAdd }: { onAdd: (x_m: number, y_m: number) => void }) {
  useMapEvents({
    click(e) {
      const { x_m, y_m } = fromLatLng(e.latlng)
      onAdd(x_m, y_m)
    },
  })
  return null
}
