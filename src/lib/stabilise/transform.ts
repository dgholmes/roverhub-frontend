import type { Correction } from './pathSmoother'

/** A 2D affine matrix in canvas `setTransform(a, b, c, d, e, f)` order:
 * x' = a x + c y + e, y' = b x + d y + f. */
export type Affine = [number, number, number, number, number, number]

/**
 * The matrix that draws a frame corrected: rolled by `da` and shifted by
 * (dx, dy) about the centre, then zoomed by 1 / (1 - crop) so the moved edge
 * stays outside the picture. The prototype's `warp()` exactly (its
 * getRotationMatrix2D is given -degrees(da), which is a +da rotation in y-down
 * pixel coordinates).
 *
 * `scale` converts the correction from the units it was measured in (the
 * small estimate image) to the frame's own pixels.
 */
export function correctionMatrix(c: Correction, width: number, height: number, crop: number, scale = 1): Affine {
  const zoom = 1 / (1 - crop)
  const cos = Math.cos(c.da) * zoom, sin = Math.sin(c.da) * zoom
  const cx = width / 2, cy = height / 2
  return [
    cos, sin, -sin, cos,
    cx - (cos * cx - sin * cy) + zoom * c.dx * scale,
    cy - (sin * cx + cos * cy) + zoom * c.dy * scale,
  ]
}

/** Where the matrix sends a point. */
export function applyAffine(m: Affine, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] }
}
