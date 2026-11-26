import { useCallback, useReducer, useRef } from 'react'
import { recall, remember, viewKey } from '@/lib/viewMemory'
import {
  followReducer, initialFollow, isRememberedMapView, viewToRemember,
  type FollowState, type MapView, type RememberedMapView,
} from './mapFollow'

const recallView = (key: string | null): RememberedMapView | null =>
  key === null ? null : recall(key, isRememberedMapView)

/**
 * One map's follow state (rules in `mapFollow.ts`): following from the start,
 * paused by the operator's drag, resumed by Follow robot, and reset whenever
 * the selected robot changes.
 *
 * Given a site, the view is remembered under `viewKey('map', site, robot)`, so
 * a reload opens the map as the operator left it: following at the zoom they
 * chose, or paused where they left it. `onView` is the map telling us where it
 * now is (FollowRobot, on `moveend`); pause and resume are written at once,
 * so a reload straight after a press still sees it. With no site -- the inset,
 * which nobody can move -- nothing is read or written.
 *
 * Several full maps can be mounted at once (Split, Stacked, the touch shell)
 * and share the key: they all show the same robot, so the last move wins.
 */
export function useMapFollow(robotId: string, siteId: string | null = null): FollowState & {
  pause: () => void
  resume: () => void
  onView: (view: MapView) => void
} {
  const key = siteId === null ? null : viewKey('map', siteId, robotId)
  const [state, dispatch] = useReducer(followReducer, robotId, (id) => initialFollow(id, recallView(key)))
  // A different robot is caught during render, not in an effect, so the frame
  // that first draws the new robot already shows its view -- no paint of the
  // old robot's paused view around the new one.
  let current = state
  if (state.robotId !== robotId) {
    const event = { type: 'robot', robotId, remembered: recallView(key) } as const
    dispatch(event)
    current = followReducer(state, event)
  }

  // Read by the callbacks, which must stay stable: MapCanvas re-renders on
  // every telemetry frame. `following` is also set by pause and resume
  // themselves, since a map event can arrive before React re-renders.
  const live = useRef({ key, following: current.following })
  if (live.current.key !== key) live.current = { key, following: current.following }
  else live.current.following = current.following
  // The last view the map reported, and for which key: a robot switch must not
  // write one robot's view under another's name.
  const lastView = useRef<{ key: string | null; view: MapView } | null>(null)

  const write = useCallback((value: RememberedMapView) => {
    if (live.current.key !== null) remember(live.current.key, value)
  }, [])
  const pause = useCallback(() => {
    live.current.following = false
    dispatch({ type: 'pause' })
    const last = lastView.current
    if (last && last.key === live.current.key) write(viewToRemember(false, last.view))
  }, [write])
  const resume = useCallback(() => {
    live.current.following = true
    dispatch({ type: 'resume' })
    // No zoom: Follow robot means the close-up, and the framing that follows
    // reports the zoom it lands on.
    write({ following: true })
  }, [write])
  const onView = useCallback((view: MapView) => {
    lastView.current = { key: live.current.key, view }
    write(viewToRemember(live.current.following, view))
  }, [write])

  return { ...current, pause, resume, onView }
}
