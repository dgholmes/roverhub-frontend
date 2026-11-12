import type { SceneGrid } from '../types'

/** A grid for tests: `rows` top row first (north up, as drawn), one character
 * per cell: '.' walkable+known, 'W' wall+known, 'F' furniture+known,
 * 'k' known only, ' ' unknown. */
export function gridFrom(rows: string[], res = 1, origin: [number, number] = [0, 0]): SceneGrid {
  const h = rows.length, w = rows[0].length
  const bits = new Uint8Array(w * h)
  for (let r = 0; r < h; r++) {
    const j = h - 1 - r
    for (let i = 0; i < w; i++) {
      const c = rows[r][i]
      bits[j * w + i] = c === '.' ? 9 : c === 'W' ? 10 : c === 'F' ? 12 : c === 'k' ? 8 : 0
    }
  }
  return { w, h, res, origin, bits, content: { minX: 0, minY: 0, maxX: w - 1, maxY: h - 1 } }
}
