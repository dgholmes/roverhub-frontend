import type { SceneGrid } from '../types'

/** The minimap canvas's backing width; the page drew 336 px into a 168 px
 * box (2x for sharpness). The height follows the framed area's aspect. */
export const MINIMAP_W = 336
/** Tallest backing height: a long narrow floor shrinks its width instead. */
export const MINIMAP_MAX_H = 420

/** The map-metre box the minimap shows. */
export interface MinimapFrame { x0: number; y0: number; x1: number; y1: number }

/**
 * The grid's content box plus a margin of `padCells`, clamped to the grid.
 * The page's grid was cropped to its floor; this one is the survey's whole
 * grid, which can be mostly empty, so the minimap frames the content.
 */
export function minimapFrame(grid: SceneGrid, padCells = 10): MinimapFrame {
  const { minX, minY, maxX, maxY } = grid.content
  const i0 = Math.max(0, minX - padCells), j0 = Math.max(0, minY - padCells)
  const i1 = Math.min(grid.w, maxX + 1 + padCells), j1 = Math.min(grid.h, maxY + 1 + padCells)
  const [ox, oy] = grid.origin
  return { x0: ox + i0 * grid.res, y0: oy + j0 * grid.res, x1: ox + i1 * grid.res, y1: oy + j1 * grid.res }
}

/** Backing size for a frame: 336 px wide unless that would be taller than
 * 420 px. */
export function minimapSize(frame: MinimapFrame): { w: number; h: number } {
  const aspect = (frame.y1 - frame.y0) / Math.max(1e-6, frame.x1 - frame.x0)
  let w = MINIMAP_W, h = Math.round(w * aspect)
  if (h > MINIMAP_MAX_H) { h = MINIMAP_MAX_H; w = Math.round(h / aspect) }
  return { w: Math.max(1, w), h: Math.max(1, h) }
}

/** Map point -> minimap pixel (north up). */
export function minimapPoint(frame: MinimapFrame, mmW: number, mmH: number, x: number, y: number): [number, number] {
  return [
    ((x - frame.x0) / (frame.x1 - frame.x0)) * mmW,
    (1 - (y - frame.y0) / (frame.y1 - frame.y0)) * mmH,
  ]
}

/** A click at fractions (fx, fy) of the minimap's box -> map point. */
export function minimapToMap(frame: MinimapFrame, fx: number, fy: number): { x: number; y: number } {
  return {
    x: frame.x0 + fx * (frame.x1 - frame.x0),
    y: frame.y0 + (1 - fy) * (frame.y1 - frame.y0),
  }
}

/** The screen angle of the fly camera's view direction on the minimap. */
export const minimapHeading = (flyYaw: number): number => -flyYaw - Math.PI / 2

/** Where `frame` sits on the painted floor canvas (north up, one pixel per
 * cell): the source rectangle for drawing it. */
export function floorSourceRect(grid: SceneGrid, frame: MinimapFrame): { sx: number; sy: number; sw: number; sh: number } {
  const [ox, oy] = grid.origin
  return {
    sx: (frame.x0 - ox) / grid.res,
    sy: grid.h - (frame.y1 - oy) / grid.res,
    sw: (frame.x1 - frame.x0) / grid.res,
    sh: (frame.y1 - frame.y0) / grid.res,
  }
}

/**
 * The minimap's still part: background, the painted floor, the route (amber
 * legs where it leaves the walkable area) and a dot per waypoint. Drawn once
 * per change into an offscreen canvas; the view cone goes on top each frame.
 */
export function drawMinimapBase(
  ctx: CanvasRenderingContext2D, floor: CanvasImageSource, grid: SceneGrid, frame: MinimapFrame, w: number, h: number,
  route: readonly { x: number; y: number }[], blocked: readonly boolean[],
  colours: { bg: string; accent: string; amber: string },
): void {
  ctx.fillStyle = colours.bg
  ctx.fillRect(0, 0, w, h)
  ctx.imageSmoothingEnabled = true
  const s = floorSourceRect(grid, frame)
  ctx.drawImage(floor, s.sx, s.sy, s.sw, s.sh, 0, 0, w, h)
  const pt = (p: { x: number; y: number }) => minimapPoint(frame, w, h, p.x, p.y)
  if (route.length > 1) {
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    for (let k = 1; k < route.length; k++) {
      ctx.strokeStyle = blocked[k - 1] ? colours.amber : colours.accent
      ctx.beginPath()
      ctx.moveTo(...pt(route[k - 1]))
      ctx.lineTo(...pt(route[k]))
      ctx.stroke()
    }
  }
  ctx.fillStyle = colours.accent
  for (const p of route) {
    const [x, y] = pt(p)
    ctx.beginPath()
    ctx.arc(x, y, 4, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** The moving part: the viewpoint as a dot with a 1.2 rad cone. */
export function drawMinimapView(
  ctx: CanvasRenderingContext2D, base: CanvasImageSource, x: number, y: number, dir: number, accent: string,
): void {
  ctx.drawImage(base, 0, 0)
  ctx.save()
  ctx.globalAlpha = 0.28
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.arc(x, y, 46, dir - 0.6, dir + 0.6)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
  ctx.fillStyle = accent
  ctx.beginPath()
  ctx.arc(x, y, 6, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 2
  ctx.stroke()
}
