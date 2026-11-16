import type { SurveyMapFrame, SurveyStatus } from '@/types/survey'
import { parseSurveyMapFrame, parseSurveyStatus } from './surveyModel'

type Listener<T> = (value: T) => void

/**
 * Each robot's latest survey status and live map frame, and who wants them.
 * Both providers hold one: the real one feeds it from `survey/status` and
 * `survey/map`, the mock from its simulated survey.
 *
 * It keeps the latest of each per robot and hands it to a new subscriber at
 * once. That matters for the status: it is retained, so the broker delivers it
 * once on connect, before the LiveOps banner or the Maps page has subscribed.
 * The latest frame is kept until a frame of another survey replaces it, so a
 * survey that is being saved still shows the map it made.
 */
export class SurveyFeed {
  private statuses = new Map<string, SurveyStatus>()
  private frames = new Map<string, SurveyMapFrame>()
  private statusListeners = new Map<string, Set<Listener<SurveyStatus>>>()
  private frameListeners = new Map<string, Set<Listener<SurveyMapFrame>>>()

  subscribeStatus(robotId: string, listener: Listener<SurveyStatus>): () => void {
    const unsubscribe = add(this.statusListeners, robotId, listener)
    const latest = this.statuses.get(robotId)
    if (latest) listener(latest)
    return unsubscribe
  }

  subscribeMap(robotId: string, listener: Listener<SurveyMapFrame>): () => void {
    const unsubscribe = add(this.frameListeners, robotId, listener)
    const latest = this.frames.get(robotId)
    if (latest) listener(latest)
    return unsubscribe
  }

  latestStatus(robotId: string): SurveyStatus | null {
    return this.statuses.get(robotId) ?? null
  }

  pushStatus(status: SurveyStatus): void {
    // An older message delivered late (QoS 1 redelivery) must not undo a newer one.
    const prev = this.statuses.get(status.robot_id)
    if (prev && prev.survey_id === status.survey_id && Date.parse(status.updated_at) < Date.parse(prev.updated_at)) return
    this.statuses.set(status.robot_id, status)
    this.statusListeners.get(status.robot_id)?.forEach((l) => l(status))
  }

  pushFrame(frame: SurveyMapFrame): void {
    const prev = this.frames.get(frame.robot_id)
    // QoS 0 can reorder too: never step back to an older frame of the same survey.
    if (prev && prev.survey_id === frame.survey_id && frame.seq < prev.seq) return
    this.frames.set(frame.robot_id, frame)
    this.frameListeners.get(frame.robot_id)?.forEach((l) => l(frame))
  }

  /** A survey/status payload as it came off the broker; dropped when malformed. */
  handleStatusPayload(text: string): void {
    const status = parseSurveyStatus(parseJson(text))
    if (status) this.pushStatus(status)
  }

  /** A survey/map payload as it came off the broker; dropped when malformed. */
  handleMapPayload(text: string): void {
    const frame = parseSurveyMapFrame(parseJson(text))
    if (frame) this.pushFrame(frame)
  }

  clear(): void {
    this.statuses.clear()
    this.frames.clear()
    this.statusListeners.clear()
    this.frameListeners.clear()
  }
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function add<T>(map: Map<string, Set<Listener<T>>>, robotId: string, listener: Listener<T>): () => void {
  let set = map.get(robotId)
  if (!set) map.set(robotId, (set = new Set()))
  const listeners = set
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && map.get(robotId) === listeners) map.delete(robotId)
  }
}
