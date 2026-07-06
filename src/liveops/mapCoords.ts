import type { LatLngExpression } from 'leaflet'

/**
 * Ground-robot positions are dead-reckoned meters relative to a site origin —
 * there is no GPS in MVP (docs/25.4 map stack, unresolved; see project
 * assumption: offline synthetic plan under CRS.Simple). Leaflet's CRS.Simple
 * treats [lat, lng] as plain cartesian [y, x], so meters map 1:1 to map units.
 */
export function toLatLng(x_m: number, y_m: number): LatLngExpression {
  return [y_m, x_m]
}
