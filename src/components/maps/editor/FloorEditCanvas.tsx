import { useCallback, useEffect, useRef, useState } from 'react'
import { color } from '@/design-system/tokens'
import { useThemeStamp } from '@/components/liveops/map/useFloorCanvas'
import { paintFloor } from '@/scene3d/paintFloor'
import { resolveScenePalette } from '@/scene3d/palette'
import type { ScenePalette, SceneGrid } from '@/scene3d/types'
import type { MovedBlob } from '@/types/mapPipeline'
import { fitBox, focusOn, panBy, toMap, toScreen, zoomAt, type CanvasView } from './canvasView'
import type { BlobDecision } from './editSession'
import { cellsAlongStroke, cellsInDisc, cellsInRect, type BrushShape, type FloorFrame } from './gridEdit'
import { blobAt, blobOutline, blobRingRadius } from './movedLayer'

export type EditorMode = 'move' | 'erase' | 'restore'

export interface EditorTool {
  mode: EditorMode
  shape: BrushShape
  /** Brush diameter in cells. */
  size: number
}

/** What a stroke does to the grid, in order: begin, cells (any number), end. */
export type StrokeEvent =
  | { kind: 'begin' }
  | { kind: 'cells'; indices: number[] }
  | { kind: 'end' }

type Drag =
  | { kind: 'pan'; x: number; y: number; x0: number; y0: number; moved: boolean; button: number }
  | { kind: 'brush'; last: [number, number] }
  | { kind: 'box'; a: [number, number]; b: [number, number] }

/**
 * The flat floor as the editor paints it (paintFloor's colours), with the
 * moved spots in amber over it and the selected one ringed. Erase and Restore
 * paint with a round brush or a box; Move pans (and a click picks a spot).
 * Right or middle drag always pans, the wheel zooms about the pointer.
 *
 * Drawn on one canvas: the floor is painted cell for cell into an offscreen
 * canvas when the grid changes, and drawn scaled without smoothing, so cells
 * stay square at any zoom. Brush cells are batched per animation frame before
 * they reach the parent, which repaints the grid at most once a frame.
 */
export function FloorEditCanvas({
  grid, frame, blobs, decisions, selectedId, focus, tool, canPaint, onSelect, onStroke, onUndo, label,
}: {
  grid: SceneGrid
  frame: FloorFrame
  blobs: readonly MovedBlob[]
  decisions: Readonly<Record<string, BlobDecision>>
  selectedId: string | null
  /** Centre on this spot when `n` changes. */
  focus: { id: string; n: number } | null
  tool: EditorTool
  canPaint: boolean
  onSelect: (id: string | null) => void
  onStroke: (e: StrokeEvent) => void
  onUndo: () => void
  label: string
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const floorRef = useRef<HTMLCanvasElement | null>(null)
  const paletteRef = useRef<ScenePalette>(resolveScenePalette())
  const [size, setSize] = useState({ W: 0, H: 0 })
  const sizeRef = useRef(size)
  sizeRef.current = size
  const viewRef = useRef<CanvasView | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const cursorRef = useRef<[number, number] | null>(null)
  const pending = useRef<number[] | null>(null)
  const raf = useRef(0)
  const theme = useThemeStamp()

  // Latest props for the draw and the handlers, without re-binding them.
  const props = useRef({ grid, frame, blobs, decisions, selectedId, tool, canPaint, onSelect, onStroke, onUndo })
  props.current = { grid, frame, blobs, decisions, selectedId, tool, canPaint, onSelect, onStroke, onUndo }

  const draw = useCallback(() => {
    raf.current = 0
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const v = viewRef.current
    if (!canvas || !ctx || !v) return
    const { W, H } = sizeRef.current
    const dpr = window.devicePixelRatio || 1
    const P = paletteRef.current
    const { frame: f, blobs: bs, decisions: ds, selectedId: sel, tool: tl } = props.current
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = P.bg
    ctx.fillRect(0, 0, W, H)
    const floor = floorRef.current
    if (floor) {
      const [x0, y0] = toScreen(v, W, H, f.origin[0], f.origin[1] + f.h * f.res)
      ctx.imageSmoothingEnabled = false
      ctx.drawImage(floor, x0, y0, f.w * f.res * v.s, f.h * f.res * v.s)
    }
    // Moved spots: amber; staged for removal, hatched out; kept, grey.
    for (const b of bs) {
      const d = ds[b.id]
      const pts = blobOutline(b).map(([x, y]) => toScreen(v, W, H, x, y))
      ctx.beginPath()
      pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)))
      ctx.closePath()
      ctx.globalAlpha = d === 'remove' ? 0.25 : d === 'keep' ? 0.35 : 0.85
      ctx.fillStyle = d === 'keep' ? '#8e8e93' : P.amber
      ctx.fill()
      ctx.globalAlpha = 1
      ctx.lineWidth = 1.5
      ctx.setLineDash(d === 'remove' ? [4, 3] : [])
      ctx.strokeStyle = d === 'keep' ? '#8e8e93' : P.amber
      ctx.stroke()
      ctx.setLineDash([])
      // A speck smaller than a few pixels still gets a visible dot.
      if (!d) {
        const [cx, cy] = toScreen(v, W, H, b.centroid[0], b.centroid[1])
        ctx.beginPath()
        ctx.arc(cx, cy, 3, 0, Math.PI * 2)
        ctx.fillStyle = P.amber
        ctx.fill()
      }
    }
    const selected = sel ? bs.find((b) => b.id === sel) : undefined
    if (selected) {
      const [cx, cy] = toScreen(v, W, H, selected.centroid[0], selected.centroid[1])
      ctx.beginPath()
      ctx.arc(cx, cy, Math.max(14, blobRingRadius(selected) * v.s), 0, Math.PI * 2)
      ctx.lineWidth = 2.5
      ctx.strokeStyle = P.accent
      ctx.stroke()
    }
    // The brush under the pointer, or the box being dragged.
    const drag = dragRef.current
    if (drag?.kind === 'box') {
      const [ax, ay] = toScreen(v, W, H, drag.a[0], drag.a[1])
      const [bx, by] = toScreen(v, W, H, drag.b[0], drag.b[1])
      ctx.setLineDash([5, 4])
      ctx.lineWidth = 1.5
      ctx.strokeStyle = tl.mode === 'restore' ? P.red : P.accent
      ctx.fillStyle = tl.mode === 'restore' ? 'rgba(255,69,58,0.12)' : 'rgba(10,132,255,0.12)'
      ctx.fillRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay))
      ctx.strokeRect(Math.min(ax, bx), Math.min(ay, by), Math.abs(bx - ax), Math.abs(by - ay))
      ctx.setLineDash([])
    } else if (cursorRef.current && tl.mode !== 'move' && tl.shape === 'brush' && props.current.canPaint) {
      const [mx, my] = cursorRef.current
      const [sx, sy] = toScreen(v, W, H, mx, my)
      ctx.beginPath()
      ctx.arc(sx, sy, Math.max(2, (tl.size / 2) * f.res * v.s), 0, Math.PI * 2)
      ctx.lineWidth = 1.5
      ctx.strokeStyle = tl.mode === 'restore' ? P.red : P.accent
      ctx.stroke()
    }
  }, [])

  const requestDraw = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(draw)
  }, [draw])
  // After a render: draw now rather than on the next frame, so the canvas
  // never waits on an animation frame a hidden or background page withholds.
  const drawNow = useCallback(() => {
    if (raf.current) { cancelAnimationFrame(raf.current); raf.current = 0 }
    draw()
  }, [draw])
  useEffect(() => () => { if (raf.current) cancelAnimationFrame(raf.current) }, [])

  // Size the canvas to its box, at the device's pixel ratio.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const measure = () => setSize({ W: host.clientWidth, H: host.clientHeight })
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(host)
    return () => ro.disconnect()
  }, [])
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !size.W || !size.H) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(size.W * dpr)
    canvas.height = Math.round(size.H * dpr)
    drawNow()
  }, [size, drawNow])
  // The first view frames the surveyed content.
  useEffect(() => {
    if (viewRef.current || !size.W || !size.H) return
    const c = grid.content
    viewRef.current = fitBox(
      frame.origin[0] + c.minX * frame.res, frame.origin[1] + c.minY * frame.res,
      frame.origin[0] + (c.maxX + 1) * frame.res, frame.origin[1] + (c.maxY + 1) * frame.res, size.W, size.H)
    drawNow()
  }, [size, grid, frame, drawNow])

  // Repaint the floor when the grid or the theme changes.
  useEffect(() => {
    paletteRef.current = resolveScenePalette()
    const off = floorRef.current ?? document.createElement('canvas')
    if (off.getContext('2d')) {
      paintFloor(grid, paletteRef.current, off)
      floorRef.current = off
    }
    drawNow()
  }, [grid, theme, drawNow])

  useEffect(() => { drawNow() }, [blobs, decisions, selectedId, tool, canPaint, drawNow])

  useEffect(() => {
    if (!focus || !viewRef.current || !sizeRef.current.W) return
    const b = props.current.blobs.find((x) => x.id === focus.id)
    if (!b) return
    viewRef.current = focusOn(viewRef.current, sizeRef.current.W, sizeRef.current.H, b.centroid[0], b.centroid[1], blobRingRadius(b))
    drawNow()
  }, [focus, drawNow])

  // The wheel needs a non-passive listener to keep the page from scrolling.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      const v = viewRef.current
      if (!v) return
      e.preventDefault()
      const r = canvas.getBoundingClientRect()
      viewRef.current = zoomAt(v, r.width, r.height, Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top)
      requestDraw()
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [requestDraw])

  const flush = useCallback(() => {
    const cells = pending.current
    pending.current = null
    if (cells?.length) props.current.onStroke({ kind: 'cells', indices: cells })
  }, [])
  const queueCells = (cells: number[]) => {
    if (!pending.current) {
      pending.current = []
      requestAnimationFrame(flush)
    }
    pending.current.push(...cells)
  }

  const mapAt = (e: React.PointerEvent): [number, number] | null => {
    const v = viewRef.current
    if (!v) return null
    const r = e.currentTarget.getBoundingClientRect()
    return toMap(v, r.width, r.height, e.clientX - r.left, e.clientY - r.top)
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.focus({ preventScroll: true })
    const p = mapAt(e)
    if (!p) return
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* not capturable */ }
    const { tool: tl, canPaint: paintable, frame: f } = props.current
    if (e.button !== 0 || tl.mode === 'move' || !paintable) {
      dragRef.current = { kind: 'pan', x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false, button: e.button }
      return
    }
    if (tl.shape === 'box') {
      dragRef.current = { kind: 'box', a: p, b: p }
      requestDraw()
      return
    }
    dragRef.current = { kind: 'brush', last: p }
    props.current.onStroke({ kind: 'begin' })
    queueCells(cellsInDisc(f, p[0], p[1], tl.size))
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = mapAt(e)
    cursorRef.current = p
    const drag = dragRef.current
    if (drag?.kind === 'pan') {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y
      drag.x = e.clientX
      drag.y = e.clientY
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 3) drag.moved = true
      if (drag.moved && viewRef.current) viewRef.current = panBy(viewRef.current, dx, dy)
    } else if (drag?.kind === 'brush' && p) {
      queueCells(cellsAlongStroke(props.current.frame, drag.last, p, props.current.tool.size))
      drag.last = p
    } else if (drag?.kind === 'box' && p) {
      drag.b = p
    }
    requestDraw()
  }

  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>, cancelled: boolean) => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    if (drag.kind === 'pan') {
      if (!cancelled && !drag.moved && drag.button === 0) {
        const p = mapAt(e)
        if (p) props.current.onSelect(blobAt(props.current.blobs, p[0], p[1])?.id ?? null)
      }
    } else if (drag.kind === 'brush') {
      flush()
      props.current.onStroke({ kind: 'end' })
    } else if (!cancelled) {
      const cells = cellsInRect(props.current.frame, drag.a, drag.b)
      props.current.onStroke({ kind: 'begin' })
      if (cells.length) props.current.onStroke({ kind: 'cells', indices: cells })
      props.current.onStroke({ kind: 'end' })
    }
    requestDraw()
  }

  const cursor = tool.mode === 'move' || !canPaint ? 'grab' : tool.shape === 'box' ? 'crosshair' : 'none'
  return (
    <div ref={hostRef} style={{ position: 'relative', width: '100%', height: '100%', minHeight: 0, background: color.sceneBg }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        tabIndex={0}
        data-testid="floor-edit-canvas"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endDrag(e, false)}
        onPointerCancel={(e) => endDrag(e, true)}
        onPointerLeave={() => { cursorRef.current = null; requestDraw() }}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); props.current.onUndo() }
        }}
        style={{ display: 'block', width: '100%', height: '100%', cursor, touchAction: 'none', outline: 'none' }}
      />
    </div>
  )
}
