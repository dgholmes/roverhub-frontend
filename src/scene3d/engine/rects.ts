import type { SceneGrid } from '../types'

/** A block of cells [i0, i1) x [j0, j1). */
export interface CellRect { i0: number; i1: number; j0: number; j1: number }

/**
 * Merge the cells with `bit` set into rectangles, as the options page does:
 * each row's runs, stacked onto the run above when it spans exactly the same
 * columns. Every set cell lands in exactly one rectangle. Walls and furniture
 * become one box per rectangle instead of one per cell.
 */
export function mergeRects(grid: Pick<SceneGrid, 'w' | 'h' | 'bits'>, bit: number): CellRect[] {
  const { w, h, bits } = grid
  const out: CellRect[] = []
  let open = new Map<number, CellRect>()
  for (let j = 0; j < h; j++) {
    const next = new Map<number, CellRect>()
    let i = 0
    while (i < w) {
      if (bits[j * w + i] & bit) {
        const s = i
        while (i < w && (bits[j * w + i] & bit)) i++
        const key = s * 65536 + i
        const r = open.get(key)
        if (r) { r.j1 = j + 1; next.set(key, r) }
        else { const nr = { i0: s, i1: i, j0: j, j1: j + 1 }; out.push(nr); next.set(key, nr) }
      } else i++
    }
    open = next
  }
  return out
}
