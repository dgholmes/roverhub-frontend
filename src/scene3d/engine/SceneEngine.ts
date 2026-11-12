import * as THREE from 'three'
import { font } from '@/design-system/tokens'
import { paintFloor } from '../paintFloor'
import { resolveScenePalette } from '../palette'
import {
  CLS_CEILING, GRID_FURNITURE, GRID_WALL,
  type CloudColouring, type SceneData, type SceneGoal, type ScenePalette, type SceneRobotPose,
  type SceneRouteWaypoint, type SceneView, type SceneZone,
} from '../types'
import { computeAlign, fitAlong, planDistanceFor, type Align } from './align'
import {
  FLY_FOV, FOLLOW_FOV, PLAN_FOV, canStand, clamp, easeInOut, flyFrom, flyLook, flyZoom, followInput, followOrbit,
  followWant, followZoom, headingTo, lerpPose, planPosition, planZoom, previewStep, scaleBar, stepFly, stepPlan,
  stepStandin, stepTilt, wheelFactor, type FlyCam, type FollowCam, type PlanCam,
} from './camera'
import { buildCloud, pointSizeScale, type CloudUniforms } from './cloud'
import { nearestCell, segmentBlocked, standableAt, toMapX, toMapY, toWorldX, toWorldZ } from './coords'
import { HELD_KEYS, MOVE_KEYS, REATTACH_KEYS, isTap, sceneOwnsKey } from './input'
import {
  drawMinimapBase, drawMinimapView, minimapFrame, minimapHeading, minimapPoint, minimapSize, minimapToMap, type MinimapFrame,
} from './minimap'
import {
  POLE_GEOMETRY, WP_GEOMETRY, buildBoxes, buildFloor, buildGoalLine, buildGoalPin, buildGridLines, buildPoseDraft,
  buildRobotBody, buildRoute, buildZones, disposeTree, poseLegs, routeMaterials, scanPositions,
  type RobotBody, type RouteMaterials,
} from './objects'

export interface SceneLayers {
  /** Tint the walkable floor (all views). */
  walkable: boolean
  /** Furniture boxes and furniture cells (Plan). */
  furniture: boolean
  /** The lidar cloud over the plan (Plan). */
  points: boolean
  /** The ceiling class (Fly, Follow). */
  ceiling: boolean
  /** The robot-eye inset (Follow on the stand-in). */
  pip: boolean
}

export type PointDetail = 1 | 0.5 | 0.25

export type SceneToast = 'bump' | 'previewFinished' | 'dropped'

export interface SceneEngineStatus {
  /** Follow on the live robot: the camera has let go of it. */
  detached: boolean
  /** A live robot pose is known. */
  hasRobot: boolean
  /** The stand-in is walking the route. */
  previewing: boolean
}

export interface SceneEngineCallbacks {
  onFloorTap?: (x: number, y: number) => void
  onFloorPoseDown?: (x: number, y: number) => void
  onFloorPoseMove?: (x: number, y: number) => void
  onFloorPoseUp?: (x: number, y: number) => void
  onWaypointClick?: (id: string) => void
  onStandinWaypoint?: (x: number, y: number) => void
  /** T or Reset view asks for the tilt to change; the host decides. */
  onTiltRequest?: (tilted: boolean) => void
  onStatus?: (status: SceneEngineStatus) => void
  onToast?: (toast: SceneToast) => void
}

const LIVE_ROBOT_RATE = 8
/** Height the live lidar points are drawn at: roughly the sensor's. */
const SCAN_HEIGHT_M = 0.3
const PICK_RADIUS_PX = 12

function cssVar(el: Element, name: string, fallback: string): string {
  try {
    return getComputedStyle(el).getPropertyValue(name).trim() || fallback
  } catch {
    return fallback
  }
}

function isCoarsePointer(): boolean {
  try { return matchMedia('(pointer: coarse)').matches } catch { return false }
}

/**
 * The options page's scene as a class: one WebGL renderer, one three.js scene
 * and three cameras (Plan, Fly, Follow), over one floor's SceneData.
 *
 * It owns the canvas, the input on its host element (keys only while the host
 * itself has focus), and the HTML labels in `labels`; React drives it through
 * the setters and hears back through the callbacks. It renders on demand:
 * a frame when something changes, and a loop only while something moves (a
 * held key, the tilt, a camera lerp, the live robot easing, the gait, a
 * preview). It pauses while the host is off screen or the tab is hidden.
 *
 * Create with `SceneEngine.create`, which answers null where WebGL is not
 * available instead of throwing.
 */
export class SceneEngine {
  static create(host: HTMLElement, labels: HTMLElement, data: SceneData): SceneEngine | null {
    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' })
      if (!renderer.getContext()) throw new Error('no WebGL context')
    } catch (e) {
      console.warn('map scene: WebGL is not available', e)
      return null
    }
    return new SceneEngine(host, labels, data, renderer)
  }

  private readonly host: HTMLElement
  private readonly labels: HTMLElement
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene = new THREE.Scene()
  private readonly camera = new THREE.PerspectiveCamera(PLAN_FOV, 1, 0.05, 400)
  private readonly eyeCam = new THREE.PerspectiveCamera(72, 16 / 10, 0.05, 60)
  private readonly raycaster = new THREE.Raycaster()
  private readonly floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  private readonly tmp = new THREE.Vector3()
  private readonly coarse = isCoarsePointer()

  private readonly data: SceneData
  private palette: ScenePalette
  private readonly align: Align
  private readonly sizeScale: number

  // scene objects
  private readonly floorCanvas: HTMLCanvasElement
  private readonly floor: ReturnType<typeof buildFloor>
  private readonly walls: THREE.InstancedMesh
  private readonly furn: THREE.InstancedMesh
  private readonly gridLines: ReturnType<typeof buildGridLines>
  private readonly cloud: ReturnType<typeof buildCloud> | null
  private readonly standin: RobotBody
  private readonly live: RobotBody
  private readonly routeMats: RouteMaterials = routeMaterials()
  private readonly discGeo = WP_GEOMETRY()
  private readonly poleGeo = POLE_GEOMETRY()
  private routeObj: ReturnType<typeof buildRoute> | null = null
  private zonesObj: THREE.Group | null = null
  private readonly goalPin = buildGoalPin()
  private readonly goalLine = buildGoalLine()
  private readonly poseDraft = buildPoseDraft()
  private scanObj: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> | null = null

  // view state
  private view: SceneView = 'plan'
  private followTarget: 'robot' | 'standin' = 'standin'
  private tilt = false
  private tiltT = 0
  private tiltMax = 1
  private layers: SceneLayers = { walkable: true, furniture: true, points: false, ceiling: false, pip: true }
  private colouring: CloudColouring = 'structure'
  private detail: PointDetail
  private readonly keys = new Set<string>()
  private readonly plan: PlanCam = { tx: 0, tz: 0, dist: 40, yaw: 0 }
  private fly: FlyCam = { x: 0, y: 6, z: 0, yaw: 0, pitch: -0.5 }
  /** The stand-in and its chase camera. */
  private readonly follow: FollowCam = { x: 0, z: 0, heading: 0, orbit: 0, pitch: 0.5, dist: 3.8, walkPhase: 0, gait: 0 }
  /** The live robot's chase camera; x, z and heading track the shown pose. */
  private readonly chase: FollowCam = { x: 0, z: 0, heading: 0, orbit: 0, pitch: 0.5, dist: 3.8, walkPhase: 0, gait: 0 }
  private readonly followCamPos = new THREE.Vector3()
  private followCamInit = false
  /** Follow on the live robot, let go: a free camera. */
  private free: FlyCam = { x: 0, y: 3, z: 0, yaw: 0, pitch: -0.3 }
  private detached = false
  /** Detached only because there was no robot pose to follow, not by the
   * operator: the first pose reattaches it. */
  private detachedForNoRobot = false
  private visited: Record<SceneView, boolean> = { plan: false, fly: false, follow: false }
  private preview: { seg: number } | null = null
  private bumpAt = 0

  // overlays
  private route: readonly SceneRouteWaypoint[] = []
  private selectedId: string | null = null
  private blocked: boolean[] = []
  private robotTarget: SceneRobotPose | null = null
  private robotShown: { x: number; y: number; yaw: number } | null = null
  private goal: SceneGoal | null = null
  private goalLineOn = false
  private zones: readonly SceneZone[] = []

  // interaction
  private pointerMode: 'tap' | 'pose' = 'tap'
  private cb: SceneEngineCallbacks = {}
  private readonly pointers = new Map<number, { x: number; y: number }>()
  private drag: {
    x0: number; y0: number; x: number; y: number; t0: number; moved: boolean; rotate: boolean; button: number
    anchor: THREE.Vector3 | null; pinch?: number
  } | null = null
  private poseDrag: { id: number; last: { x: number; y: number } } | null = null

  // HTML bits
  private wpLabels: HTMLDivElement[] = []
  private legLabels: { el: HTMLDivElement; x: number; y: number }[] = []
  private minimap: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; base: HTMLCanvasElement } | null = null
  private readonly mmFrame: MinimapFrame
  private pipEl: HTMLElement | null = null
  private scaleBarEls: { bar: HTMLElement; text: HTMLElement } | null = null

  // loop
  private raf = 0
  private last: number | null = null
  private visible = true
  private disposed = false
  private lastStatus = ''
  /** The host has had a real size. Until then the aspect is a guess, so the
   * first framing is redone when it arrives. */
  private sized = false
  private refit: (() => void) | null = null
  private readonly cleanups: (() => void)[] = []

  private constructor(host: HTMLElement, labels: HTMLElement, data: SceneData, renderer: THREE.WebGLRenderer) {
    this.host = host
    this.labels = labels
    this.data = data
    this.renderer = renderer
    this.detail = this.coarse ? 0.5 : 1
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.coarse ? 1.5 : 2))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.domElement.style.display = 'block'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    host.prepend(renderer.domElement)

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x444448, 1.6))
    const sun = new THREE.DirectionalLight(0xffffff, 1.4)
    sun.position.set(4, 10, 6)
    this.scene.add(sun)

    this.palette = resolveScenePalette(host)
    const grid = data.grid
    this.floorCanvas = document.createElement('canvas')
    paintFloor(grid, this.palette, this.floorCanvas, this.floorPaintOptions())
    this.floor = buildFloor(grid, this.floorCanvas, renderer.capabilities.getMaxAnisotropy())
    this.scene.add(this.floor.mesh)
    this.gridLines = buildGridLines(grid)
    this.scene.add(this.gridLines)
    this.cloud = data.cloud && data.cloud.count > 0 ? buildCloud(data.cloud) : null
    if (this.cloud) this.scene.add(this.cloud)
    this.sizeScale = data.cloud ? pointSizeScale(this.visibleCount(data), grid) : 1
    this.walls = buildBoxes(grid, GRID_WALL)
    this.furn = buildBoxes(grid, GRID_FURNITURE)
    this.scene.add(this.walls, this.furn)
    this.standin = buildRobotBody()
    this.live = buildRobotBody()
    this.live.cone.visible = false
    this.scene.add(this.standin.group, this.live.group)
    this.goalPin.group.visible = false
    this.goalLine.visible = false
    this.poseDraft.group.visible = false
    this.scene.add(this.goalPin.group, this.goalLine, this.poseDraft.group)

    this.align = computeAlign(grid)
    this.mmFrame = minimapFrame(grid)
    this.resize()
    this.placeStandin()
    this.visited.plan = true
    this.resetViewFor('plan')
    if (!this.sized) this.refit = () => this.resetViewFor('plan')
    this.applyTheme()
    this.applyVisibility()
    this.listen()
    this.requestRender()
  }

  /** Points left once the ceiling is hidden: what the eye judges density by. */
  private visibleCount(data: SceneData): number {
    const c = data.cloud
    if (!c) return 0
    let n = 0
    for (let k = 0; k < c.count; k++) if (c.cls[k] !== CLS_CEILING) n++
    return n
  }

  // ───────────── public setters ─────────────

  setCallbacks(cb: SceneEngineCallbacks): void { this.cb = cb }

  setView(view: SceneView): void {
    if (view !== 'plan' && !this.cloud) view = 'plan'
    if (view === this.view) return
    if (this.preview && view !== 'follow') this.stopPreview()
    this.keys.clear()
    this.view = view
    if (!this.visited[view]) { this.visited[view] = true; this.resetViewFor(view) }
    if (view === 'follow') {
      this.followCamInit = false
      if (this.followTarget === 'robot') {
        const none = !this.robotShown
        this.setDetached(none)
        this.detachedForNoRobot = none
      }
    }
    this.repaintFloor()
    this.applyVisibility()
    this.emitStatus()
    this.requestRender()
  }

  setFollowTarget(target: 'robot' | 'standin'): void {
    if (target === this.followTarget) return
    this.followTarget = target
    if (this.preview) this.stopPreview()
    this.followCamInit = false
    this.detached = target === 'robot' && !this.robotShown
    this.detachedForNoRobot = this.detached
    if (this.view === 'follow' && this.detached) this.free = this.freeFromCamera()
    this.applyVisibility()
    this.emitStatus()
    this.requestRender()
  }

  setTilted(on: boolean): void {
    if (on === this.tilt) return
    this.tilt = on
    this.applyVisibility()
    this.requestRender()
  }

  setLayers(layers: SceneLayers): void {
    const repaint = layers.walkable !== this.layers.walkable || layers.furniture !== this.layers.furniture
    this.layers = { ...layers }
    if (repaint) this.repaintFloor()
    this.applyVisibility()
    this.requestRender()
  }

  setColouring(c: CloudColouring): void {
    this.colouring = c
    this.applyVisibility()
    this.requestRender()
  }

  setDetail(d: PointDetail): void {
    this.detail = d
    this.applyVisibility()
    this.requestRender()
  }

  setPointerMode(m: 'tap' | 'pose'): void {
    this.pointerMode = m
    if (m === 'tap') this.poseDrag = null
  }

  setRoute(route: readonly SceneRouteWaypoint[], selectedId: string | null | undefined): void {
    this.route = route
    this.selectedId = selectedId ?? null
    this.rebuildRoute()
    this.requestRender()
  }

  setRobot(pose: SceneRobotPose | null): void {
    this.robotTarget = pose
    if (!pose) {
      this.robotShown = null
      if (this.view === 'follow' && this.followTarget === 'robot' && !this.detached) {
        this.setDetached(true)
        this.detachedForNoRobot = true
      }
    } else if (!this.robotShown) {
      this.robotShown = { x: pose.x, y: pose.y, yaw: pose.yaw }
      this.chase.x = toWorldX(pose.x); this.chase.z = toWorldZ(pose.y); this.chase.heading = pose.yaw
      // Follow went free only for want of a pose: ride the robot now that
      // there is one (it opened as a free camera on rover-jetson, 2026-11-12).
      if (this.detachedForNoRobot) {
        this.detached = false
        this.detachedForNoRobot = false
        this.followCamInit = false
      }
    }
    this.styleLiveRobot()
    this.emitStatus()
    this.requestRender()
  }

  setGoal(goal: SceneGoal | null, line: boolean): void {
    this.goal = goal
    this.goalLineOn = line
    this.goalPin.group.visible = !!goal
    if (goal) {
      this.goalPin.group.position.set(toWorldX(goal.x), 0, toWorldZ(goal.y))
      this.goalPin.mat.color.set(goal.refused ? this.palette.red : this.palette.accent)
    }
    this.requestRender()
  }

  setPoseDraft(pose: { x: number; y: number; yaw: number } | null): void {
    this.poseDraft.group.visible = !!pose
    if (pose) {
      this.poseDraft.group.position.set(toWorldX(pose.x), 0.06, toWorldZ(pose.y))
      this.poseDraft.group.rotation.y = pose.yaw
    }
    this.requestRender()
  }

  setZones(zones: readonly SceneZone[]): void {
    this.zones = zones
    this.rebuildZones()
    this.requestRender()
  }

  setScan(scan: Float32Array | null): void {
    if (!scan || scan.length < 2) {
      if (this.scanObj) this.scanObj.visible = false
      this.requestRender()
      return
    }
    const positions = scanPositions(scan, SCAN_HEIGHT_M)
    if (!this.scanObj) {
      const geo = new THREE.BufferGeometry()
      const mat = new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, transparent: true, opacity: 0.9, depthWrite: false })
      mat.color.set(cssVar(this.host, '--rh-map-scan', this.palette.red))
      this.scanObj = new THREE.Points(geo, mat)
      this.scanObj.frustumCulled = false
      this.scanObj.renderOrder = 4
      this.scene.add(this.scanObj)
    }
    this.scanObj.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    this.scanObj.visible = true
    this.requestRender()
  }

  setMinimapCanvas(canvas: HTMLCanvasElement | null): void {
    if (!canvas) { this.minimap = null; return }
    const ctx = canvas.getContext('2d')
    if (!ctx) { this.minimap = null; return }
    const { w, h } = minimapSize(this.mmFrame)
    canvas.width = w
    canvas.height = h
    const base = document.createElement('canvas')
    base.width = w
    base.height = h
    this.minimap = { canvas, ctx, base }
    this.drawMinimapBase()
    this.requestRender()
  }

  setPipElement(el: HTMLElement | null): void {
    this.pipEl = el
    this.requestRender()
  }

  setScaleBar(bar: HTMLElement | null, text: HTMLElement | null): void {
    this.scaleBarEls = bar && text ? { bar, text } : null
    this.requestRender()
  }

  getStatus(): SceneEngineStatus {
    return { detached: this.detached, hasRobot: !!this.robotShown, previewing: !!this.preview }
  }

  // ───────────── public actions ─────────────

  /** Reset view: the current view's first framing. In Plan it also asks for
   * the tilt to drop and resets the tilt amount, as the page's button does. */
  resetView(): void {
    this.resetViewFor(this.view)
    if (this.view === 'plan') {
      this.tiltMax = 1
      this.cb.onTiltRequest?.(false)
    }
    this.requestRender()
  }

  /** Re-frame on the route (or the floor's content when it has no
   * waypoints): Plan and Fly are re-centred, and Follow's stand-in goes back
   * to the route's start the next time Follow opens. */
  frame(): void {
    const fit = fitAlong(this.align, this.route)
    const c = fit ?? { cx: this.align.cx, cy: this.align.cy, sr: this.align.sr, su: this.align.su }
    this.plan.tx = toWorldX(c.cx)
    this.plan.tz = toWorldZ(c.cy)
    this.plan.yaw = this.align.yaw
    this.plan.dist = clamp(planDistanceFor(c.sr, c.su, this.camera.aspect), 3, 120)
    const back = c.su * 0.62
    this.fly = {
      x: toWorldX(c.cx - this.align.ux * back), z: toWorldZ(c.cy - this.align.uy * back),
      y: 9, yaw: this.align.yaw, pitch: -0.62,
    }
    this.visited = { plan: true, fly: true, follow: this.view === 'follow' }
    if (this.view === 'follow') this.resetViewFor('follow')
    if (!this.sized) this.refit = () => this.frame()
    this.requestRender()
  }

  /** Back to robot: the chase camera eases in from where the free camera is. */
  reattach(): void {
    if (this.followTarget !== 'robot' || !this.robotShown) return
    this.followCamPos.copy(this.camera.position)
    this.followCamInit = true
    this.setDetached(false)
    this.requestRender()
  }

  togglePreview(): void {
    if (this.preview) this.stopPreview()
    else this.startPreview()
    this.requestRender()
  }

  /** Space, or the touch pad's Drop. */
  dropHere(): void {
    if (this.view !== 'follow' || this.followTarget !== 'standin') return
    this.cb.onStandinWaypoint?.(toMapX(this.follow.x), toMapY(this.follow.z))
    this.cb.onToast?.('dropped')
  }

  /** The touch pad holds a key while pressed. */
  pressKey(code: string): void {
    if (this.view === 'follow' && this.followTarget === 'robot' && !this.detached && (MOVE_KEYS.has(code) || code === 'up' || code === 'dn')) {
      this.setDetached(true)
    }
    this.keys.add(code)
    this.requestRender()
  }

  releaseKey(code: string): void {
    this.keys.delete(code)
    this.requestRender()
  }

  /** Minimap click at fractions of its box: fly there, no higher than 1.6 m. */
  minimapJump(fx: number, fy: number): void {
    const p = minimapToMap(this.mmFrame, fx, fy)
    this.fly.x = toWorldX(p.x)
    this.fly.z = toWorldZ(p.y)
    this.fly.y = Math.min(this.fly.y, 1.6)
    this.requestRender()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
    for (const off of this.cleanups.splice(0)) off()
    disposeTree(this.scene)
    this.floor.texture.dispose()
    this.discGeo.dispose()
    this.poleGeo.dispose()
    Object.values(this.routeMats.disc).forEach((m) => m.dispose())
    this.routeMats.pole.dispose()
    this.routeMats.ribbon.dispose()
    this.scene.clear()
    this.labels.replaceChildren()
    this.renderer.dispose()
    this.renderer.forceContextLoss()
    this.renderer.domElement.remove()
  }

  // ───────────── internals: state ─────────────

  private setDetached(on: boolean): void {
    if (on && !this.detached) this.free = this.freeFromCamera()
    this.detached = on
    this.detachedForNoRobot = false
    this.emitStatus()
  }

  private freeFromCamera(): FlyCam {
    const dir = this.camera.getWorldDirection(new THREE.Vector3())
    return flyFrom(this.camera.position, dir)
  }

  private emitStatus(): void {
    const s = this.getStatus()
    const key = `${s.detached}|${s.hasRobot}|${s.previewing}`
    if (key === this.lastStatus) return
    this.lastStatus = key
    this.cb.onStatus?.(s)
  }

  private standOk = (X: number, Z: number): boolean =>
    standableAt(this.data.grid, toMapX(X), toMapY(Z), this.data.hasPlanning)

  /** Put the stand-in at the route's start facing the second waypoint, else on
   * the standable cell nearest the floor's centre. */
  private placeStandin(): void {
    const r = this.route
    if (r.length) {
      this.follow.x = toWorldX(r[0].x)
      this.follow.z = toWorldZ(r[0].y)
      this.follow.heading = r.length > 1
        ? headingTo(this.follow.x, this.follow.z, toWorldX(r[1].x), toWorldZ(r[1].y))
        : this.align.yaw + Math.PI / 2
      return
    }
    // Somewhere the whole body fits, or it could not take a step: a lone
    // walkable cell would pass a centre-only check.
    const heading = this.align.yaw + Math.PI / 2
    const p = nearestCell(this.data.grid, this.align.cx, this.align.cy,
      (x, y) => canStand(toWorldX(x), toWorldZ(y), heading, this.standOk)) ?? { x: this.align.cx, y: this.align.cy }
    this.follow.x = toWorldX(p.x)
    this.follow.z = toWorldZ(p.y)
    this.follow.heading = heading
  }

  private resetViewFor(view: SceneView): void {
    const a = this.align
    if (view === 'plan') {
      this.plan.tx = toWorldX(a.cx)
      this.plan.tz = toWorldZ(a.cy)
      this.plan.yaw = a.yaw
      this.plan.dist = clamp(planDistanceFor(a.sr, a.su, this.camera.aspect), 3, 120)
    } else if (view === 'fly') {
      const back = a.su * 0.62
      this.fly = { x: toWorldX(a.cx - a.ux * back), z: toWorldZ(a.cy - a.uy * back), y: 9, yaw: a.yaw, pitch: -0.62 }
    } else if (this.followTarget === 'standin') {
      this.stopPreview()
      this.placeStandin()
      Object.assign(this.follow, { orbit: 0, pitch: 0.5, dist: 3.8 })
      this.followCamInit = false
    } else {
      Object.assign(this.chase, { orbit: 0, pitch: 0.5, dist: 3.8 })
      this.followCamInit = false
      if (this.robotShown) this.setDetached(false)
    }
  }

  private startPreview(): void {
    const W = this.route
    if (W.length < 2) return
    this.follow.x = toWorldX(W[0].x)
    this.follow.z = toWorldZ(W[0].y)
    this.follow.heading = headingTo(this.follow.x, this.follow.z, toWorldX(W[1].x), toWorldZ(W[1].y))
    this.preview = { seg: 1 }
    this.emitStatus()
  }

  private stopPreview(): void {
    if (!this.preview) return
    this.preview = null
    this.emitStatus()
  }

  private bump(): void {
    const t = performance.now()
    if (t - this.bumpAt > 1500) {
      this.bumpAt = t
      this.cb.onToast?.('bump')
    }
  }

  // ───────────── internals: building and colour ─────────────

  private floorPaintOptions() {
    return { showWalkable: this.layers.walkable, showFurniture: this.layers.furniture || this.view !== 'plan' }
  }

  private repaintFloor(): void {
    paintFloor(this.data.grid, this.palette, this.floorCanvas, this.floorPaintOptions())
    this.floor.texture.needsUpdate = true
    this.drawMinimapBase()
  }

  private rebuildRoute(): void {
    if (this.routeObj) {
      this.scene.remove(this.routeObj.group)
      this.routeObj.ribbon?.geometry.dispose()
      this.routeObj = null
    }
    const W = this.route
    this.blocked = []
    for (let k = 1; k < W.length; k++) this.blocked.push(segmentBlocked(this.data.grid, W[k - 1], W[k], this.data.hasPlanning))
    this.routeObj = buildRoute(W, this.blocked, this.selectedId,
      { mats: this.routeMats, disc: this.discGeo, pole: this.poleGeo },
      { accent: new THREE.Color(this.palette.accent), amber: new THREE.Color(this.palette.amber) })
    this.scene.add(this.routeObj.group)
    this.syncLabels()
    this.applyVisibility()
    this.drawMinimapBase()
  }

  private rebuildZones(): void {
    if (this.zonesObj) {
      this.scene.remove(this.zonesObj)
      disposeTree(this.zonesObj)
      this.zonesObj = null
    }
    if (!this.zones.length) return
    this.zonesObj = buildZones(this.zones, {
      red: new THREE.Color(this.palette.red),
      amber: new THREE.Color(this.palette.amber),
      grey: new THREE.Color(cssVar(this.host, '--rh-t3', '#7c7c80')),
    })
    this.scene.add(this.zonesObj)
  }

  /** Waypoint labels (number, and name and note when selected) and leg
   * lengths, as HTML over the canvas; positioned each frame in `render`. */
  private syncLabels(): void {
    const W = this.route
    while (this.wpLabels.length < W.length) {
      const el = document.createElement('div')
      el.style.cssText = [
        'position:absolute', 'left:0', 'top:0', 'transform:translate(-50%,-120%)', `font-family:${font.family}`,
        'font-size:11px', 'font-weight:700', 'line-height:1.2', 'color:#fff', 'border-radius:10px', 'min-width:20px',
        'min-height:20px', 'padding:0 6px', 'display:flex', 'flex-direction:column', 'align-items:center',
        'justify-content:center', 'font-variant-numeric:tabular-nums', 'box-shadow:0 2px 6px rgba(0,0,0,0.3)',
        'white-space:nowrap', 'pointer-events:none', 'visibility:hidden',
      ].join(';')
      this.labels.appendChild(el)
      this.wpLabels.push(el)
    }
    this.wpLabels.forEach((el, k) => {
      const p = W[k]
      el.hidden = !p
      if (!p) return
      const selected = p.id === this.selectedId
      const blockedIn = k > 0 && this.blocked[k - 1]
      const tone = p.flag === 'error' ? 'red' : (p.flag === 'warning' || blockedIn) ? 'amber' : 'accent'
      el.style.background = tone === 'red' ? 'var(--rh-red, #ff453a)' : tone === 'amber' ? 'var(--rh-amber, #ff9f0a)' : 'var(--rh-accent, #0a84ff)'
      el.style.color = tone === 'amber' ? '#1c1c1e' : '#fff'
      el.style.outline = selected ? '2px solid #fff' : 'none'
      el.style.padding = selected ? '2px 8px' : '0 6px'
      el.dataset.waypointId = p.id
      el.replaceChildren()
      const head = document.createElement('span')
      head.textContent = selected && p.label ? `${k + 1}. ${p.label}` : String(k + 1)
      el.appendChild(head)
      if (selected && p.note) {
        const note = document.createElement('span')
        note.textContent = p.note
        note.style.fontWeight = '500'
        note.style.opacity = '0.9'
        el.appendChild(note)
      }
    })
    for (const l of this.legLabels) l.el.remove()
    this.legLabels = []
    for (let k = 1; k < W.length; k++) {
      const a = W[k - 1], b = W[k]
      const m = Math.hypot(b.x - a.x, b.y - a.y)
      if (m < 2) continue
      const el = document.createElement('div')
      el.textContent = m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`
      el.style.cssText = [
        'position:absolute', 'left:0', 'top:0', 'transform:translate(-50%,-50%)', `font-family:${font.family}`,
        'font-size:10px', 'font-weight:600', 'padding:1px 6px', 'border-radius:8px', 'white-space:nowrap',
        'background:var(--rh-overlay, rgba(8,11,16,0.62))', 'color:var(--rh-t1, #e8e8ea)', 'pointer-events:none',
        'font-variant-numeric:tabular-nums', 'visibility:hidden',
      ].join(';')
      this.labels.appendChild(el)
      this.legLabels.push({ el, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
    }
  }

  private styleLiveRobot(): void {
    const p = this.robotTarget
    const bg = new THREE.Color(this.palette.bg)
    const body = new THREE.Color(this.palette.robot)
    if (p?.stale) body.lerp(bg, 0.5)
    this.live.body.color.copy(body)
    this.live.ring.color.set(p?.stale ? cssVar(this.host, '--rh-t3', '#7c7c80') : this.palette.accent)
    this.live.ring.opacity = p?.stale ? 0.5 : 0.85
    this.live.lens.color.set(p?.stale ? cssVar(this.host, '--rh-t3', '#7c7c80') : this.palette.accent)
    this.live.estimated.visible = !!p?.estimated
    ;(this.live.estimated.material as THREE.MeshBasicMaterial).color.set(this.palette.amber)
  }

  private applyTheme(): void {
    this.palette = resolveScenePalette(this.host)
    const P = this.palette
    this.scene.background = new THREE.Color(P.bg)
    ;(this.walls.material as THREE.MeshBasicMaterial).color.set(P.wall)
    ;(this.furn.material as THREE.MeshBasicMaterial).color.set(P.furn)
    this.gridLines.material.color.set(P.grid)
    for (const r of [this.standin]) {
      r.body.color.set(P.robot)
      r.ring.color.set(P.accent)
      r.lens.color.set(P.accent)
      ;(r.cone.material as THREE.MeshBasicMaterial).color.set(P.accent)
    }
    this.styleLiveRobot()
    if (this.cloud) {
      const u = this.cloud.material.uniforms as CloudUniforms
      u.uWall.value.set(P.pointWall)
      u.uFurn.value.set(P.pointFurn)
      u.uFloor.value.set(P.pointFloor)
      u.uBg.value.set(P.bg)
    }
    this.routeMats.disc.accent.color.set(P.accent)
    this.routeMats.disc.amber.color.set(P.amber)
    this.routeMats.disc.red.color.set(P.red)
    this.routeMats.pole.color.set(P.accent)
    this.goalPin.mat.color.set(this.goal?.refused ? P.red : P.accent)
    this.goalPin.ringMat.color.set(P.robot)
    this.goalLine.material.color.set(P.accent)
    this.poseDraft.mat.color.set(P.accent)
    if (this.scanObj) this.scanObj.material.color.set(cssVar(this.host, '--rh-map-scan', P.red))
    this.repaintFloor()
    this.rebuildRoute()
    this.rebuildZones()
    this.requestRender()
  }

  private applyVisibility(): void {
    const m = this.view
    this.walls.visible = m === 'plan'
    this.furn.visible = m === 'plan' && this.layers.furniture
    this.gridLines.visible = m === 'plan'
    if (this.cloud) {
      const u = this.cloud.material.uniforms as CloudUniforms
      this.cloud.visible = m !== 'plan' || this.layers.points
      u.uMode.value = m === 'fly' && this.colouring === 'height' ? 0 : 1
      u.uCeil.value = m !== 'plan' && this.layers.ceiling ? 1 : 0
      u.uDim.value = m === 'follow' ? 0.8 : m === 'plan' ? 0.7 : 1
      if (m === 'fly') { u.uFogNear.value = 8; u.uFogFar.value = 45 }
      else if (m === 'follow') { u.uFogNear.value = 6; u.uFogFar.value = 30 }
      else { u.uFogNear.value = 500; u.uFogFar.value = 600 }
      this.cloud.geometry.setDrawRange(0, Math.round(this.cloud.geometry.attributes.position.count * this.detail))
    }
    if (this.routeObj) for (const p of this.routeObj.poles) p.visible = m !== 'plan' || this.tilt
    // As the page: depth-tested in Fly, drawn over the walls elsewhere.
    const depth = m === 'fly'
    Object.values(this.routeMats.disc).forEach((mat) => { mat.depthTest = depth })
    this.routeMats.ribbon.depthTest = depth
    this.standin.group.visible = this.followTarget === 'standin' && (m === 'follow' || this.visited.follow)
    this.standin.cone.visible = m === 'follow'
  }

  private drawMinimapBase(): void {
    const mm = this.minimap
    if (!mm) return
    const ctx = mm.base.getContext('2d')
    if (!ctx) return
    drawMinimapBase(ctx, this.floorCanvas, this.data.grid, this.mmFrame, mm.base.width, mm.base.height, this.route, this.blocked,
      { bg: this.palette.bg, accent: this.palette.accent, amber: this.palette.amber })
  }

  // ───────────── internals: input ─────────────

  private listen(): void {
    const on = <K extends keyof HTMLElementEventMap>(
      type: K, fn: (e: HTMLElementEventMap[K]) => void, opts?: AddEventListenerOptions,
    ) => {
      this.host.addEventListener(type, fn as EventListener, opts)
      this.cleanups.push(() => this.host.removeEventListener(type, fn as EventListener, opts))
    }
    on('keydown', (e) => this.onKeyDown(e))
    on('keyup', (e) => { this.keys.delete(e.code); this.requestRender() })
    on('blur', () => { this.keys.clear() })
    on('contextmenu', (e) => { if (!this.isUi(e.target)) e.preventDefault() })
    on('pointerdown', (e) => this.onPointerDown(e))
    on('pointermove', (e) => this.onPointerMove(e))
    on('pointerup', (e) => this.endPointer(e))
    on('pointercancel', (e) => this.endPointer(e))
    on('wheel', (e) => {
      if (this.isUi(e.target)) return
      e.preventDefault()
      this.zoomBy(wheelFactor(e.deltaY), e)
      this.requestRender()
    }, { passive: false })

    const ro = new ResizeObserver(() => { this.resize(); this.requestRender() })
    ro.observe(this.host)
    this.cleanups.push(() => ro.disconnect())

    if (typeof IntersectionObserver !== 'undefined') {
      const io = new IntersectionObserver((entries) => {
        this.visible = entries[entries.length - 1]?.isIntersecting ?? true
        if (this.visible) this.requestRender()
      })
      io.observe(this.host)
      this.cleanups.push(() => io.disconnect())
    }
    const onVis = () => { if (!document.hidden) this.requestRender() }
    document.addEventListener('visibilitychange', onVis)
    this.cleanups.push(() => document.removeEventListener('visibilitychange', onVis))

    const mo = new MutationObserver(() => this.applyTheme())
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    this.cleanups.push(() => mo.disconnect())
    try {
      const mq = matchMedia('(prefers-color-scheme: light)')
      const onScheme = () => this.applyTheme()
      mq.addEventListener('change', onScheme)
      this.cleanups.push(() => mq.removeEventListener('change', onScheme))
    } catch { /* no matchMedia */ }
  }

  private isUi(target: EventTarget | null): boolean {
    return target instanceof Element && !!target.closest('[data-scene-ui]')
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (!sceneOwnsKey(e, this.host)) return
    const robotFollow = this.view === 'follow' && this.followTarget === 'robot'
    if (HELD_KEYS.has(e.code)) {
      e.preventDefault()
      if (robotFollow && !this.detached && MOVE_KEYS.has(e.code)) this.setDetached(true)
      this.keys.add(e.code)
    }
    if (!e.repeat) {
      if (e.code === 'KeyT' && this.view === 'plan') this.cb.onTiltRequest?.(!this.tilt)
      if (REATTACH_KEYS.has(e.code) && robotFollow) { e.preventDefault(); this.reattach() }
      if (e.code === 'Space' && this.view === 'follow' && this.followTarget === 'standin') this.dropHere()
    }
    this.requestRender()
  }

  private ndc(clientX: number, clientY: number): THREE.Vector2 {
    const r = this.host.getBoundingClientRect()
    return new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
  }

  /** Where the view ray through a screen point meets the floor plane (y = 0),
   * in world space; null above the horizon. */
  private floorHit(clientX: number, clientY: number): THREE.Vector3 | null {
    this.updateCamera(false)
    this.raycaster.setFromCamera(this.ndc(clientX, clientY), this.camera)
    const p = new THREE.Vector3()
    return this.raycaster.ray.intersectPlane(this.floorPlane, p) ? p : null
  }

  private floorHitMap(clientX: number, clientY: number): { x: number; y: number } | null {
    const p = this.floorHit(clientX, clientY)
    return p ? { x: toMapX(p.x), y: toMapY(p.z) } : null
  }

  /** The waypoint under a screen point: its label, then its disc or pole by
   * raycast, then the nearest disc within a few pixels (discs are small from
   * a top-down camera). */
  private pickWaypoint(clientX: number, clientY: number): string | null {
    for (const el of this.wpLabels) {
      if (el.hidden || el.style.visibility === 'hidden') continue
      const r = el.getBoundingClientRect()
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) return el.dataset.waypointId ?? null
    }
    if (!this.routeObj || !this.route.length) return null
    this.updateCamera(false)
    this.raycaster.setFromCamera(this.ndc(clientX, clientY), this.camera)
    const hits = this.raycaster.intersectObjects([...this.routeObj.discs, ...this.routeObj.poles.filter((p) => p.visible)], false)
    if (hits.length) return (hits[0].object.userData.waypointId as string) ?? null
    const r = this.host.getBoundingClientRect()
    let best: string | null = null, bestD = PICK_RADIUS_PX
    for (const p of this.route) {
      this.tmp.set(toWorldX(p.x), 0.05, toWorldZ(p.y)).project(this.camera)
      if (this.tmp.z > 1) continue
      const sx = r.left + (this.tmp.x + 1) / 2 * r.width, sy = r.top + (1 - this.tmp.y) / 2 * r.height
      const d = Math.hypot(sx - clientX, sy - clientY)
      if (d < bestD) { bestD = d; best = p.id }
    }
    return best
  }

  private onPointerDown(e: PointerEvent): void {
    if (this.isUi(e.target)) return
    this.host.focus({ preventScroll: true })
    if (this.pointerMode === 'pose') {
      if (e.button !== 0 || this.poseDrag) return
      const p = this.floorHitMap(e.clientX, e.clientY)
      if (!p) return
      try { this.host.setPointerCapture(e.pointerId) } catch { /* not capturable */ }
      this.poseDrag = { id: e.pointerId, last: p }
      this.cb.onFloorPoseDown?.(p.x, p.y)
      return
    }
    try { this.host.setPointerCapture(e.pointerId) } catch { /* not capturable */ }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (this.pointers.size === 1) {
      this.drag = {
        x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t0: performance.now(), moved: false,
        rotate: e.button === 2 || e.shiftKey, button: e.button,
        anchor: this.view === 'plan' ? this.floorHit(e.clientX, e.clientY) : null,
      }
    } else if (this.drag) {
      this.drag.moved = true
      this.drag.pinch = this.pinchDist()
    }
  }

  private pinchDist(): number {
    const p = [...this.pointers.values()]
    return p.length < 2 ? 0 : Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)
  }

  private onPointerMove(e: PointerEvent): void {
    if (this.poseDrag) {
      if (e.pointerId !== this.poseDrag.id) return
      const p = this.floorHitMap(e.clientX, e.clientY)
      if (p) { this.poseDrag.last = p; this.cb.onFloorPoseMove?.(p.x, p.y) }
      return
    }
    const drag = this.drag
    if (!this.pointers.has(e.pointerId) || !drag) return
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (this.pointers.size >= 2) {
      const d = this.pinchDist()
      if (drag.pinch && d) this.zoomBy(drag.pinch / d, null)
      drag.pinch = d
      this.requestRender()
      return
    }
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y
    drag.x = e.clientX
    drag.y = e.clientY
    if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 5) drag.moved = true
    if (!drag.moved) return
    if (this.view === 'plan') {
      if (drag.rotate) {
        this.plan.yaw -= dx * 0.006
        if (this.tilt) { this.tiltMax = clamp(this.tiltMax + dy * 0.004, 0.15, 1); this.tiltT = this.tiltMax }
      } else if (drag.anchor) {
        const p = this.floorHit(e.clientX, e.clientY)
        if (p) { this.plan.tx += drag.anchor.x - p.x; this.plan.tz += drag.anchor.z - p.z }
      }
    } else if (this.view === 'fly') {
      flyLook(this.fly, dx, dy)
    } else if (this.followTarget === 'robot') {
      if (!this.detached) this.setDetached(true)
      flyLook(this.free, dx, dy)
    } else {
      followOrbit(this.follow, dx, dy)
    }
    this.requestRender()
  }

  private endPointer(e: PointerEvent): void {
    if (this.poseDrag && e.pointerId === this.poseDrag.id) {
      const p = (e.type === 'pointerup' ? this.floorHitMap(e.clientX, e.clientY) : null) ?? this.poseDrag.last
      this.poseDrag = null
      this.cb.onFloorPoseUp?.(p.x, p.y)
      return
    }
    if (!this.pointers.has(e.pointerId)) return
    const wasSingle = this.pointers.size === 1
    this.pointers.delete(e.pointerId)
    const drag = this.drag
    if (wasSingle && drag && !drag.moved && e.type === 'pointerup' && drag.button === 0 && e.button === 0
      && isTap({ x: drag.x0, y: drag.y0, t: drag.t0 }, { x: e.clientX, y: e.clientY, t: performance.now() })) {
      this.tap(e.clientX, e.clientY)
    }
    if (!this.pointers.size) this.drag = null
  }

  private tap(clientX: number, clientY: number): void {
    const id = this.pickWaypoint(clientX, clientY)
    if (id) { this.cb.onWaypointClick?.(id); return }
    const p = this.floorHitMap(clientX, clientY)
    if (p) this.cb.onFloorTap?.(p.x, p.y)
  }

  private zoomBy(k: number, e: { clientX: number; clientY: number } | null): void {
    if (this.view === 'plan') {
      const before = e ? this.floorHit(e.clientX, e.clientY) : null
      this.plan.dist = planZoom(this.plan.dist, k)
      if (before && e) {
        const after = this.floorHit(e.clientX, e.clientY)
        if (after) { this.plan.tx += before.x - after.x; this.plan.tz += before.z - after.z }
      }
    } else if (this.view === 'fly') {
      flyZoom(this.fly, k)
    } else if (this.followTarget === 'robot') {
      if (this.detached) flyZoom(this.free, k)
      else this.chase.dist = followZoom(this.chase.dist, k)
    } else {
      this.follow.dist = followZoom(this.follow.dist, k)
    }
  }

  // ───────────── internals: loop ─────────────

  private resize(): void {
    const w = this.host.clientWidth, h = this.host.clientHeight
    if (!w || !h) return
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    if (!this.sized) {
      this.sized = true
      const refit = this.refit
      this.refit = null
      refit?.()
    }
  }

  requestRender(): void {
    if (this.disposed || this.raf) return
    if (!this.visible || (typeof document !== 'undefined' && document.hidden)) return
    this.raf = requestAnimationFrame(this.tick)
  }

  private readonly tick = (now: number): void => {
    this.raf = 0
    if (this.disposed) return
    const dt = this.last === null ? 1 / 60 : Math.min(0.05, (now - this.last) / 1000)
    this.last = now
    const moving = this.step(dt)
    const lerping = this.render()
    if ((moving || lerping) && this.visible && !document.hidden) this.raf = requestAnimationFrame(this.tick)
    else this.last = null
  }

  private heldAny(): boolean {
    for (const k of this.keys) if (HELD_KEYS.has(k) || k === 'up' || k === 'dn') return true
    return false
  }

  /** Advance one frame; true while anything is still moving. */
  private step(dt: number): boolean {
    let active = this.heldAny()
    if (this.view === 'plan') {
      stepPlan(this.plan, this.keys, dt)
      const goal = this.tilt ? this.tiltMax : 0
      this.tiltT = stepTilt(this.tiltT, goal, dt)
      active ||= this.tiltT !== goal
    } else if (this.view === 'fly') {
      stepFly(this.fly, this.keys, dt)
    } else if (this.followTarget === 'standin') {
      const input = followInput(this.keys)
      if ((input.f || input.side || input.turn) && this.preview) this.stopPreview()
      if (this.preview) {
        const W = this.route
        if (this.preview.seg >= W.length) {
          this.stopPreview()
          this.cb.onToast?.('previewFinished')
        } else {
          const p = W[this.preview.seg]
          if (previewStep(this.follow, toWorldX(p.x), toWorldZ(p.y), dt) === 'arrived') this.preview.seg++
        }
      } else if (stepStandin(this.follow, input, dt, this.standOk) === 'bumped') {
        this.bump()
      }
      active ||= !!this.preview || this.follow.gait > 0.01
    } else if (this.detached) {
      stepFly(this.free, this.keys, dt)
    }
    // The live robot eases toward its latest pose in every view.
    if (this.robotTarget && this.robotShown) {
      active = lerpPose(this.robotShown, this.robotTarget, dt, LIVE_ROBOT_RATE) || active
      this.chase.x = toWorldX(this.robotShown.x)
      this.chase.z = toWorldZ(this.robotShown.y)
      this.chase.heading = this.robotShown.yaw
    }
    return active
  }

  /** Place the camera for the current view. With `lerp`, Follow's chase
   * camera takes its per-frame step toward where it wants to be (as the page,
   * 18% a frame); without, it stays put (for picking between frames). Returns
   * whether the chase camera is still on its way. */
  private updateCamera(lerp: boolean): boolean {
    const cam = this.camera
    let lerping = false
    if (this.view === 'plan') {
      cam.fov = PLAN_FOV
      const p = planPosition(this.plan, this.tiltT)
      cam.position.set(p.x, p.y, p.z)
      cam.up.set(0, 1, 0)
      cam.lookAt(this.plan.tx, 0, this.plan.tz)
    } else if (this.view === 'fly' || (this.followTarget === 'robot' && this.detached)) {
      const f = this.view === 'fly' ? this.fly : this.free
      cam.fov = this.view === 'fly' ? FLY_FOV : FOLLOW_FOV
      cam.position.set(f.x, f.y, f.z)
      cam.rotation.set(f.pitch, f.yaw, 0, 'YXZ')
    } else {
      cam.fov = FOLLOW_FOV
      const body = this.followTarget === 'standin' ? this.follow : this.chase
      const w = followWant(body)
      this.tmp.set(w.x, w.y, w.z)
      if (!this.followCamInit) { this.followCamPos.copy(this.tmp); this.followCamInit = true }
      else if (lerp) this.followCamPos.lerp(this.tmp, 0.18)
      lerping = this.followCamPos.distanceToSquared(this.tmp) > 4e-6
      cam.position.copy(this.followCamPos)
      cam.up.set(0, 1, 0)
      cam.lookAt(body.x, 0.4, body.z)
    }
    cam.updateProjectionMatrix()
    cam.updateMatrixWorld()
    return lerping
  }

  /** Draw one frame; true while the chase camera is still easing. */
  private render(): boolean {
    const lerping = this.updateCamera(true)
    const rise = easeInOut(this.tiltT)
    this.walls.scale.y = 0.02 + rise * 1.4
    this.furn.scale.y = 0.01 + rise * 0.55

    const s = this.standin
    s.group.position.set(this.follow.x, 0, this.follow.z)
    s.group.rotation.y = this.follow.heading
    poseLegs(s, this.follow.walkPhase, this.follow.gait)
    const live = this.robotShown
    this.live.group.visible = !!live
    if (live) {
      this.live.group.position.set(toWorldX(live.x), 0, toWorldZ(live.y))
      this.live.group.rotation.y = live.yaw
    }
    const showLine = !!(this.goal && this.goalLineOn && live)
    this.goalLine.visible = showLine
    if (showLine && live && this.goal) {
      const pos = this.goalLine.geometry.attributes.position as THREE.BufferAttribute
      pos.setXYZ(0, toWorldX(live.x), 0.05, toWorldZ(live.y))
      pos.setXYZ(1, toWorldX(this.goal.x), 0.05, toWorldZ(this.goal.y))
      pos.needsUpdate = true
      this.goalLine.computeLineDistances()
    }

    const chaseOn = this.view === 'follow' && !(this.followTarget === 'robot' && this.detached)
    const chaseDist = this.followTarget === 'standin' ? this.follow.dist : this.chase.dist
    const bufH = this.renderer.getDrawingBufferSize(new THREE.Vector2()).y
    const pr = this.renderer.getPixelRatio()
    const u = this.cloud?.material.uniforms as CloudUniforms | undefined
    if (u) {
      u.uScale.value = bufH / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2))
      u.uSize.value = (this.view === 'follow' ? 0.035 : this.view === 'plan' ? 0.04 : 0.045) * this.sizeScale
      u.uNearCut.value = chaseOn ? Math.min(chaseDist * 0.75, 2.5) : 0
      u.uHCut.value = chaseOn ? 1.3 : 99
      // The page's caps, unscaled: the density boost is for far points; near
      // ones are already at the cap, and bigger would turn stray points to blobs.
      u.uMax.value = (this.view === 'follow' ? 6 : 8) * pr
    }

    const w = this.host.clientWidth, h = this.host.clientHeight
    this.renderer.setScissorTest(false)
    this.renderer.setViewport(0, 0, w, h)
    this.renderer.render(this.scene, this.camera)

    // The robot-eye inset (Follow on the stand-in).
    if (this.view === 'follow' && this.followTarget === 'standin' && this.layers.pip && this.pipEl && u) {
      const sr = this.host.getBoundingClientRect(), r = this.pipEl.getBoundingClientRect()
      if (r.width > 0 && r.height > 0) {
        const x = r.left - sr.left, y = sr.bottom - r.bottom
        this.eyeCam.aspect = r.width / r.height
        this.eyeCam.position.set(this.follow.x + Math.cos(this.follow.heading) * 0.42, 0.44, this.follow.z - Math.sin(this.follow.heading) * 0.42)
        this.eyeCam.rotation.set(-0.08, this.follow.heading - Math.PI / 2, 0, 'YXZ')
        this.eyeCam.updateProjectionMatrix()
        this.eyeCam.updateMatrixWorld()
        u.uScale.value = bufH / (2 * Math.tan(THREE.MathUtils.degToRad(this.eyeCam.fov) / 2))
        const dim = u.uDim.value, nc = u.uNearCut.value, hc = u.uHCut.value
        u.uDim.value = 1; u.uNearCut.value = 0.25; u.uHCut.value = 99
        s.group.visible = false
        this.renderer.setScissorTest(true)
        this.renderer.setScissor(x, y, r.width, r.height)
        this.renderer.setViewport(x, y, r.width, r.height)
        this.renderer.render(this.scene, this.eyeCam)
        this.renderer.setScissorTest(false)
        s.group.visible = true
        u.uDim.value = dim; u.uNearCut.value = nc; u.uHCut.value = hc
      }
    }

    this.placeLabels(w, h)

    if (this.scaleBarEls && this.view === 'plan' && !this.tilt) {
      const sb = scaleBar(this.plan.dist, h)
      this.scaleBarEls.bar.style.width = `${sb.px}px`
      this.scaleBarEls.text.textContent = `${sb.metres} m`
    }
    if (this.minimap && this.view === 'fly') {
      const mm = this.minimap
      const [x, y] = minimapPoint(this.mmFrame, mm.canvas.width, mm.canvas.height, toMapX(this.fly.x), toMapY(this.fly.z))
      drawMinimapView(mm.ctx, mm.base, x, y, minimapHeading(this.fly.yaw), this.palette.accent)
    }
    return lerping
  }

  private placeLabels(sw: number, sh: number): void {
    const lift = this.view === 'plan' && !this.tilt ? 0.05 : 0.72
    const place = (el: HTMLElement, x: number, y: number, h: number) => {
      this.tmp.set(toWorldX(x), h, toWorldZ(y)).project(this.camera)
      const off = this.tmp.z > 1 || Math.abs(this.tmp.x) > 1.2 || Math.abs(this.tmp.y) > 1.2
      el.style.visibility = off ? 'hidden' : 'visible'
      if (!off) {
        el.style.left = `${(this.tmp.x + 1) / 2 * sw}px`
        el.style.top = `${(1 - this.tmp.y) / 2 * sh}px`
      }
    }
    this.route.forEach((p, k) => { const el = this.wpLabels[k]; if (el) place(el, p.x, p.y, lift) })
    for (const l of this.legLabels) place(l.el, l.x, l.y, 0.05)
  }
}
