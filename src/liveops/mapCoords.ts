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

/**
 * CSS rotation for an arrow drawn pointing up (+y), from `heading_deg`.
 *
 * heading_deg is body yaw — anticlockwise from +x — while CSS rotate() turns
 * clockwise from up. Rotating by heading_deg directly drew a robot facing +x
 * pointing up, and turned the arrow right when the robot turned left.
 */
export function markerRotationDeg(heading_deg: number): number {
  return 90 - heading_deg
}

/**
 * CSS rotation for the robot's body, which is drawn along **+x** (nose to the
 * right), from `heading_deg`.
 *
 * ⚠️ Not the same as `markerRotationDeg`, and the difference is a quarter
 * turn. That one is for a shape drawn pointing UP; this one is for a shape
 * drawn pointing RIGHT, which is where +x is on the canvas. Both map yaw and
 * the SVG x axis run the same way, and only the sense of rotation differs --
 * yaw is anticlockwise, CSS and SVG turn clockwise -- so this is a plain
 * negation. Using the arrow's rule here would point a robot facing east
 * straight down the screen.
 */
export function bodyRotationDeg(heading_deg: number): number {
  // Written as a subtraction so a heading of 0 gives +0 rather than -0, which
  // would reach the DOM as the string "-0deg".
  return 0 - heading_deg
}

/** The inverse of `toLatLng`: a clicked Leaflet point as map-frame metres. */
export function fromLatLng(latlng: { lat: number; lng: number }): { x_m: number; y_m: number } {
  return { x_m: latlng.lng, y_m: latlng.lat }
}
