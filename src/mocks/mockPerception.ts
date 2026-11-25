import { PerceptionFeed } from '@/lib/realtime/perceptionFeed'
import { withNeeds } from '@/liveops/detection'
import {
  DETECTOR_IDS, type DetectionOffReason, type DetectorId, type DetectorInfo, type PerceptionStatus, type RobotState,
} from '@/types'

/**
 * The mock robots' AI detection (schema 0.0.31): what each one's perception
 * publishes on perception/status, and SET_DETECTION applied to it, so the
 * LiveOps switch works in demo mode. The status mirrors perception's own
 * (roverhub-edge perception/pipeline.py build_status / off_status): every
 * detector listed, an unchosen one "unavailable", and the setting carried
 * while a survey holds detection off.
 *
 * Seeded so each state of the switch is reachable: Atlas on with all three,
 * Scout switched off remembering People, Rex with a perception older than
 * 0.0.31, and the others with none.
 */

interface Setting {
  enabled: boolean
  /** Needs applied; null is all of them. */
  detectors: DetectorId[] | null
}

const DETECTORS: readonly [DetectorId, DetectorInfo['kind'], string, string[]][] = [
  ['base.person', 'model', 'dfine_s.onnx', ['person']],
  ['base.pose', 'model', 'rtmpose_s.onnx', ['person']],
  ['base.fall', 'derived', 'fall.py', ['fallen_person', 'person_lying']],
]
const FPS = 9.6

/** Robot id -> its seeded setting; absent robots have no perception. `older`
 * is a perception from before 0.0.31, which reports no setting. */
const SEED: Record<string, Setting | 'older'> = {
  'zaezae-x1-001': { enabled: true, detectors: null },
  'zaezae-x1-002': 'older',
  'zaezae-x1-004': { enabled: false, detectors: ['base.person'] },
}

export class MockPerception {
  readonly feed = new PerceptionFeed()
  private settings = new Map<string, Setting>()
  private sites = new Map<string, string>()
  private held = new Set<string>()

  constructor(robots: readonly RobotState[]) {
    for (const robot of robots) {
      const seed = SEED[robot.robot_id]
      if (!seed) continue
      this.sites.set(robot.robot_id, robot.site_id)
      if (seed === 'older') {
        const { enabled: _e, selected: _s, off_reason: _o, ...older } = this.build(robot.robot_id, { enabled: true, detectors: null })
        this.feed.publish(older)
      } else {
        this.settings.set(robot.robot_id, seed)
        this.publish(robot.robot_id)
      }
    }
  }

  get(robotId: string): PerceptionStatus | undefined {
    return this.feed.get(robotId)
  }

  /** Why the mock bridge refuses SET_DETECTION, or null. */
  refusal(robot: RobotState | undefined, params?: Record<string, unknown>): string | null {
    if (!robot || !this.settings.has(robot.robot_id)) {
      return 'REJECTED_DETECTION_UNAVAILABLE: AI detection is not installed on this robot, or is older than 0.0.31'
    }
    if (robot.abstract_state === 'E_STOP') return 'REJECTED_ESTOP: E-Stop is active'
    const detectors = params?.detectors
    const validList = detectors === undefined || detectors === null || (
      Array.isArray(detectors) && detectors.length > 0
      && detectors.every((d) => (DETECTOR_IDS as readonly unknown[]).includes(d))
      && new Set(detectors).size === detectors.length)
    if (typeof params?.enabled !== 'boolean' || !validList) {
      return 'REJECTED_INVALID_PARAMS: SET_DETECTION needs enabled (true or false) and, if given, a non-empty list of base.person, base.pose and base.fall, each once'
    }
    return null
  }

  /** A SET_DETECTION the mock bridge accepted: the whole setting replaced. */
  apply(robotId: string, params?: Record<string, unknown>): void {
    if (!this.settings.has(robotId) || typeof params?.enabled !== 'boolean') return
    const detectors = Array.isArray(params.detectors) ? withNeeds(params.detectors as string[]) : null
    this.settings.set(robotId, { enabled: params.enabled, detectors: detectors && detectors.length > 0 ? detectors : null })
    this.publish(robotId)
  }

  /** A survey holds detection off while it is busy (survey_controller
   * DETECTION_HELD_STATES), without changing the setting. */
  setSurveyHold(robotId: string, held: boolean): void {
    if (held === this.held.has(robotId)) return
    if (held) this.held.add(robotId)
    else this.held.delete(robotId)
    if (this.settings.has(robotId)) this.publish(robotId)
  }

  private publish(robotId: string): void {
    const setting = this.settings.get(robotId)
    if (setting) this.feed.publish(this.build(robotId, setting))
  }

  private build(robotId: string, setting: Setting): PerceptionStatus {
    const offReason: DetectionOffReason | null = this.held.has(robotId) ? 'survey' : setting.enabled ? null : 'switched_off'
    const chosen = setting.detectors ?? [...DETECTOR_IDS]
    const off = offReason !== null
    const why = offReason === 'survey' ? 'held off by a survey' : 'switched off'
    return {
      robot_id: robotId,
      site_id: this.sites.get(robotId) ?? '',
      at: new Date().toISOString(),
      camera: 'front',
      source_state: off ? 'unavailable' : 'live',
      fps: off ? null : FPS,
      detectors: DETECTORS.map(([detector_id, kind, version, labels]) => {
        const runs = !off && chosen.includes(detector_id)
        return {
          detector_id, kind, version, labels,
          status: runs ? 'running' : 'unavailable',
          fps: runs ? FPS : null,
          reason: runs ? null : why,
        }
      }),
      enabled: setting.enabled,
      selected: chosen,
      off_reason: offReason,
    }
  }
}
