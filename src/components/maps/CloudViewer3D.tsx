import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { color, radius } from '@/design-system/tokens'
import { CloudEmptyState } from './CloudEmptyState'

/** One float32 x, y, z triple: 3 * 4 bytes. The wire format is these and
 *  nothing else -- no header, no count, no colour. */
const POINT_BYTES = 12
const POINT_SIZE_M = 0.02
const FOV_DEG = 50

/**
 * Decode the converter's cloud: little-endian float32 `x, y, z` triples.
 *
 * Reads through a DataView with an explicit endianness rather than viewing the
 * buffer as a Float32Array, which would follow the host's. Rejects what cannot
 * be framed or drawn -- a ragged length, no points, a NaN or infinity -- so the
 * viewer shows "could not read it" instead of an empty or invisible canvas.
 *
 * Besides `position` the geometry carries `height`, each point's z scaled to
 * 0..1 across the cloud. Colour is derived from it at paint time, so a theme
 * switch recolours without parsing again.
 */
export function parseCloud(buffer: ArrayBuffer): THREE.BufferGeometry {
  if (buffer.byteLength % POINT_BYTES !== 0) {
    throw new Error(`Cloud length ${buffer.byteLength} is not a multiple of 12 bytes`)
  }
  if (buffer.byteLength === 0) throw new Error('Cloud has no points')

  const view = new DataView(buffer)
  const positions = new Float32Array(buffer.byteLength / 4)
  for (let i = 0; i < positions.length; i++) {
    const v = view.getFloat32(i * 4, true)
    if (!Number.isFinite(v)) throw new Error(`Cloud value ${i} is not finite`)
    positions[i] = v
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('height', new THREE.BufferAttribute(heightFractions(positions), 1))
  geometry.computeBoundingSphere()
  return geometry
}

/** Each point's z as a 0..1 fraction of the cloud's z range. A flat cloud is
 *  all 0, not a division by zero. */
export function heightFractions(positions: Float32Array): Float32Array {
  const count = positions.length / 3
  const out = new Float32Array(count)
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < count; i++) {
    const z = positions[i * 3 + 2]
    if (z < min) min = z
    if (z > max) max = z
  }
  const range = max - min
  if (range > 0) for (let i = 0; i < count; i++) out[i] = (positions[i * 3 + 2] - min) / range
  return out
}

/** How far back a camera with the given vertical field of view must sit to
 *  see a sphere of `radius` whole, with a margin so it is not edge to edge. */
export function cameraDistance(radius: number, fovDeg: number): number {
  return (radius / Math.sin((fovDeg / 2) * Math.PI / 180)) * 1.1
}

/** A design token (`var(--rh-t1)`) as a THREE colour. three paints with numbers,
 *  so the variable is read off <html> at the moment of use. */
function resolveToken(token: string): THREE.Color {
  const name = /var\((--[\w-]+)\)/.exec(token)?.[1]
  const raw = name ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() : token
  return new THREE.Color(raw || '#8e8e93')
}

/** Write each point's colour: muted text at the lowest, primary text at the
 *  highest. A luminance ramp over the map's own backdrop, so it holds up in
 *  both themes and borrows no status or accent colour. */
function applyHeightRamp(geometry: THREE.BufferGeometry) {
  const low = resolveToken(color.t3)
  const high = resolveToken(color.t1)
  const heights = geometry.getAttribute('height')
  const colors = new Float32Array(heights.count * 3)
  const c = new THREE.Color()
  for (let i = 0; i < heights.count; i++) {
    c.copy(low).lerp(high, heights.getX(i))
    colors[i * 3] = c.r
    colors[i * 3 + 1] = c.g
    colors[i * 3 + 2] = c.b
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
}

type Phase = 'loading' | 'failed' | 'ready'

/**
 * An orbitable view of a floor's point cloud. Drag to orbit, scroll to zoom.
 * Z is up, as it is in the map frame. It renders on demand -- when the camera
 * moves, the panel resizes or the theme changes -- not on a loop, because this
 * is a diagnostic view left open while someone reads it.
 *
 * Import this module only through `React.lazy`: it is what carries three.js.
 */
export function CloudViewer3D({ url }: { url: string }) {
  const { t } = useTranslation()
  const host = useRef<HTMLDivElement>(null)
  const [phase, setPhase] = useState<Phase>('loading')

  useEffect(() => {
    // mockDataProvider returns '' -- fetch('') would re-request the page.
    if (!url || !host.current) return
    const container = host.current
    const abort = new AbortController()
    let disposed = false
    let teardown = () => {}
    setPhase('loading')

    fetch(url, { signal: abort.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.arrayBuffer()
      })
      .then((buffer) => {
        if (disposed) return
        const geometry = parseCloud(buffer)
        const sphere = geometry.boundingSphere!
        applyHeightRamp(geometry)

        const material = new THREE.PointsMaterial({ size: POINT_SIZE_M, vertexColors: true, sizeAttenuation: true })
        const scene = new THREE.Scene()
        scene.add(new THREE.Points(geometry, material))

        const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
        renderer.setPixelRatio(window.devicePixelRatio)
        renderer.domElement.style.display = 'block'
        container.appendChild(renderer.domElement)

        const camera = new THREE.PerspectiveCamera(FOV_DEG, 1, sphere.radius / 100, sphere.radius * 20)
        camera.up.set(0, 0, 1)
        const distance = cameraDistance(sphere.radius, FOV_DEG)
        camera.position.copy(sphere.center).add(new THREE.Vector3(1, -1, 0.8).normalize().multiplyScalar(distance))
        camera.lookAt(sphere.center)

        const controls = new OrbitControls(camera, renderer.domElement)
        controls.target.copy(sphere.center)
        controls.update()

        const draw = () => renderer.render(scene, camera)
        controls.addEventListener('change', draw)

        const resize = () => {
          const { clientWidth: w, clientHeight: h } = container
          if (w === 0 || h === 0) return
          renderer.setSize(w, h)
          camera.aspect = w / h
          camera.updateProjectionMatrix()
          draw()
        }
        const resizeObserver = new ResizeObserver(resize)
        resizeObserver.observe(container)

        // Theme is an attribute on <html>; the ramp's tokens change with it.
        const themeObserver = new MutationObserver(() => {
          applyHeightRamp(geometry)
          draw()
        })
        themeObserver.observe(document.documentElement, { attributes: true })

        resize()
        setPhase('ready')

        teardown = () => {
          resizeObserver.disconnect()
          themeObserver.disconnect()
          controls.dispose()
          geometry.dispose()
          material.dispose()
          renderer.dispose()
          renderer.domElement.remove()
        }
      })
      .catch((error: unknown) => {
        if (disposed || (error instanceof DOMException && error.name === 'AbortError')) return
        setPhase('failed')
      })

    return () => {
      disposed = true
      abort.abort()
      teardown()
    }
  }, [url])

  if (!url) return <CloudEmptyState message={t('liveops.map.noCloud')} />
  // The host stays mounted when a load fails: a new `url` runs the effect
  // again and needs somewhere to put its canvas.
  const failed = phase === 'failed'
  return (
    <>
      {failed && <CloudEmptyState message={t('liveops.map.cloudFailed')} />}
      <div
        ref={host}
        data-testid="cloud-viewport"
        style={{
          display: failed ? 'none' : 'block', position: 'relative', width: '100%', height: 360,
          borderRadius: radius.md, overflow: 'hidden', background: color.mapBg,
        }}
      >
        {phase === 'loading' && (
          <div style={{ position: 'absolute', inset: 0 }}>
            <CloudEmptyState message={t('liveops.map.cloudLoading')} />
          </div>
        )}
      </div>
    </>
  )
}
