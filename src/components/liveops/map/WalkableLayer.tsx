import { memo, useEffect, useState } from 'react'
import { ImageOverlay } from 'react-leaflet'
import type L from 'leaflet'
import { useThemeStore } from '@/lib/theme'
import { boundsForFloor } from '@/liveops/mapFloor'
import { themeRgb, type Rgb } from '@/liveops/cssColor'
import { CELL_TIGHT, CELL_WALKABLE, type WalkableAnalysis } from '@/liveops/walkable'
import type { MapFloor } from '@/types/maps'

/** Per-pixel alpha: a tint over the floorplan, not a fill that hides it. Tight
 * is stronger, since it is the one that explains a refusal. */
const WALKABLE_ALPHA = 0.3
const TIGHT_ALPHA = 0.5
/** Over the painted floor, which already tints walkable cells: only the tight
 * band, faintly, so the map keeps the scene's look (user, 2026-11-12: the
 * doubled blue and thick amber bands looked nothing like the design). */
const TIGHT_ONLY_ALPHA = 0.3
const FALLBACK_BLUE: Rgb = [10, 132, 255]
const FALLBACK_AMBER: Rgb = [255, 159, 10]

/**
 * The mask as RGBA pixels: green where walkable, amber where tight, clear
 * elsewhere. Row 0 is the top of the floor, as the grid and the image are.
 * Exported for tests.
 */
export function walkablePixels(
  analysis: Pick<WalkableAnalysis, 'mask'>, green: Rgb, amber: Rgb, tightOnly = false,
): Uint8ClampedArray<ArrayBuffer> {
  const { mask } = analysis
  const out = new Uint8ClampedArray(new ArrayBuffer(mask.length * 4))
  const ga = tightOnly ? 0 : Math.round(WALKABLE_ALPHA * 255)
  const aa = Math.round((tightOnly ? TIGHT_ONLY_ALPHA : TIGHT_ALPHA) * 255)
  for (let i = 0; i < mask.length; i++) {
    const m = mask[i]
    if (m === CELL_WALKABLE && ga > 0) { out[i * 4] = green[0]; out[i * 4 + 1] = green[1]; out[i * 4 + 2] = green[2]; out[i * 4 + 3] = ga }
    else if (m === CELL_TIGHT) { out[i * 4] = amber[0]; out[i * 4 + 1] = amber[1]; out[i * 4 + 2] = amber[2]; out[i * 4 + 3] = aa }
  }
  return out
}

/** The mask drawn into an image, as an object URL, or null where a canvas is
 * unavailable. Encoded off the render path (toBlob is asynchronous). */
function maskImageUrl(analysis: WalkableAnalysis, green: Rgb, amber: Rgb, tightOnly: boolean): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const canvas = document.createElement('canvas')
      canvas.width = analysis.width
      canvas.height = analysis.height
      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(null); return }
      ctx.putImageData(new ImageData(walkablePixels(analysis, green, amber, tightOnly), analysis.width, analysis.height), 0, 0)
      canvas.toBlob((blob) => resolve(blob ? URL.createObjectURL(blob) : null), 'image/png')
    } catch {
      resolve(null)
    }
  })
}

/** Cell edges stay crisp when zoomed in: one image pixel is one 5 cm cell. The
 * element exists once the overlay is on the map. */
const PIXELATED: L.LeafletEventHandlerFnMap = {
  add: (e) => {
    const img = (e.target as L.ImageOverlay).getElement()
    if (img) img.style.imageRendering = 'pixelated'
  },
}

/**
 * Where the robot may walk on the shown floor, over the floorplan and under
 * every vector and marker: the planning grid's walkable cells in the accent blue (the map scene's
 * walkable tint), the
 * free-but-too-tight ones in amber, nothing elsewhere. Aligned exactly as the
 * floorplan image is (`boundsForFloor`), drawn cell for cell (no smoothing),
 * and re-tinted when the theme changes. Memoized: MapCanvas re-renders on every
 * telemetry frame, and the analysis does not change with it.
 */
export const WalkableLayer = memo(function WalkableLayer({ analysis, floor, tightOnly = false }: {
  analysis: WalkableAnalysis
  floor: MapFloor
  /** The floor is painted in the scene's colours, walkable tint included: draw only the tight band. */
  tightOnly?: boolean
}) {
  const theme = useThemeStore((s) => s.theme)
  const [image, setImage] = useState<{ analysis: WalkableAnalysis; theme: string; tightOnly: boolean; url: string } | null>(null)

  useEffect(() => {
    let current = true
    let made: string | null = null
    void maskImageUrl(analysis, themeRgb('accent', FALLBACK_BLUE), themeRgb('amber', FALLBACK_AMBER), tightOnly).then((url) => {
      if (!url) return
      if (!current) { URL.revokeObjectURL(url); return }
      made = url
      setImage({ analysis, theme, tightOnly, url })
    })
    return () => {
      current = false
      if (made) URL.revokeObjectURL(made)
    }
  }, [analysis, theme, tightOnly])

  if (!image || image.analysis !== analysis || image.theme !== theme || image.tightOnly !== tightOnly) return null
  return (
    <ImageOverlay
      url={image.url}
      bounds={boundsForFloor(floor)}
      // Over the floorplan (-2), under the grid lines, zones and markers.
      zIndex={-1}
      interactive={false}
      eventHandlers={PIXELATED}
    />
  )
})
