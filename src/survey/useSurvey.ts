import { useEffect, useState } from 'react'
import { dataProvider } from '@/lib/realtime/dataProvider'
import type { RobotState } from '@/types'
import type { SurveyMapFrame, SurveyStatus } from '@/types/survey'
import { base64ToBytes, decodeGreyPng, type GreyImage } from './surveyPng'
import { MAX_SURVEY_MAP_CELLS_PER_SIDE } from '@/types/survey'

type StatusSub = (robotId: string, listener: (s: SurveyStatus) => void) => () => void
type MapSub = (robotId: string, listener: (f: SurveyMapFrame) => void) => () => void

/** The provider's survey subscriptions, or a no-op where a test's stand-in
 * provider has none: these hooks sit under LiveOps' map pane and command bar,
 * whose tests stub only the provider methods they are about. */
function statusSub(): StatusSub {
  const p = dataProvider as { subscribeSurveyStatus?: StatusSub }
  return typeof p.subscribeSurveyStatus === 'function' ? p.subscribeSurveyStatus.bind(dataProvider) : () => () => {}
}
function mapSub(): MapSub {
  const p = dataProvider as { subscribeSurveyMap?: MapSub }
  return typeof p.subscribeSurveyMap === 'function' ? p.subscribeSurveyMap.bind(dataProvider) : () => () => {}
}

/** A robot's survey status (survey/status), or null before one has arrived --
 * which is also what a bridge older than 0.0.23 gives, forever. */
export function useSurveyStatus(robotId: string | null | undefined): SurveyStatus | null {
  const [status, setStatus] = useState<SurveyStatus | null>(null)
  useEffect(() => {
    setStatus(null)
    if (!robotId) return
    return statusSub()(robotId, setStatus)
  }, [robotId])
  return status && status.robot_id === robotId ? status : null
}

/** Every listed robot's survey status, by robot id. */
export function useSurveyStatuses(robots: Pick<RobotState, 'robot_id'>[]): Record<string, SurveyStatus> {
  const ids = robots.map((r) => r.robot_id).join('\n')
  const [statuses, setStatuses] = useState<Record<string, SurveyStatus>>({})
  useEffect(() => {
    setStatuses({})
    const list = ids ? ids.split('\n') : []
    const sub = statusSub()
    const offs = list.map((id) => sub(id, (s) => setStatuses((prev) => ({ ...prev, [id]: s }))))
    return () => offs.forEach((off) => off())
  }, [ids])
  return statuses
}

/** A robot's latest live survey map frame (survey/map), or null. */
export function useSurveyMap(robotId: string | null | undefined): SurveyMapFrame | null {
  const [frame, setFrame] = useState<SurveyMapFrame | null>(null)
  useEffect(() => {
    setFrame(null)
    if (!robotId) return
    return mapSub()(robotId, setFrame)
  }, [robotId])
  return frame && frame.robot_id === robotId ? frame : null
}

export interface DecodedSurveyMap {
  /** The frame the cells belong to (its geometry, pose and path). */
  frame: SurveyMapFrame
  image: GreyImage
}

/**
 * A frame's cells, decoded off the PNG. Keeps showing the last frame that
 * decoded while the next one is decoding, and when one fails to decode (a
 * broken frame is replaced two seconds later); the error says so meanwhile.
 * A frame whose PNG disagrees with its own width and height is refused: the
 * robot and path would be drawn against the wrong scale.
 */
export function useDecodedSurveyMap(frame: SurveyMapFrame | null): { map: DecodedSurveyMap | null; error: string | null } {
  const [map, setMap] = useState<DecodedSurveyMap | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The providers hand each frame over once, as one object, so the object is
  // the frame's identity.
  const stable = frame
  useEffect(() => {
    if (!stable) { setMap(null); setError(null); return }
    let cancelled = false
    decodeGreyPng(base64ToBytes(stable.cells_png_b64), MAX_SURVEY_MAP_CELLS_PER_SIDE)
      .then((image) => {
        if (cancelled) return
        if (image.width !== stable.width || image.height !== stable.height) {
          throw new Error(`the map image is ${image.width} x ${image.height}, the frame says ${stable.width} x ${stable.height}`)
        }
        setMap({ frame: stable, image })
        setError(null)
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
    return () => { cancelled = true }
  }, [stable])
  // A frame of another survey must never show this one's cells.
  const shown = map && stable && map.frame.survey_id === stable.survey_id && map.frame.robot_id === stable.robot_id ? map : null
  return { map: shown, error }
}
