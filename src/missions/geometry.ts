/** Plane geometry on the map frame (metres), for mission checks. */

export interface P { x_m: number; y_m: number }

export function dist(a: P, b: P): number {
  return Math.hypot(a.x_m - b.x_m, a.y_m - b.y_m)
}

/** Ray casting; points exactly on an edge may land either side. */
export function pointInPolygon(p: P, poly: P[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j]
    if ((a.y_m > p.y_m) !== (b.y_m > p.y_m)
      && p.x_m < ((b.x_m - a.x_m) * (p.y_m - a.y_m)) / (b.y_m - a.y_m) + a.x_m) inside = !inside
  }
  return inside
}

function pointSegmentDist(p: P, a: P, b: P): number {
  const dx = b.x_m - a.x_m, dy = b.y_m - a.y_m
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x_m - a.x_m) * dx + (p.y_m - a.y_m) * dy) / len2))
  return Math.hypot(p.x_m - (a.x_m + t * dx), p.y_m - (a.y_m + t * dy))
}

function cross(o: P, a: P, b: P): number {
  return (a.x_m - o.x_m) * (b.y_m - o.y_m) - (a.y_m - o.y_m) * (b.x_m - o.x_m)
}

function segmentsIntersect(a: P, b: P, c: P, d: P): boolean {
  const d1 = cross(c, d, a), d2 = cross(c, d, b), d3 = cross(a, b, c), d4 = cross(a, b, d)
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))
}

/** Shortest distance from the segment a→b to the polygon; 0 when it touches
 * or enters it. */
export function segmentPolygonDist(a: P, b: P, poly: P[]): number {
  if (pointInPolygon(a, poly) || pointInPolygon(b, poly)) return 0
  let best = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const c = poly[j], d = poly[i]
    if (segmentsIntersect(a, b, c, d)) return 0
    best = Math.min(best, pointSegmentDist(a, c, d), pointSegmentDist(b, c, d), pointSegmentDist(c, a, b), pointSegmentDist(d, a, b))
  }
  return best
}

/** Distance from a point to a polygon; 0 inside. */
export function pointPolygonDist(p: P, poly: P[]): number {
  if (pointInPolygon(p, poly)) return 0
  let best = Infinity
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) best = Math.min(best, pointSegmentDist(p, poly[j], poly[i]))
  return best
}
