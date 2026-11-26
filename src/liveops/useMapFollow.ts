import { useCallback, useReducer } from 'react'
import { followReducer, initialFollow, type FollowState } from './mapFollow'

/**
 * One map's follow state (rules in `mapFollow.ts`): following from the start,
 * paused by the operator's drag, resumed by Follow robot, and reset to
 * following whenever the selected robot changes.
 */
export function useMapFollow(robotId: string): FollowState & { pause: () => void; resume: () => void } {
  const [state, dispatch] = useReducer(followReducer, robotId, initialFollow)
  // A different robot is caught during render, not in an effect, so the frame
  // that first draws the new robot is already following it -- no paint of the
  // old robot's paused view around the new one.
  if (state.robotId !== robotId) dispatch({ type: 'robot', robotId })
  const pause = useCallback(() => dispatch({ type: 'pause' }), [])
  const resume = useCallback(() => dispatch({ type: 'resume' }), [])
  const current = state.robotId === robotId ? state : followReducer(state, { type: 'robot', robotId })
  return { ...current, pause, resume }
}
