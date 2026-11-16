/**
 * The flat editor's view: which map point is at the canvas centre and how many
 * CSS pixels a metre is. North up. Pure, so pan, zoom and "zoom to this spot"
 * are tested without a canvas.
 */
export interface CanvasView {
  /** Map point at the canvas centre. */
  cx: number
  cy: number
  /** CSS pixels per metre. */
  s: number
}

export const MIN_SCALE = 4
export const MAX_SCALE = 600

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s))

export function toScreen(v: CanvasView, W: number, H: number, x: number, y: number): [number, number] {
  return [W / 2 + (x - v.cx) * v.s, H / 2 - (y - v.cy) * v.s]
}

export function toMap(v: CanvasView, W: number, H: number, sx: number, sy: number): [number, number] {
  return [v.cx + (sx - W / 2) / v.s, v.cy - (sy - H / 2) / v.s]
}

/** The whole of a box (map metres) in view, with a margin of CSS pixels. */
export function fitBox(x0: number, y0: number, x1: number, y1: number, W: number, H: number, margin = 24): CanvasView {
  const bw = Math.max(x1 - x0, 0.5), bh = Math.max(y1 - y0, 0.5)
  const s = clampScale(Math.min((W - 2 * margin) / bw, (H - 2 * margin) / bh))
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, s: Number.isFinite(s) && s > 0 ? s : MIN_SCALE }
}

/** Zoom by `k` keeping the map point under (sx, sy) where it is. */
export function zoomAt(v: CanvasView, W: number, H: number, k: number, sx: number, sy: number): CanvasView {
  const [mx, my] = toMap(v, W, H, sx, sy)
  const s = clampScale(v.s * k)
  // The same map point under the same pixel at the new scale.
  return { s, cx: mx - (sx - W / 2) / s, cy: my + (sy - H / 2) / s }
}

/** Move the view by a drag of (dx, dy) CSS pixels. */
export function panBy(v: CanvasView, dx: number, dy: number): CanvasView {
  return { ...v, cx: v.cx - dx / v.s, cy: v.cy + dy / v.s }
}

/** Centre on a spot and zoom so a ring of `radiusM` fills about a sixth of the
 *  shorter side, never zooming out from a closer view the operator chose. */
export function focusOn(v: CanvasView, W: number, H: number, x: number, y: number, radiusM: number): CanvasView {
  const want = clampScale(Math.min(W, H) / 6 / Math.max(radiusM, 0.05))
  return { cx: x, cy: y, s: Math.max(v.s, Math.min(want, 240)) }
}
