import { useMapEvents } from 'react-leaflet'

/** Click-to-place-waypoint — the interactive counterpart to LiveOps' MapCanvas,
 * which is read-only (docs/05-ui-ux.md §11.2: "MapCanvas is reused from
 * LiveOps but in planning mode"). Renders nothing itself. */
export function MapClickHandler({ onAdd }: { onAdd: (x_m: number, y_m: number) => void }) {
  useMapEvents({
    click(e) {
      onAdd(e.latlng.lng, e.latlng.lat)
    },
  })
  return null
}
