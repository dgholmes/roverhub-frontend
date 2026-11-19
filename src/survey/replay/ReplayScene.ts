import * as THREE from 'three'
import { resolveScenePalette } from '@/scene3d/palette'
import type { ScenePalette } from '@/scene3d/types'
import { countUpTo, type ViewBounds } from './replayModel'

/** One path to draw: a take, or the legs. `colour` is a resolved CSS colour
 * (WebGL cannot read `var(...)`); `t` is ascending, on the survey's time axis. */
export interface ReplayPath {
  id: string
  colour: string
  t: Float64Array
  xyz: Float32Array
}

interface Drawn {
  t: Float64Array
  /** The path flattened to the floor: x, y, and a small per-path layer. */
  positions: Float32Array
  line: THREE.Line
  dot: THREE.Mesh
}

/** Grid spacing and extent, metres. */
const GRID_STEP = 5
const GRID_SIZE = 2000
/** The head dot's radius on screen, CSS pixels. */
const DOT_PX = 5
const MIN_HALF_M = 1
const MAX_HALF_M = 50_000

/**
 * The survey replay's top-down view, using three directly (the map scene's
 * engine needs a map, and a survey replay has none yet). An orthographic
 * camera looks straight down; each path is one line whose visible part is its
 * draw range up to the playhead, with a dot at its head. Wheel zooms about the
 * cursor, a drag pans, and `fit` frames given bounds. Paths are drawn flat:
 * top-down, a runaway's z (kilometres below the floor) has nowhere to go but
 * would be clipped by the camera.
 *
 * Renders on demand: one frame after anything changes. Throws when WebGL is not
 * available; the page catches that and says so.
 */
export class ReplayScene {
  private readonly host: HTMLElement
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000)
  private readonly dotGeometry = new THREE.CircleGeometry(1, 24)
  private grid: THREE.GridHelper | null = null
  private palette: ScenePalette
  private drawn: Drawn[] = []
  private time = 0
  private cx = 0
  private cy = 0
  private halfH = 20
  /** The last fitted bounds, kept while the user has not moved the view, so a
   * resize (the host often has no size on the first fit) frames them again. */
  private fitted: ViewBounds | null = null
  private frame = 0
  private disposed = false
  private readonly cleanups: (() => void)[] = []

  constructor(host: HTMLElement) {
    this.host = host
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    if (!renderer.getContext()) throw new Error('no WebGL context')
    this.renderer = renderer
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    const canvas = renderer.domElement
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.touchAction = 'none'
    canvas.style.cursor = 'grab'
    host.appendChild(canvas)
    this.camera.position.set(0, 0, 100)
    this.palette = resolveScenePalette(host)
    this.applyTheme()
    this.listen(canvas)
    this.resize()
  }

  /** Replaces what is drawn. Later paths draw over earlier ones. */
  setPaths(list: ReplayPath[]): void {
    if (this.disposed) return
    this.clearPaths()
    list.forEach((p, i) => {
      const n = Math.min(p.t.length, Math.floor(p.xyz.length / 3))
      const positions = new Float32Array(n * 3)
      const layer = 0.01 * (i + 1)
      for (let k = 0; k < n; k++) {
        positions[k * 3] = p.xyz[k * 3]
        positions[k * 3 + 1] = p.xyz[k * 3 + 1]
        positions[k * 3 + 2] = layer
      }
      const geometry = new THREE.BufferGeometry()
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
      const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: new THREE.Color(p.colour) }))
      line.frustumCulled = false
      const dot = new THREE.Mesh(this.dotGeometry, new THREE.MeshBasicMaterial({ color: new THREE.Color(p.colour) }))
      dot.position.z = layer + 0.5
      this.scene.add(line, dot)
      this.drawn.push({ t: p.t.subarray(0, n), positions, line, dot })
    })
    this.applyTime()
  }

  /** Moves the playhead: each path draws up to `s`, seconds on the survey's axis. */
  setTime(s: number): void {
    if (this.disposed) return
    this.time = s
    this.applyTime()
  }

  /** Frames `b` (map metres) in the view. */
  fit(b: ViewBounds): void {
    if (this.disposed) return
    this.fitted = b
    this.frameBounds(b)
    this.requestRender()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.frame) cancelAnimationFrame(this.frame)
    this.cleanups.forEach((f) => f())
    this.clearPaths()
    this.disposeGrid()
    this.dotGeometry.dispose()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }

  // --- internals -------------------------------------------------------------

  private size(): { w: number; h: number } {
    return { w: Math.max(1, this.host.clientWidth), h: Math.max(1, this.host.clientHeight) }
  }

  /** Metres per CSS pixel. */
  private metresPerPx(): number {
    return (2 * this.halfH) / this.size().h
  }

  private frameBounds(b: ViewBounds): void {
    const { w, h } = this.size()
    this.cx = (b.minX + b.maxX) / 2
    this.cy = (b.minY + b.maxY) / 2
    this.halfH = clampHalf(Math.max((b.maxY - b.minY) / 2, (b.maxX - b.minX) / 2 / (w / h)))
    this.placeGrid()
  }

  private applyTime(): void {
    for (const d of this.drawn) {
      const count = countUpTo(d.t, this.time)
      d.line.geometry.setDrawRange(0, count)
      d.dot.visible = count > 0
      if (count > 0) d.dot.position.set(d.positions[(count - 1) * 3], d.positions[(count - 1) * 3 + 1], d.dot.position.z)
    }
    this.requestRender()
  }

  private clearPaths(): void {
    for (const d of this.drawn) {
      this.scene.remove(d.line, d.dot)
      d.line.geometry.dispose()
      ;(d.line.material as THREE.Material).dispose()
      ;(d.dot.material as THREE.Material).dispose()
    }
    this.drawn = []
  }

  private disposeGrid(): void {
    if (!this.grid) return
    this.scene.remove(this.grid)
    this.grid.geometry.dispose()
    const m = this.grid.material
    ;(Array.isArray(m) ? m : [m]).forEach((x) => x.dispose())
    this.grid = null
  }

  /** The grid lies in the floor plane (GridHelper's is XZ), centred near the view. */
  private placeGrid(): void {
    if (!this.grid) return
    this.grid.position.set(Math.round(this.cx / GRID_STEP) * GRID_STEP, Math.round(this.cy / GRID_STEP) * GRID_STEP, 0)
  }

  private applyTheme(): void {
    this.palette = resolveScenePalette(this.host)
    this.renderer.setClearColor(new THREE.Color(this.palette.bg), 1)
    this.disposeGrid()
    const grid = new THREE.GridHelper(GRID_SIZE, GRID_SIZE / GRID_STEP, new THREE.Color(this.palette.grid), new THREE.Color(this.palette.grid))
    grid.rotation.x = Math.PI / 2
    this.grid = grid
    this.scene.add(grid)
    this.placeGrid()
    this.requestRender()
  }

  private resize(): void {
    const { w, h } = this.size()
    this.renderer.setSize(w, h, false)
    if (this.fitted) this.frameBounds(this.fitted)
    this.requestRender()
  }

  private requestRender(): void {
    if (this.disposed || this.frame) return
    this.frame = requestAnimationFrame(() => {
      this.frame = 0
      this.render()
    })
  }

  private render(): void {
    if (this.disposed) return
    const { w, h } = this.size()
    const halfW = this.halfH * (w / h)
    const cam = this.camera
    cam.left = -halfW
    cam.right = halfW
    cam.top = this.halfH
    cam.bottom = -this.halfH
    cam.position.set(this.cx, this.cy, 100)
    cam.updateProjectionMatrix()
    const r = DOT_PX * this.metresPerPx()
    for (const d of this.drawn) d.dot.scale.set(r, r, 1)
    this.renderer.render(this.scene, cam)
  }

  private listen(canvas: HTMLCanvasElement): void {
    const on = <K extends keyof HTMLElementEventMap>(type: K, f: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions) => {
      canvas.addEventListener(type, f, opts)
      this.cleanups.push(() => canvas.removeEventListener(type, f, opts))
    }

    on('wheel', (e) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const { w, h } = this.size()
      const before = this.metresPerPx()
      const px = e.clientX - rect.left - w / 2
      const py = h / 2 - (e.clientY - rect.top)
      // The point under the cursor stays put.
      const wx = this.cx + px * before
      const wy = this.cy + py * before
      this.halfH = clampHalf(this.halfH * Math.exp(e.deltaY * 0.0015))
      const after = this.metresPerPx()
      this.cx = wx - px * after
      this.cy = wy - py * after
      this.fitted = null
      this.placeGrid()
      this.requestRender()
    }, { passive: false })

    let drag: { id: number; x: number; y: number } | null = null
    on('pointerdown', (e) => {
      if (e.button !== 0) return
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY }
      canvas.setPointerCapture?.(e.pointerId)
      canvas.style.cursor = 'grabbing'
    })
    on('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return
      const m = this.metresPerPx()
      this.cx -= (e.clientX - drag.x) * m
      this.cy += (e.clientY - drag.y) * m
      drag = { id: drag.id, x: e.clientX, y: e.clientY }
      this.fitted = null
      this.placeGrid()
      this.requestRender()
    })
    const end = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      drag = null
      canvas.style.cursor = 'grab'
    }
    on('pointerup', end)
    on('pointercancel', end)

    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this.resize())
      ro.observe(this.host)
      this.cleanups.push(() => ro.disconnect())
    }
    const mo = new MutationObserver(() => this.applyTheme())
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-accent'] })
    this.cleanups.push(() => mo.disconnect())
    try {
      const mq = matchMedia('(prefers-color-scheme: light)')
      const onScheme = () => this.applyTheme()
      mq.addEventListener('change', onScheme)
      this.cleanups.push(() => mq.removeEventListener('change', onScheme))
    } catch { /* no matchMedia */ }
  }
}

function clampHalf(h: number): number {
  return Number.isFinite(h) ? Math.min(MAX_HALF_M, Math.max(MIN_HALF_M, h)) : 20
}
