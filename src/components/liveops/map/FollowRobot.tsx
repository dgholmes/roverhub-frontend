import { useEffect, useRef } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import { toLatLng } from '@/liveops/mapCoords'
import type { RobotState } from '@/types'

/**
 * How far from the centre the robot may drift before the view is moved, as a
 * fraction of the pane's SMALLER axis.
 *
 * It exists so a robot standing still does not jitter the map: a dead-reckoned
 * pose wanders a few centimetres between frames, and panning on every one of
 * them makes the floor crawl under a stationary robot. A fifth of the short
 * axis is wide enough to absorb that and still bring the robot back well
 * before it reaches an edge.
 */
export const FOLLOW_DEAD_ZONE_FRACTION = 0.2

/**
 * Whether the robot has drifted far enough from the pane's centre to be worth
 * moving the view for. Pure, so the rule can be tested without a map.
 *
 * Measured against the smaller axis because the dead zone is a circle: on the
 * Split view's tall, narrow map pane, a fifth of the WIDTH would let the robot
 * leave the top of the pane before anything happened.
 */
export function shouldPan(
  robot: L.Point, centre: L.Point, size: L.Point, fraction: number = FOLLOW_DEAD_ZONE_FRACTION,
): boolean {
  const radius = Math.min(size.x, size.y) * fraction
  return robot.distanceTo(centre) > radius
}

/**
 * Keeps the robot near the middle of the map while it walks.
 *
 * ⚠️ **It only ever pans.** The zoom belongs to the operator: FitToSite sets
 * the opening level (the surveyed floor, or a room around the robot in the
 * inset) and from then on nothing here changes it. Zooming the map out from
 * under someone who has just zoomed in to look at a doorway is the fastest way
 * to make a follow mode something people switch off.
 *
 * For the same reason an interactive map stops following the moment the
 * operator drags or zooms it. Being pulled back to the robot mid-look is worse
 * than a view that has gone stale, and the operator has an explicit way back:
 * MapControls' centre-on-robot button remounts this component, which clears
 * the pause. A `variant="mini"` inset is not interactive at all -- no drag, no
 * wheel -- so it never pauses and simply tracks the robot.
 *
 * Follows the pattern FitToSite established: the robot is held in a ref and
 * read when a pan happens, never made a reason for the effect to re-run, since
 * MapCanvas re-renders on every telemetry frame.
 */
export function FollowRobot({ robot, active, interactive }: {
  robot: RobotState
  /** Follow now: a run is active, or this is the inset, which always follows. */
  active: boolean
  /** The operator can drag and zoom this map, so their gesture pauses it. */
  interactive: boolean
}): null {
  const map = useMap()
  const latest = useRef(robot)
  latest.current = robot
  // Set by the operator's own drag or zoom; cleared only by a remount.
  const paused = useRef(false)

  useEffect(() => {
    if (!interactive) return
    const onUserMove = () => { paused.current = true }
    map.on?.('dragend', onUserMove)
    map.on?.('zoomend', onUserMove)
    return () => {
      map.off?.('dragend', onUserMove)
      map.off?.('zoomend', onUserMove)
    }
  }, [map, interactive])

  // Deliberately runs on every render -- that is the point, it is how a new
  // telemetry frame moves the view -- but does nothing unless the robot has
  // actually left the dead zone.
  useEffect(() => {
    if (!active || paused.current) return
    const { x_m, y_m } = latest.current.position
    // A bridge that sends a bad pose must not throw the view somewhere the
    // operator cannot pan back from.
    if (!Number.isFinite(x_m) || !Number.isFinite(y_m)) return
    const size = map.getSize?.()
    const centre = map.getCenter?.()
    if (!size || !centre) return
    const at = map.latLngToContainerPoint?.(L.latLng(y_m, x_m))
    const middle = map.latLngToContainerPoint?.(L.latLng(centre.lat, centre.lng))
    if (!at || !middle || !shouldPan(at, middle, size)) return
    // Never animated: at 10 Hz the easing of one pan is still running when the
    // next frame arrives, and the view lurches instead of tracking.
    map.panTo(toLatLng(x_m, y_m), { animate: false })
  })

  return null
}
