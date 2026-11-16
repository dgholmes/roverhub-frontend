import * as THREE from 'three'
import { boxWorld, type SceneEditBox, type SceneBoxTone } from '../boxSelect'

/**
 * What the map editor lays over the scene: the boxes being selected or staged
 * for deletion, and the points the moving-object check took out. Built only
 * when a host passes them (MapScene's `editBoxes` / `highlightPoints`), so
 * LiveOps and the route editor never create any of it.
 */

export interface EditColours {
  accent: THREE.Color
  red: THREE.Color
  amber: THREE.Color
}

/** Fill opacity and edge colour per tone: the box being dragged in the accent,
 *  boxes staged for deletion red, moved blobs staged for removal amber. */
export function boxToneStyle(tone: SceneBoxTone): { colour: keyof EditColours; fill: number } {
  if (tone === 'draft') return { colour: 'accent', fill: 0.12 }
  if (tone === 'moved') return { colour: 'amber', fill: 0.1 }
  return { colour: 'red', fill: 0.16 }
}

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1)
const UNIT_EDGES = new THREE.EdgesGeometry(UNIT_BOX)

/** One group of translucent boxes with solid edges. The unit geometries are
 *  shared and scaled per box; only materials are made per box. */
export function buildEditBoxes(boxes: readonly SceneEditBox[], colours: EditColours): THREE.Group {
  const group = new THREE.Group()
  group.userData.sharedGeometry = true
  for (const b of boxes) {
    const { center, size } = boxWorld(b)
    if (!(size[0] > 0 && size[1] > 0 && size[2] > 0)) continue
    const st = boxToneStyle(b.tone)
    const fill = new THREE.Mesh(UNIT_BOX, new THREE.MeshBasicMaterial({
      color: colours[st.colour], transparent: true, opacity: st.fill, depthWrite: false,
    }))
    const edges = new THREE.LineSegments(UNIT_EDGES, new THREE.LineBasicMaterial({
      color: colours[st.colour], transparent: true, opacity: 0.95, depthTest: false,
    }))
    for (const o of [fill, edges]) {
      o.position.set(center[0], center[1], center[2])
      o.scale.set(size[0], size[1], size[2])
      o.renderOrder = 5
      o.userData.boxId = b.id
      group.add(o)
    }
  }
  return group
}

/** Dispose a group from buildEditBoxes: its materials, never the shared unit
 *  geometry. */
export function disposeEditBoxes(group: THREE.Group): void {
  group.traverse((o) => {
    const mat = (o as THREE.Mesh).material as THREE.Material | undefined
    mat?.dispose()
  })
}

/** x, y, height triples (map metres) to world positions (x, height, -y). */
export function highlightPositions(xyh: Float32Array): Float32Array {
  const n = Math.floor(xyh.length / 3)
  const out = new Float32Array(n * 3)
  for (let k = 0; k < n; k++) {
    out[k * 3] = xyh[k * 3]
    out[k * 3 + 1] = xyh[k * 3 + 2]
    out[k * 3 + 2] = -xyh[k * 3 + 1]
  }
  return out
}

/** The moved points: fixed-size dots drawn over the cloud. */
export function buildHighlightPoints(xyh: Float32Array, colour: THREE.Color): THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial> {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(highlightPositions(xyh), 3))
  const mat = new THREE.PointsMaterial({ size: 3.5, sizeAttenuation: false, color: colour, transparent: true, opacity: 0.95, depthWrite: false })
  const pts = new THREE.Points(geo, mat)
  pts.frustumCulled = false
  pts.renderOrder = 4
  return pts
}
