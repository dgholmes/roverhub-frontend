import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { color, font, radius, space } from '@/design-system/tokens'
import { useThemeStamp } from '@/components/liveops/map/useFloorCanvas'
import { parseColour } from '@/scene3d/paintFloor'
import { resolveScenePalette } from '@/scene3d/palette'
import { countSurveyCells, paintSurveyCells, surveyColours } from '@/survey/surveyColours'
import { formatArea, worldToCell } from '@/survey/surveyModel'
import { useDecodedSurveyMap, useSurveyMap, type DecodedSurveyMap } from '@/survey/useSurvey'

/** Room kept around the map inside the pane, px. */
const PAD = 16

/** Where the image sits in the pane: its scale (px per cell) and top-left. */
export function fitView(imgW: number, imgH: number, paneW: number, paneH: number): { scale: number; x: number; y: number } {
  const scale = Math.max(0.01, Math.min((paneW - PAD * 2) / imgW, (paneH - PAD * 2) / imgH))
  return { scale, x: (paneW - imgW * scale) / 2, y: (paneH - imgH * scale) / 2 }
}

/**
 * The live survey map: what the robot's lidar has seen so far, top down, with
 * the path it walked and where it is now. Repainted on every frame (about
 * every 2 s), fitted to the pane. Walls white, open floor blue, unseen ground
 * left dark with its edge marked (surveyColours).
 *
 * `compact` drops the legend and notes, for LiveOps' small map inset.
 */
export function SurveyLiveMap({ robotId, compact = false }: { robotId: string; compact?: boolean }) {
  const { t } = useTranslation()
  const frame = useSurveyMap(robotId)
  const { map, error } = useDecodedSurveyMap(frame)
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const theme = useThemeStamp()

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const counts = useMemo(() => (map ? countSurveyCells(map.image.pixels) : null), [map])
  const coveredM2 = map && counts ? counts.open * map.frame.resolution_m * map.frame.resolution_m : 0

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !map || !size.w || !size.h) return
    drawSurvey(canvas, map, size.w, size.h, wrapRef.current ?? undefined)
  }, [map, size, theme])

  return (
    <div
      ref={wrapRef}
      data-survey-map
      data-seq={map?.frame.seq ?? ''}
      data-open-cells={counts?.open ?? ''}
      data-occupied-cells={counts?.occupied ?? ''}
      role="img"
      aria-label={t('survey.live.mapAria', { area: formatArea(coveredM2) })}
      style={{ position: 'relative', width: '100%', height: '100%', background: color.sceneBg, overflow: 'hidden' }}
    >
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
      {!map && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: color.t3, fontSize: compact ? font.size.sm : font.size.md, padding: space[4], textAlign: 'center',
        }}>
          {t('survey.live.waitingMap')}
        </div>
      )}
      {error && (
        <div role="status" style={{
          position: 'absolute', top: space[2], left: space[2], right: space[2], padding: `${space[1]}px ${space[2]}px`,
          borderRadius: radius.sm, background: color.amberBg, color: color.t1, fontSize: font.size.xs,
        }}>
          {t('survey.live.mapError', { error })}
        </div>
      )}
      {!compact && <Legend />}
    </div>
  )
}

function Legend() {
  const { t } = useTranslation()
  const swatch = (bg: string) => (
    <span aria-hidden style={{ width: 10, height: 10, borderRadius: 2, background: bg, flexShrink: 0 }} />
  )
  const item: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6 }
  return (
    <div className="rh-on-video" style={{
      position: 'absolute', left: space[3], bottom: space[3], display: 'flex', flexWrap: 'wrap', gap: space[3],
      padding: `${space[1] + 2}px ${space[2] + 2}px`, borderRadius: radius.md, background: color.overlay,
      fontSize: font.size.xs, color: color.t2, maxWidth: 'calc(100% - 24px)',
    }}>
      <span style={item}>{swatch(color.sceneWall)}{t('survey.live.legendOccupied')}</span>
      <span style={item}>{swatch(`color-mix(in srgb, ${color.sceneFloor} 78%, ${color.accent})`)}{t('survey.live.legendOpen')}</span>
      <span style={item}>{swatch(`color-mix(in srgb, ${color.sceneBg} 65%, ${color.amber})`)}{t('survey.live.legendFrontier')}</span>
    </div>
  )
}

/** Paint the cells, the path and the robot onto `canvas`, fitted to w x h CSS px. */
function drawSurvey(canvas: HTMLCanvasElement, map: DecodedSurveyMap, w: number, h: number, themed?: Element): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return // jsdom, or a canvas the browser refused
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
  canvas.width = Math.round(w * dpr)
  canvas.height = Math.round(h * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, w, h)

  const palette = resolveScenePalette(themed)
  const { frame, image } = map
  const cells = document.createElement('canvas')
  cells.width = image.width
  cells.height = image.height
  const cctx = cells.getContext('2d')
  if (!cctx) return
  const rgba = paintSurveyCells(image.pixels, image.width, image.height, surveyColours(palette))
  cctx.putImageData(new ImageData(rgba, image.width, image.height), 0, 0)

  const view = fitView(image.width, image.height, w, h)
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(cells, view.x, view.y, image.width * view.scale, image.height * view.scale)

  const toPx = (x: number, y: number): [number, number] => {
    const [c, r] = worldToCell(frame, x, y)
    return [view.x + c * view.scale, view.y + r * view.scale]
  }

  if (frame.path.length > 1) {
    ctx.strokeStyle = palette.track
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.beginPath()
    frame.path.forEach(([x, y], i) => {
      const [px, py] = toPx(x, y)
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    })
    ctx.stroke()
  }

  if (frame.pose) {
    const [px, py] = toPx(frame.pose.x_m, frame.pose.y_m)
    // Screen y runs down while world y runs up, so the heading's sign flips.
    const a = -frame.pose.yaw_rad
    const accent = parseColour(palette.accent) ? palette.accent : '#0a84ff'
    ctx.fillStyle = accent
    ctx.strokeStyle = palette.bg
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(px + Math.cos(a) * 11, py + Math.sin(a) * 11)
    ctx.lineTo(px + Math.cos(a + 2.5) * 7, py + Math.sin(a + 2.5) * 7)
    ctx.lineTo(px + Math.cos(a - 2.5) * 7, py + Math.sin(a - 2.5) * 7)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(px, py, 4, 0, Math.PI * 2)
    ctx.fill()
  }
}
