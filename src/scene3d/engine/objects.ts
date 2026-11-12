import * as THREE from 'three'
import type { SceneGrid, SceneRouteWaypoint, SceneZone } from '../types'
import { mergeRects } from './rects'
import { toWorldX, toWorldZ } from './coords'

/**
 * The scene's meshes, as the options page builds them. Each builder returns
 * plain three objects; the engine owns them and disposes them.
 */

/** Dispose every geometry and material under `root` (textures are the
 * caller's: the floor's is shared with the minimap). */
export function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    const m = o as THREE.Mesh
    if (m.geometry) m.geometry.dispose()
    const mat = m.material as THREE.Material | THREE.Material[] | undefined
    if (Array.isArray(mat)) mat.forEach((x) => x.dispose())
    else if (mat) mat.dispose()
  })
}

/** The floor plane, sized to the grid, carrying the painted floor canvas.
 * Unknown cells are transparent (alpha test). */
export function buildFloor(grid: SceneGrid, canvas: HTMLCanvasElement, maxAnisotropy: number): {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>
  texture: THREE.CanvasTexture
} {
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = maxAnisotropy
  texture.magFilter = THREE.NearestFilter
  const W = grid.w * grid.res, H = grid.h * grid.res
  const geo = new THREE.PlaneGeometry(W, H)
  geo.rotateX(-Math.PI / 2)
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: texture, alphaTest: 0.5 }))
  mesh.position.set(toWorldX(grid.origin[0] + W / 2), -0.02, toWorldZ(grid.origin[1] + H / 2))
  return { mesh, texture }
}

/** A unit box standing on y = 0, with per-face shade factors so a flat colour
 * still reads as 3D: +x -x +y -y +z -z. */
export function shadedBoxGeometry(): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(1, 1, 1)
  g.translate(0, 0.5, 0)
  const f = [0.62, 0.62, 1, 0.4, 0.8, 0.8]
  const col = new Float32Array(g.attributes.position.count * 3)
  for (let face = 0; face < 6; face++) {
    for (let v = 0; v < 4; v++) col.fill(f[face], (face * 4 + v) * 3, (face * 4 + v) * 3 + 3)
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3))
  return g
}

/** One instanced box per merged rectangle of `bit` cells, 1 m tall: the
 * engine scales the mesh's height with the tilt. */
export function buildBoxes(grid: SceneGrid, bit: number): THREE.InstancedMesh {
  const list = mergeRects(grid, bit)
  const mesh = new THREE.InstancedMesh(shadedBoxGeometry(), new THREE.MeshBasicMaterial({ vertexColors: true }), Math.max(1, list.length))
  mesh.count = list.length
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3()
  const { res, origin } = grid
  list.forEach((r, k) => {
    p.set(toWorldX(origin[0] + (r.i0 + r.i1) / 2 * res), 0, toWorldZ(origin[1] + (r.j0 + r.j1) / 2 * res))
    s.set((r.i1 - r.i0) * res, 1, (r.j1 - r.j0) * res)
    mesh.setMatrixAt(k, m.compose(p, q, s))
  })
  mesh.instanceMatrix.needsUpdate = true
  // The instances span the floor; the one box at the origin would cull them all.
  mesh.frustumCulled = false
  return mesh
}

/** The map-metre bounds of the grid's content box. */
export function contentBounds(grid: SceneGrid): { x0: number; x1: number; y0: number; y1: number } {
  const { minX, minY, maxX, maxY } = grid.content
  return {
    x0: grid.origin[0] + minX * grid.res, x1: grid.origin[0] + (maxX + 1) * grid.res,
    y0: grid.origin[1] + minY * grid.res, y1: grid.origin[1] + (maxY + 1) * grid.res,
  }
}

/** The 1 m reference grid over the surveyed area plus a metre each side. */
export function buildGridLines(grid: SceneGrid): THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial> {
  const b = contentBounds(grid)
  const x0 = Math.floor(b.x0) - 1, x1 = Math.ceil(b.x1) + 1, y0 = Math.floor(b.y0) - 1, y1 = Math.ceil(b.y1) + 1
  const v: number[] = []
  for (let x = x0; x <= x1; x++) v.push(toWorldX(x), 0.004, toWorldZ(y0), toWorldX(x), 0.004, toWorldZ(y1))
  for (let y = y0; y <= y1; y++) v.push(toWorldX(x0), 0.004, toWorldZ(y), toWorldX(x1), 0.004, toWorldZ(y))
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  const lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false }))
  lines.renderOrder = 1
  return lines
}

export interface RobotBody {
  group: THREE.Group
  body: THREE.MeshLambertMaterial
  dark: THREE.MeshLambertMaterial
  lens: THREE.MeshBasicMaterial
  ring: THREE.MeshBasicMaterial
  legs: THREE.Group[]
  cone: THREE.Mesh
  /** The amber "estimated position" dot above the body. */
  estimated: THREE.Mesh
}

/** The page's stand-in quadruped. Forward is local +X, so rotation.y is the
 * map yaw. Includes the front camera's footprint cone (72 degrees, 3.2 m). */
export function buildRobotBody(): RobotBody {
  const g = new THREE.Group()
  const body = new THREE.MeshLambertMaterial()
  const dark = new THREE.MeshLambertMaterial({ color: 0x2a2a2e })
  const lens = new THREE.MeshBasicMaterial({ color: 0x0a84ff })
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.16, 0.26), body)
  torso.position.y = 0.4
  g.add(torso)
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.2), dark)
  head.position.set(0.33, 0.43, 0)
  g.add(head)
  const lensMesh = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.12), lens)
  lensMesh.position.set(0.405, 0.44, 0)
  g.add(lensMesh)
  const legs: THREE.Group[] = []
  for (const [lx, lz] of [[0.2, 0.15], [0.2, -0.15], [-0.2, 0.15], [-0.2, -0.15]]) {
    const hip = new THREE.Group()
    hip.position.set(lx, 0.36, lz)
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.36, 0.05), dark)
    leg.position.y = -0.18
    hip.add(leg)
    g.add(hip)
    legs.push(hip)
  }
  const ring = new THREE.MeshBasicMaterial({ color: 0x0a84ff, transparent: true, opacity: 0.85, depthWrite: false })
  const ringMesh = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 48), ring)
  ringMesh.rotation.x = -Math.PI / 2
  ringMesh.position.y = 0.035
  g.add(ringMesh)
  const fov = THREE.MathUtils.degToRad(72), r = 3.2
  const shape = new THREE.Shape()
  shape.moveTo(0.3, 0)
  for (let k = 0; k <= 16; k++) {
    const a = -fov / 2 + fov * k / 16
    shape.lineTo(0.3 + Math.cos(a) * r, Math.sin(a) * r)
  }
  shape.lineTo(0.3, 0)
  const cone = new THREE.Mesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({
    color: 0x0a84ff, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide,
  }))
  cone.rotation.x = -Math.PI / 2
  cone.position.y = 0.025
  g.add(cone)
  const estimated = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff9f0a, depthTest: false }))
  estimated.position.set(0.2, 0.72, 0.18)
  estimated.renderOrder = 7
  estimated.visible = false
  g.add(estimated)
  return { group: g, body, dark, lens, ring, legs, cone, estimated }
}

/** Swing the legs: diagonal pairs in phase, as the page. */
export function poseLegs(robot: RobotBody, walkPhase: number, gait: number): void {
  robot.legs.forEach((leg, k) => {
    leg.rotation.z = Math.sin(walkPhase + (k === 0 || k === 3 ? 0 : Math.PI)) * 0.45 * gait
  })
}

export interface RouteMaterials {
  disc: Record<'accent' | 'amber' | 'red', THREE.MeshBasicMaterial>
  pole: THREE.MeshBasicMaterial
  ribbon: THREE.MeshBasicMaterial
}

export function routeMaterials(): RouteMaterials {
  const disc = (hex: number) => new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.95 })
  return {
    disc: { accent: disc(0x0a84ff), amber: disc(0xff9f0a), red: disc(0xff453a) },
    pole: new THREE.MeshBasicMaterial({ color: 0x0a84ff }),
    ribbon: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }),
  }
}

export const WP_GEOMETRY = (): THREE.CylinderGeometry => new THREE.CylinderGeometry(0.16, 0.16, 0.04, 24)
export const POLE_GEOMETRY = (): THREE.CylinderGeometry => {
  const g = new THREE.CylinderGeometry(0.012, 0.012, 0.7, 8)
  g.translate(0, 0.35, 0)
  return g
}

/**
 * The route as the page draws it: an 18 cm ribbon on the floor (amber on a
 * leg that leaves the walkable area), a disc per waypoint and a 0.7 m pole.
 * Discs carry `userData.waypointId` for picking. Shared geometries and
 * materials are the caller's; only the ribbon geometry is new.
 */
export function buildRoute(
  route: readonly SceneRouteWaypoint[], blocked: readonly boolean[], selectedId: string | null | undefined,
  shared: { mats: RouteMaterials; disc: THREE.BufferGeometry; pole: THREE.BufferGeometry },
  colours: { accent: THREE.Color; amber: THREE.Color },
): { group: THREE.Group; discs: THREE.Mesh[]; poles: THREE.Mesh[]; ribbon: THREE.Mesh | null } {
  const group = new THREE.Group()
  let ribbon: THREE.Mesh | null = null
  if (route.length > 1) {
    const pos: number[] = [], col: number[] = [], idx: number[] = []
    for (let k = 1; k < route.length; k++) {
      const ax = toWorldX(route[k - 1].x), az = toWorldZ(route[k - 1].y), bx = toWorldX(route[k].x), bz = toWorldZ(route[k].y)
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, nx = -dz / l * 0.09, nz = dx / l * 0.09
      const base = pos.length / 3
      pos.push(ax + nx, 0.04, az + nz, ax - nx, 0.04, az - nz, bx + nx, 0.04, bz + nz, bx - nx, 0.04, bz - nz)
      const c = blocked[k - 1] ? colours.amber : colours.accent
      for (let v = 0; v < 4; v++) col.push(c.r, c.g, c.b)
      idx.push(base, base + 2, base + 1, base + 1, base + 2, base + 3)
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    geo.setIndex(idx)
    ribbon = new THREE.Mesh(geo, shared.mats.ribbon)
    ribbon.renderOrder = 5
    group.add(ribbon)
  }
  const discs: THREE.Mesh[] = [], poles: THREE.Mesh[] = []
  route.forEach((p) => {
    const tone = p.flag === 'error' ? 'red' : p.flag === 'warning' ? 'amber' : 'accent'
    const disc = new THREE.Mesh(shared.disc, shared.mats.disc[tone])
    disc.position.set(toWorldX(p.x), 0.05, toWorldZ(p.y))
    if (p.id === selectedId) disc.scale.set(1.45, 1, 1.45)
    disc.renderOrder = 6
    disc.userData.waypointId = p.id
    group.add(disc)
    discs.push(disc)
    const pole = new THREE.Mesh(shared.pole, shared.mats.pole)
    pole.position.copy(disc.position)
    pole.renderOrder = 6
    pole.userData.waypointId = p.id
    group.add(pole)
    poles.push(pole)
  })
  return { group, discs, poles, ribbon }
}

/** A flat polygon in map metres as an XZ shape geometry at height `y`. */
export function polygonGeometry(points: readonly [number, number][], y: number): THREE.ShapeGeometry {
  const shape = new THREE.Shape(points.map(([x, py]) => new THREE.Vector2(x, py)))
  const geo = new THREE.ShapeGeometry(shape)
  // XY -> XZ: (x, y, 0) -> (x, 0, -y), which is exactly map -> world.
  geo.rotateX(-Math.PI / 2)
  geo.translate(0, y, 0)
  return geo
}

/** A closed outline in map metres at height `y`. */
export function outlineGeometry(points: readonly [number, number][], y: number): THREE.BufferGeometry {
  const v: number[] = []
  for (const [x, py] of points) v.push(toWorldX(x), y, toWorldZ(py))
  if (points.length) v.push(toWorldX(points[0][0]), y, toWorldZ(points[0][1]))
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
  return geo
}

/** Zone styles, as the Leaflet map draws them: no-go a red fill at 0.12 with a
 * red outline, geofence a dashed grey outline, stairs amber like no-go. */
export function zoneStyle(kind: SceneZone['kind']): { fill: 'red' | 'amber' | null; line: 'red' | 'amber' | 'grey'; dashed: boolean } {
  if (kind === 'no_go') return { fill: 'red', line: 'red', dashed: false }
  if (kind === 'stairs') return { fill: 'amber', line: 'amber', dashed: false }
  return { fill: null, line: 'grey', dashed: true }
}

export function buildZones(zones: readonly SceneZone[], colours: { red: THREE.Color; amber: THREE.Color; grey: THREE.Color }): THREE.Group {
  const group = new THREE.Group()
  for (const z of zones) {
    if (z.points.length < 3) continue
    const st = zoneStyle(z.kind)
    if (st.fill) {
      const fill = new THREE.Mesh(polygonGeometry(z.points, 0.012), new THREE.MeshBasicMaterial({
        color: colours[st.fill], transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide,
      }))
      fill.renderOrder = 2
      group.add(fill)
    }
    const lineColour = st.line === 'grey' ? colours.grey : colours[st.line]
    const mat = st.dashed
      ? new THREE.LineDashedMaterial({ color: lineColour, dashSize: 0.3, gapSize: 0.2, transparent: true, depthWrite: false })
      : new THREE.LineBasicMaterial({ color: lineColour, transparent: true, depthWrite: false })
    const line = new THREE.Line(outlineGeometry(z.points, 0.016), mat)
    if (st.dashed) line.computeLineDistances()
    line.renderOrder = 3
    group.add(line)
  }
  return group
}

/** The goal pin: a disc and pole like a waypoint, with a ring. */
export function buildGoalPin(): { group: THREE.Group; mat: THREE.MeshBasicMaterial; ringMat: THREE.MeshBasicMaterial } {
  const group = new THREE.Group()
  const mat = new THREE.MeshBasicMaterial({ color: 0x0a84ff })
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xe8e8ea, transparent: true, opacity: 0.9, depthWrite: false })
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 32), mat)
  disc.position.y = 0.05
  disc.renderOrder = 6
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.22, 0.28, 40), ringMat)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.08
  ring.renderOrder = 6
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.9, 8), mat)
  pole.position.y = 0.45
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.07, 16, 12), mat)
  head.position.y = 0.92
  group.add(disc, ring, pole, head)
  return { group, mat, ringMat }
}

/** The robot -> goal dashed line, two points updated in place. */
export function buildGoalLine(): THREE.Line<THREE.BufferGeometry, THREE.LineDashedMaterial> {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
  const line = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0x0a84ff, dashSize: 0.25, gapSize: 0.25, transparent: true, depthWrite: false }))
  line.renderOrder = 4
  line.frustumCulled = false
  return line
}

/** The Set position draft: a ring with an arrow along +X (rotation.y = yaw). */
export function buildPoseDraft(): { group: THREE.Group; mat: THREE.MeshBasicMaterial } {
  const group = new THREE.Group()
  const mat = new THREE.MeshBasicMaterial({ color: 0x0a84ff, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide })
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.38, 40), mat)
  ring.rotation.x = -Math.PI / 2
  const shape = new THREE.Shape()
  shape.moveTo(0.95, 0)
  shape.lineTo(0.55, 0.2)
  shape.lineTo(0.55, 0.06)
  shape.lineTo(0.38, 0.06)
  shape.lineTo(0.38, -0.06)
  shape.lineTo(0.55, -0.06)
  shape.lineTo(0.55, -0.2)
  shape.closePath()
  const arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat)
  arrow.rotation.x = -Math.PI / 2
  group.add(ring, arrow)
  group.position.y = 0.06
  group.renderOrder = 6
  ring.renderOrder = 6
  arrow.renderOrder = 6
  return { group, mat }
}

/** Live lidar points (x, y pairs, map metres), drawn at `height` above the floor. */
export function scanPositions(scan: Float32Array, height: number): Float32Array {
  const n = Math.floor(scan.length / 2)
  const out = new Float32Array(n * 3)
  for (let k = 0; k < n; k++) {
    out[k * 3] = toWorldX(scan[k * 2])
    out[k * 3 + 1] = height
    out[k * 3 + 2] = toWorldZ(scan[k * 2 + 1])
  }
  return out
}
