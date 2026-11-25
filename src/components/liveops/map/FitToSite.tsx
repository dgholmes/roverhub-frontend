import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { clampPadding } from '@/liveops/fitPadding'
import { miniWindow } from '@/liveops/contentBounds'
import { sitePoints } from '@/liveops/siteExtent'
import type { Mission, RobotState } from '@/types'
import type { MapFloor, MapZone } from '@/types/maps'

export interface FitPadding {
  /** Pixels kept clear on each side — room for panels floating over the map. */
  topLeft: [number, number]
  bottomRight: [number, number]
}

/** How long the pane must hold a new size before the view is refitted. Long
 * enough that a drag of the Split view's divider, or a soft keyboard sliding
 * up, refits once at the end rather than on every frame. */
export const RESIZE_REFIT_MS = 150

/** The extent worth looking at: the site boundary, the mission route, the
 * robot and, when a map is shown, the part of its floor that was actually
 * surveyed. Fitting to these (rather than to the fixed MAP_BOUNDS envelope, or
 * to the floor's whole grid rectangle) is what makes the site fill the canvas
 * instead of sitting small against one edge. */
export function siteBounds(
  robot: RobotState, mission?: Mission, floor?: MapFloor, zones?: readonly MapZone[],
  content?: L.LatLngBoundsLiteral | null,
): L.LatLngBounds {
  return L.latLngBounds(sitePoints(robot, mission, floor, zones, content))
}

/** Fits the view to the site once per selected robot — not on every telemetry
 * frame, which would yank the map away from wherever the operator panned it.
 * Also refits when the floor shown changes (the map arrives after the first
 * paint, and the picker switches floors); `floor` keeps its identity between
 * frames, so that is not per-frame either.
 *
 * The declared `padding` is the room this view's own panels occlude, and it is
 * clamped to a share of the pane before fitting (`clampPadding`): the declared
 * 300 px telemetry card still wins on a 1920 px desktop, but cannot eat a
 * 1024 px one.
 *
 * The pane changing size — a tablet rotated, the Split view's divider dragged,
 * a soft keyboard — refits too, debounced, since the fit that framed the old
 * size frames the new one badly. That refit is skipped once the operator has
 * panned or zoomed: being yanked back by a keyboard appearing is worse than a
 * view that no longer quite fits.
 *
 * `content` is the floor's surveyed extent, which arrives with its grid a
 * paint or two after the map does. It is a refit trigger, so the view opens on
 * the grid rectangle and tightens onto the survey the moment the grid is read
 * — one extra fit per floor, never per frame. Carrying it in the floor's own
 * schema would spare that second fit, but it is a bump across four repos and
 * both devices for a framing nicety, and every stored map would need
 * reprocessing to gain the field.
 */
export function FitToSite({ robot, mission, padding, floor, zones, content = null, spanM = null }: {
  robot: RobotState; mission?: Mission; padding: FitPadding; floor?: MapFloor
  /** The map's zones, whose geofence ones are fitted with the floor. Read when fitting, not a refit trigger. */
  zones?: readonly MapZone[]
  /** The floor's surveyed extent (liveops/contentBounds), which replaces its
   * grid corners. Null until the grid is read, and then a refit. */
  content?: L.LatLngBoundsLiteral | null
  /** Frame this many metres around the robot instead of the whole site: the
   * inset map, which is a view of the robot's surroundings rather than a
   * thumbnail of the floor. A plain number, so it is a stable refit key while
   * the robot's position it is measured from is read at fit time only. */
  spanM?: number | null
}) {
  const map = useMap()
  // Read when a fit happens, never a reason for one: a telemetry frame gives a
  // new `robot` object every tick and must not move the view.
  const latest = useRef({ robot, mission, padding, zones, floor, content })
  latest.current = { robot, mission, padding, zones, floor, content }
  // Set once the operator has moved the map themselves; cleared by an explicit
  // refit (a new robot, a new floor).
  const userMoved = useRef(false)

  useEffect(() => {
    const container: HTMLElement | undefined = map.getContainer?.()
    const fit = () => {
      const now = latest.current
      const size = { width: container?.clientWidth ?? 0, height: container?.clientHeight ?? 0 }
      const pad = clampPadding(now.padding, size)
      const bounds = spanM
        ? L.latLngBounds(miniWindow(now.robot.position, now.content, spanM))
        : siteBounds(now.robot, now.mission, now.floor, now.zones, now.content)
      map.fitBounds(bounds, {
        paddingTopLeft: pad.topLeft, paddingBottomRight: pad.bottomRight, animate: false,
      })
      // After the fit, not before: fitBounds itself fires `zoomend`.
      userMoved.current = false
    }
    fit()

    const onUserMove = () => { userMoved.current = true }
    map.on?.('dragend', onUserMove)
    map.on?.('zoomend', onUserMove)

    let timer: ReturnType<typeof setTimeout> | undefined
    let ro: ResizeObserver | undefined
    if (container && typeof ResizeObserver !== 'undefined') {
      let seen = { width: container.clientWidth, height: container.clientHeight }
      ro = new ResizeObserver(() => {
        const next = { width: container.clientWidth, height: container.clientHeight }
        // ResizeObserver fires on observe, and on a reflow that changed nothing.
        if (next.width === seen.width && next.height === seen.height) return
        seen = next
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          if (userMoved.current) return
          // Leaflet caches the container's size; fitting against the stale one
          // picks the zoom for the pane the map used to be.
          map.invalidateSize?.()
          fit()
        }, RESIZE_REFIT_MS)
      })
      ro.observe(container)
    }

    return () => {
      if (timer) clearTimeout(timer)
      ro?.disconnect()
      map.off?.('dragend', onUserMove)
      map.off?.('zoomend', onUserMove)
    }
    // Deliberately keyed on the robot's identity, the floor and its surveyed
    // extent only — see the doc comment. `content` keeps its identity between
    // frames (MapCanvas memoizes it on the grid), so this is not per-frame.
  }, [map, robot.robot_id, floor, content, spanM])
  return null
}
