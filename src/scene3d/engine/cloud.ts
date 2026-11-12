import * as THREE from 'three'
import type { SceneCloud, SceneGrid } from '../types'

/** The options page's cloud: 461,242 points (4 cm voxels) over a 501 x 511
 * grid at 5 cm, about 640 m^2. Its point sizes were tuned for that density. */
export const PROTOTYPE_POINTS_PER_M2 = 461242 / (25.05 * 25.55)

/**
 * How much bigger than the page's points to draw this cloud's, so it reads as
 * densely: the backend serves a ~200k sample of the whole survey rather than
 * the page's 4 cm voxels. Spacing goes as 1 / sqrt(density), so the size does
 * too; never smaller than the page's, and capped so a sparse cloud does not
 * turn into blobs.
 */
export function pointSizeScale(count: number, grid: Pick<SceneGrid, 'res' | 'content'>): number {
  const { minX, minY, maxX, maxY } = grid.content
  const area = Math.max(1, (maxX - minX + 1) * (maxY - minY + 1) * grid.res * grid.res)
  const density = count / area
  if (!(density > 0)) return 1
  return Math.max(1, Math.min(2.2, Math.sqrt(PROTOTYPE_POINTS_PER_M2 / density)))
}

/** Cloud positions in world space: (x, height, -y). */
export function cloudWorldPositions(cloud: SceneCloud): Float32Array {
  const out = new Float32Array(cloud.count * 3)
  const s = cloud.xyh
  for (let k = 0; k < cloud.count; k++) {
    out[k * 3] = s[k * 3]
    out[k * 3 + 1] = s[k * 3 + 2]
    out[k * 3 + 2] = -s[k * 3 + 1]
  }
  return out
}

export interface CloudUniforms {
  [name: string]: THREE.IUniform
  uSize: { value: number }
  uScale: { value: number }
  uMax: { value: number }
  uNearCut: { value: number }
  uHCut: { value: number }
  uMode: { value: number }
  uCeil: { value: number }
  uFogNear: { value: number }
  uFogFar: { value: number }
  uDim: { value: number }
  uC0: { value: THREE.Color }
  uC1: { value: THREE.Color }
  uC2: { value: THREE.Color }
  uC3: { value: THREE.Color }
  uWall: { value: THREE.Color }
  uFurn: { value: THREE.Color }
  uFloor: { value: THREE.Color }
  uBg: { value: THREE.Color }
}

/**
 * The page's point shader, unchanged: structure mode colours by class (floor
 * faded toward the background, walls fading with height), height mode by a
 * four-stop ramp; the ceiling class is dropped unless `uCeil`; fog by view
 * distance; and Follow's cutaway drops points nearer than `uNearCut` or above
 * `uHCut`, so walls between the camera and the robot do not hide it.
 */
export function cloudMaterial(): THREE.ShaderMaterial & { uniforms: CloudUniforms } {
  const uniforms: CloudUniforms = {
    uSize: { value: 0.05 }, uScale: { value: 600 }, uMax: { value: 10 }, uNearCut: { value: 0 }, uHCut: { value: 99 },
    uMode: { value: 1 }, uCeil: { value: 0 }, uFogNear: { value: 200 }, uFogFar: { value: 400 }, uDim: { value: 1 },
    uC0: { value: new THREE.Color('#32ade6') }, uC1: { value: new THREE.Color('#0a84ff') },
    uC2: { value: new THREE.Color('#5e5ce6') }, uC3: { value: new THREE.Color('#bf5af2') },
    uWall: { value: new THREE.Color() }, uFurn: { value: new THREE.Color() },
    uFloor: { value: new THREE.Color() }, uBg: { value: new THREE.Color() },
  }
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      attribute float cls;
      uniform float uSize, uScale, uMax, uMode, uCeil, uFogNear, uFogFar, uDim, uNearCut, uHCut;
      uniform vec3 uC0, uC1, uC2, uC3, uWall, uFurn, uFloor, uBg;
      varying vec3 vColor;
      void main() {
        if (cls > 2.5 && uCeil < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        if (-mv.z < uNearCut || position.y > uHCut) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
        vec3 c;
        float h = position.y;
        if (uMode < 0.5) {
          float t = clamp(h / 3.3, 0.0, 1.0);
          c = t < 0.33 ? mix(uC0, uC1, t / 0.33) : (t < 0.66 ? mix(uC1, uC2, (t - 0.33) / 0.33) : mix(uC2, uC3, (t - 0.66) / 0.34));
          if (cls < 1.5) c = mix(uBg, c, 0.55);
        } else {
          c = cls < 0.5 ? uFloor : (cls < 1.5 ? uFurn : (cls < 2.5 ? uWall : mix(uBg, uFurn, 0.6)));
          if (cls > 1.5 && cls < 2.5) c = mix(c, uBg, clamp((h - 1.2) / 3.0, 0.0, 0.45));
        }
        if (cls < 0.5) c = mix(uBg, c, 0.4);
        float d = -mv.z;
        c = mix(c, uBg, smoothstep(uFogNear, uFogFar, d) * 0.9);
        vColor = mix(uBg, c, uDim);
        gl_PointSize = clamp(uSize * uScale / max(d, 0.01), 1.4, uMax);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        vec2 p = gl_PointCoord * 2.0 - 1.0;
        if (dot(p, p) > 1.0) discard;
        gl_FragColor = vec4(vColor, 1.0);
        #include <colorspace_fragment>
      }`,
  }) as THREE.ShaderMaterial & { uniforms: CloudUniforms }
}

/** The cloud as a Points object, positions in world space, class per point. */
export function buildCloud(cloud: SceneCloud): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial & { uniforms: CloudUniforms }> {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(cloudWorldPositions(cloud), 3))
  // A float attribute: WebGL1-safe, and what `attribute float cls` reads.
  geo.setAttribute('cls', new THREE.BufferAttribute(Float32Array.from(cloud.cls), 1))
  geo.computeBoundingSphere()
  const pts = new THREE.Points(geo, cloudMaterial())
  pts.frustumCulled = false
  return pts
}
