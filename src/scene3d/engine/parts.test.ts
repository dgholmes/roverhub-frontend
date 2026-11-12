import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { CLS_FLOOR, CLS_WALL, GRID_WALL, type SceneCloud } from '../types'
import { PROTOTYPE_POINTS_PER_M2, buildCloud, cloudWorldPositions, pointSizeScale } from './cloud'
import { HELD_KEYS, MOVE_KEYS, isTap, keyHints, sceneOwnsKey } from './input'
import { floorSourceRect, minimapFrame, minimapPoint, minimapSize, minimapToMap } from './minimap'
import { buildBoxes, buildRoute, polygonGeometry, routeMaterials, scanPositions, zoneStyle } from './objects'
import { gridFrom } from './testGrid'

describe('taps and keys', () => {
  it('calls a press a tap within 5 px and 500 ms, and anything else a drag', () => {
    const down = { x: 100, y: 100, t: 0 }
    expect(isTap(down, { x: 103, y: 104, t: 200 })).toBe(true)
    expect(isTap(down, { x: 106, y: 100, t: 200 })).toBe(false)
    expect(isTap(down, { x: 100, y: 100, t: 501 })).toBe(false)
  })

  it('takes keys only from the scene element itself, without a command modifier', () => {
    const host = {} as EventTarget, button = {} as EventTarget
    const e = { target: host, metaKey: false, ctrlKey: false, altKey: false }
    expect(sceneOwnsKey(e, host)).toBe(true)
    expect(sceneOwnsKey({ ...e, target: button }, host)).toBe(false)
    expect(sceneOwnsKey({ ...e, ctrlKey: true }, host)).toBe(false)
  })

  it('holds the page keys, and lets go of the robot only on movement keys', () => {
    for (const k of ['KeyW', 'KeyR', 'Space', 'ShiftLeft', 'ArrowUp']) expect(HELD_KEYS.has(k)).toBe(true)
    expect(MOVE_KEYS.has('KeyR')).toBe(false)
    expect(MOVE_KEYS.has('KeyT')).toBe(false)
    expect(MOVE_KEYS.has('KeyW')).toBe(true)
  })

  it('lists the page key maps per view', () => {
    const labels = (v: 'plan' | 'fly' | 'follow', target: 'robot' | 'standin' = 'standin') =>
      keyHints(v, { followTarget: target, pointerMode: 'tap' }).map((h) => `${h.keys.join(' ')}=${h.label}`)
    expect(labels('plan')).toEqual(['W A S D=pan', '↑ ← ↓ →=pan', 'Q E=rotate', 'R F=zoomInOut', 'T=tilt',
      'Drag=dragPan', 'Scroll=scrollZoom', 'Click=clickWaypoint'])
    expect(labels('fly')).toContain('Space E=up')
    expect(labels('follow')).toContain('Space=dropWaypoint')
    expect(labels('follow', 'robot')).toContain('B Home=backToRobot')
    expect(labels('plan', 'robot')).toContain('Click=clickPoint')
  })

  it('drops camera-drag hints while setting a pose, and uses the touch map on touch', () => {
    const pose = keyHints('plan', { followTarget: 'robot', pointerMode: 'pose' })
    expect(pose.filter((h) => h.keys[0] === 'Drag').map((h) => h.label)).toEqual(['dragPose'])
    const touch = keyHints('fly', { followTarget: 'standin', pointerMode: 'tap', touch: true })
    expect(touch.map((h) => h.label)).toEqual(['look', 'pinchForward', 'arrowsMove', 'tapWaypoint'])
  })
})

describe('minimap', () => {
  const g = gridFrom(['..', '..', '..', '..'], 0.5, [10, 20])   // 1 m wide, 2 m tall

  it('frames the content with a margin, inside the grid', () => {
    expect(minimapFrame(g)).toEqual({ x0: 10, y0: 20, x1: 11, y1: 22 })
    const wide = { ...gridFrom(Array(40).fill('k'.repeat(40))), content: { minX: 20, minY: 10, maxX: 29, maxY: 19 } }
    expect(minimapFrame(wide, 2)).toEqual({ x0: 18, y0: 8, x1: 32, y1: 22 })
  })

  it('keeps the aspect, shrinking the width rather than growing past 420 px tall', () => {
    expect(minimapSize({ x0: 0, y0: 0, x1: 2, y1: 1 })).toEqual({ w: 336, h: 168 })
    expect(minimapSize({ x0: 0, y0: 0, x1: 1, y1: 2 })).toEqual({ w: 210, h: 420 })
  })

  it('maps north up, and a click back to the same point', () => {
    const f = minimapFrame(g)
    expect(minimapPoint(f, 100, 200, 10, 20)).toEqual([0, 200])
    expect(minimapPoint(f, 100, 200, 11, 22)).toEqual([100, 0])
    expect(minimapToMap(f, 0.5, 0.25)).toEqual({ x: 10.5, y: 21.5 })
  })

  it('reads the frame off the north-up floor canvas', () => {
    const grid = { ...gridFrom(Array(40).fill('k'.repeat(40))), content: { minX: 20, minY: 10, maxX: 29, maxY: 19 } }
    expect(floorSourceRect(grid, { x0: 18, y0: 8, x1: 32, y1: 22 })).toEqual({ sx: 18, sy: 18, sw: 14, sh: 14 })
  })
})

describe('cloud', () => {
  const cloud: SceneCloud = {
    count: 2,
    xyh: new Float32Array([1, 2, 0.5, -3, 4, 2.5]),
    cls: new Uint8Array([CLS_FLOOR, CLS_WALL]),
  }

  it('puts height on Y and map y on -Z', () => {
    expect([...cloudWorldPositions(cloud)]).toEqual([1, 0.5, -2, -3, 2.5, -4])
  })

  it('carries the class per point and is never frustum-culled', () => {
    const pts = buildCloud(cloud)
    expect([...(pts.geometry.getAttribute('cls').array as Float32Array)]).toEqual([CLS_FLOOR, CLS_WALL])
    expect(pts.frustumCulled).toBe(false)
    expect(pts.material.uniforms.uMode.value).toBe(1)
    pts.geometry.dispose(); pts.material.dispose()
  })

  it('draws a sparser cloud with bigger points, never smaller than the page, capped', () => {
    const grid = { res: 0.05, content: { minX: 0, minY: 0, maxX: 199, maxY: 199 } }   // 100 m^2
    expect(pointSizeScale(PROTOTYPE_POINTS_PER_M2 * 100, grid)).toBeCloseTo(1, 5)
    expect(pointSizeScale(PROTOTYPE_POINTS_PER_M2 * 100 / 4, grid)).toBeCloseTo(2, 5)
    expect(pointSizeScale(PROTOTYPE_POINTS_PER_M2 * 1000, grid)).toBe(1)
    expect(pointSizeScale(10, grid)).toBe(2.2)
    expect(pointSizeScale(0, grid)).toBe(1)
  })
})

describe('objects', () => {
  it('makes one box per merged wall rectangle', () => {
    const g = gridFrom(['WW.', 'WW.', '..W'])
    const boxes = buildBoxes(g, GRID_WALL)
    expect(boxes.count).toBe(2)
    const m = new THREE.Matrix4()
    boxes.getMatrixAt(0, m)
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3()
    m.decompose(p, q, s)
    expect(s.x).toBeCloseTo(1)    // the lone cell at (2, 0)
    boxes.getMatrixAt(1, m)
    m.decompose(p, q, s)
    expect([s.x, s.z]).toEqual([2, 2])
    expect([p.x, p.z]).toEqual([1, -2])
  })

  it('lays a polygon in map metres flat on the floor at the same map point', () => {
    const geo = polygonGeometry([[1, 2], [3, 2], [3, 5]], 0.01)
    const pos = geo.getAttribute('position')
    const pts = Array.from({ length: pos.count }, (_, k) => [pos.getX(k), pos.getY(k), pos.getZ(k)].map((v) => Math.round(v * 100) / 100))
    expect(pts).toContainEqual([3, 0.01, -5])
    expect(pts).toContainEqual([1, 0.01, -2])
  })

  it('styles zones as the flat map does', () => {
    expect(zoneStyle('no_go')).toEqual({ fill: 'red', line: 'red', dashed: false })
    expect(zoneStyle('geofence')).toEqual({ fill: null, line: 'grey', dashed: true })
    expect(zoneStyle('stairs')).toEqual({ fill: 'amber', line: 'amber', dashed: false })
  })

  it('builds the route: amber blocked legs, flagged and selected discs, ids for picking', () => {
    const mats = routeMaterials()
    const accent = new THREE.Color('#0a84ff'), amber = new THREE.Color('#ff9f0a')
    const r = buildRoute(
      [{ id: 'a', x: 0, y: 0, label: 'A' }, { id: 'b', x: 2, y: 0, label: 'B', flag: 'error' }, { id: 'c', x: 2, y: 2, label: 'C' }],
      [false, true], 'c',
      { mats, disc: new THREE.CylinderGeometry(), pole: new THREE.CylinderGeometry() }, { accent, amber })
    expect(r.discs.map((d) => d.userData.waypointId)).toEqual(['a', 'b', 'c'])
    expect(r.discs[1].material).toBe(mats.disc.red)
    expect(r.discs[2].scale.x).toBeGreaterThan(1)
    const col = r.ribbon!.geometry.getAttribute('color')
    expect(col.getX(0)).toBeCloseTo(accent.r)
    expect(col.getX(4)).toBeCloseTo(amber.r)   // second leg's first vertex
    expect(r.discs[1].position.toArray()).toEqual([2, 0.05, -0])
  })

  it('lifts live scan pairs into world points', () => {
    expect([...scanPositions(new Float32Array([1, 2, 3, 4]), 0.3)].map((v) => Math.round(v * 10) / 10)).toEqual([1, 0.3, -2, 3, 0.3, -4])
  })
})
