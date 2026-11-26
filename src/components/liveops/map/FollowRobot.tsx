import { useCallback, useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { clampPadding } from '@/liveops/fitPadding'
import { fromLatLng, toLatLng } from '@/liveops/mapCoords'
import {
  focusPoint, followZoom, isFinitePosition, restoredZoom, shouldPan,
  type FollowPadding, type FollowRestore, type MapView,
} from '@/liveops/mapFollow'
import type { RobotState } from '@/types'

/** How long the pane must hold a new size before the view is re-centred. Long
 * enough that a drag of the Split view's divider, or a soft keyboard sliding
 * up, re-centres once at the end rather than on every frame. */
export const RESIZE_REFOLLOW_MS = 150

/** The map's own zoom gestures, which zoom about the robot while following. */
const ZOOM_GESTURES = ['scrollWheelZoom', 'touchZoom', 'doubleClickZoom'] as const

/**
 * The one place a LiveOps map's view is moved for the robot. Rules in
 * `liveops/mapFollow.ts`; this is their Leaflet side.
 *
 * While `following`:
 * - each new `epoch` (the map opening, Follow robot, a different robot) zooms
 *   in to `spanM` metres around the robot -- or to the `restore` zoom, when the
 *   map opens at a remembered view -- and centres it in what the panels leave
 *   visible;
 * - each telemetry frame pans, without animating, once the robot leaves the
 *   dead zone -- at 10 Hz an eased pan is still running when the next frame
 *   lands and the view lurches instead of tracking;
 * - the wheel, a pinch and a double-click zoom about the robot rather than the
 *   pointer, so zooming changes how close the follow is instead of ending it;
 * - the pane changing size re-centres it.
 *
 * On an `interactive` map the operator's drag or box zoom calls `onUserMove`,
 * which pauses following; nothing here moves the view again until it resumes
 * -- except once, when the map opens paused at a remembered view (`restore`
 * with a centre), which is put up as it was left.
 *
 * An `interactive` map also reports where it is after every move
 * (`onViewChange`, on `moveend`), so the view can be remembered across a
 * reload. Not while following before the first framing: what the pane shows
 * then is the site fit, which nobody chose.
 *
 * The robot and padding are held in a ref and read when the view moves, never
 * made a reason for an effect to re-run: MapCanvas re-renders on every frame.
 */
export function FollowRobot({
  robot, following, epoch, spanM, padding, interactive, onUserMove, restore = null, onViewChange,
}: {
  robot: RobotState
  following: boolean
  /** Moves when the view should be framed afresh. */
  epoch: number
  /** Metres across the visible area's smaller axis at the framing zoom. */
  spanM: number
  /** Room the view's panels cover; clamped as the site fit clamps it. */
  padding?: FollowPadding
  /** The operator can drag and zoom this map, so their gesture pauses it. */
  interactive: boolean
  onUserMove?: () => void
  /** The remembered view this epoch opens at: a zoom to follow at, or, while
   * paused, a zoom and a centre. Null for the close-up. */
  restore?: FollowRestore | null
  /** Where an interactive map is after it moved. */
  onViewChange?: (view: MapView) => void
}): null {
  const map = useMap()
  const latest = useRef({ robot, padding, onUserMove, restore, onViewChange, following })
  latest.current = { robot, padding, onUserMove, restore, onViewChange, following }
  // Whether this epoch's framing has happened: a pane measuring 0 x 0 (the
  // touch shell lays out after mounting) cannot be framed, and the resize
  // that gives it a size does it instead.
  const framed = useRef(false)
  // The epoch whose paused view has been put up, so a re-render can never put
  // it up again over the operator's own panning.
  const restoredEpoch = useRef<number | null>(null)

  const measure = useCallback(() => {
    const size = map.getSize?.()
    if (!size || !(size.x > 0 && size.y > 0)) return null
    const pad = latest.current.padding
      ? clampPadding(latest.current.padding, { width: size.x, height: size.y })
      : undefined
    return { size, pad, focus: focusPoint(size, pad) }
  }, [map])

  /** Centre the robot on the focus point at `zoom`. */
  const centreAt = useCallback((zoom: number, focus: { x: number; y: number }, size: L.Point) => {
    const { x_m, y_m } = latest.current.robot.position
    const robotPx = map.project(toLatLng(x_m, y_m), zoom)
    // The map centre sits half a pane from the top-left; the robot sits at the
    // focus point. Offset the centre by the difference.
    const centrePx = robotPx.add(L.point(size.x / 2 - focus.x, size.y / 2 - focus.y))
    map.setView(map.unproject(centrePx, zoom), zoom, { animate: false })
  }, [map])

  const frame = useCallback(() => {
    if (!isFinitePosition(latest.current.robot.position)) return
    const m = measure()
    if (!m) return
    const range = { minZoom: map.getMinZoom?.() ?? 1, maxZoom: map.getMaxZoom?.() ?? 7 }
    // The remembered zoom for the first framing after the map opens; the
    // close-up for every other one (the reducer drops `restore` on resume).
    const zoom = restoredZoom(latest.current.restore?.zoom, range) ?? followZoom(m.size, spanM, {
      padding: m.pad, ...range, snap: map.options?.zoomSnap ?? 0.25,
    })
    if (zoom == null) return
    centreAt(zoom, m.focus, m.size)
    framed.current = true
  }, [map, measure, centreAt, spanM])

  const recentreIfDrifted = useCallback(() => {
    if (!isFinitePosition(latest.current.robot.position)) return
    const m = measure()
    if (!m) return
    const { x_m, y_m } = latest.current.robot.position
    const at = map.latLngToContainerPoint(toLatLng(x_m, y_m))
    if (!shouldPan(at, m.focus, m.size, { padding: m.pad })) return
    centreAt(map.getZoom(), m.focus, m.size)
  }, [map, measure, centreAt])

  /** Open paused where the operator left it, once per epoch. */
  const openRestored = useCallback(() => {
    const r = latest.current.restore
    if (!r?.centre || restoredEpoch.current === epoch) return
    const zoom = restoredZoom(r.zoom, { minZoom: map.getMinZoom?.() ?? 1, maxZoom: map.getMaxZoom?.() ?? 7 })
    if (zoom == null) return
    restoredEpoch.current = epoch
    map.setView(toLatLng(r.centre.x_m, r.centre.y_m), zoom, { animate: false })
  }, [map, epoch])

  // Zoom in and centre: on mount, on resume, on a different robot. Or, for a
  // map opening paused at a remembered view, put that view up instead.
  useEffect(() => {
    framed.current = false
    if (following) frame()
    else openRestored()
  }, [following, epoch, frame, openRestored])

  // Report the view after each move, for remembering. `moveend` follows every
  // pan and every zoom (Leaflet fires it after `zoomend`), whoever made it.
  /** Tell `onViewChange` where the map is now. */
  const reportView = useCallback(() => {
    const report = latest.current.onViewChange
    if (!report) return
    const zoom = map.getZoom()
    const centre = fromLatLng(map.getCenter())
    if (!Number.isFinite(zoom) || !isFinitePosition(centre)) return
    report({ zoom, centre })
  }, [map])

  useEffect(() => {
    if (!interactive) return
    const onMoveEnd = () => {
      if (latest.current.following && !framed.current) return
      reportView()
    }
    map.on('moveend', onMoveEnd)
    return () => { map.off('moveend', onMoveEnd) }
  }, [map, interactive, reportView])

  // Every telemetry frame: that is the point of running without deps.
  useEffect(() => {
    if (!following) return
    if (!framed.current) frame()
    else recentreIfDrifted()
  })

  // The operator's own drag or box zoom pauses it. `dragstart` and
  // `boxzoomend` come only from gestures, never from setView or fitBounds, so
  // the view this component moves cannot pause itself -- which is what the
  // first version did, listening to `zoomend`: the site fit's refit when the
  // survey grid loaded fired one and paused following for good.
  useEffect(() => {
    if (!interactive) return
    // The view the gesture starts from is reported first, so the pause always
    // has a view to remember: a map mounted by a layout switch frames before
    // its moveend listener exists, and had reported nothing when the first
    // drag paused it (found in the browser, 2026-11-26).
    const onGesture = () => {
      reportView()
      latest.current.onUserMove?.()
    }
    map.on('dragstart', onGesture)
    map.on('boxzoomend', onGesture)
    return () => {
      map.off('dragstart', onGesture)
      map.off('boxzoomend', onGesture)
    }
  }, [map, interactive, reportView])

  // While following, zoom gestures zoom about the map centre (Leaflet's
  // 'center' option, read per gesture), so the robot stays put; after a zoom,
  // pull it back to the focus point if the panels' offset moved it out.
  useEffect(() => {
    if (!interactive || !following) return
    const options = map.options as unknown as Record<string, unknown>
    const saved = ZOOM_GESTURES.map((k) => [k, options[k]] as const)
    for (const [k, v] of saved) if (v) options[k] = 'center'
    const onZoomEnd = () => recentreIfDrifted()
    map.on('zoomend', onZoomEnd)
    return () => {
      for (const [k, v] of saved) options[k] = v
      map.off('zoomend', onZoomEnd)
    }
  }, [map, interactive, following, recentreIfDrifted])

  // A pane that changes size -- a tablet rotated, the divider dragged, the
  // touch shell's first layout -- re-centres, debounced.
  useEffect(() => {
    if (!following) return
    const container: HTMLElement | undefined = map.getContainer?.()
    if (!container || typeof ResizeObserver === 'undefined') return
    let seen = { width: container.clientWidth, height: container.clientHeight }
    let timer: ReturnType<typeof setTimeout> | undefined
    const ro = new ResizeObserver(() => {
      const next = { width: container.clientWidth, height: container.clientHeight }
      if (next.width === seen.width && next.height === seen.height) return
      seen = next
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        // Leaflet caches the container's size; centring against the stale
        // one puts the robot where the middle used to be.
        map.invalidateSize?.()
        if (!framed.current) { frame(); return }
        const m = measure()
        if (m) centreAt(map.getZoom(), m.focus, m.size)
      }, RESIZE_REFOLLOW_MS)
    })
    ro.observe(container)
    return () => {
      if (timer) clearTimeout(timer)
      ro.disconnect()
    }
  }, [map, following, frame, measure, centreAt])

  return null
}
