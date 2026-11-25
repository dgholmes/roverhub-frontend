import { schemaAtLeast } from '@/lib/schemaVersion'
import {
  DETECTOR_IDS, DETECTOR_NEEDS,
  type DetectorId, type PerceptionStatus, type RobotState, type SetDetectionParams,
} from '@/types'
import { getCommandAvailability } from './commandPolicy'
import type { RobotRunView } from './robotRun'

/**
 * The AI detection switch (schema 0.0.31) as plain rules, for LiveOps' "AI"
 * button and its menu: an on/off switch and a box per detector (People, Poses,
 * Falls). The robot answers on its retained perception/status, which the
 * providers deliver (getPerceptionStatus / subscribePerceptionStatus); the
 * command is SET_DETECTION, whose params the click helpers below build.
 *
 * A detector brings what it needs (DETECTOR_NEEDS): a fall is read from a
 * pose, a pose is fitted to a person. So ticking Falls ticks the other two,
 * and unticking People unticks the rest. The selection sent is always an
 * explicit list with the needs applied -- never omitted, so a detector a newer
 * perception adds is not switched on behind the operator's back, and never
 * empty, which the schema refuses ("on, with nothing" is `enabled: false`).
 */

/** The bridge version that understands SET_DETECTION; the backend refuses it
 * for an older one. */
export const DETECTION_SCHEMA = '0.0.31'

/** The operator's setting as the robot reports it. `selected` has the needs
 * applied and is in DETECTOR_IDS order; it is kept while detection is off. */
export interface DetectionSetting {
  enabled: boolean
  selected: DetectorId[]
}

/** What the robot says about detection.
 * - `notInstalled`: it never sent a perception status.
 * - `olderRobot`: its perception predates 0.0.31 and reports no setting.
 * - `on`: running; `running` is the chosen detectors actually running
 *   (degraded counts: slower, but working).
 * - `off`: the operator switched it off; the selection is remembered.
 * - `survey`: a survey holds it off until the survey is processed; it then
 *   comes back as `setting` says.
 * - `unavailable`: switched on, but nothing chosen is running -- the camera
 *   gives no frames, or a model failed; `reason` is perception's own words. */
export type DetectionView =
  | { kind: 'notInstalled' }
  | { kind: 'olderRobot' }
  | { kind: 'on'; setting: DetectionSetting; running: DetectorId[] }
  | { kind: 'off'; setting: DetectionSetting }
  | { kind: 'survey'; setting: DetectionSetting }
  | { kind: 'unavailable'; setting: DetectionSetting; reason: string | null }

export type DetectionViewKind = DetectionView['kind']

const isDetectorId = (id: unknown): id is DetectorId => (DETECTOR_IDS as readonly unknown[]).includes(id)

/** `ids` with what each needs, known ids only, each once, in DETECTOR_IDS order. */
export function withNeeds(ids: Iterable<string>): DetectorId[] {
  const chosen = new Set<DetectorId>()
  for (const id of ids) {
    let next: DetectorId | undefined = isDetectorId(id) ? id : undefined
    while (next && !chosen.has(next)) {
      chosen.add(next)
      next = DETECTOR_NEEDS[next]
    }
  }
  return DETECTOR_IDS.filter((id) => chosen.has(id))
}

/** Whether `id` needs `other`, directly or through another detector. */
function needs(id: DetectorId, other: DetectorId): boolean {
  for (let n = DETECTOR_NEEDS[id]; n; n = DETECTOR_NEEDS[n]) if (n === other) return true
  return false
}

/** One checkbox clicked: ticking adds the detector and what it needs;
 * unticking removes it and everything that needs it. May return empty. */
export function toggleDetector(selection: readonly string[], id: DetectorId): DetectorId[] {
  const current = withNeeds(selection)
  if (!current.includes(id)) return withNeeds([...current, id])
  return current.filter((d) => d !== id && !needs(d, id))
}

/** The status's selection with needs applied; every detector when it names
 * none (the setting's "all of them"). */
export function selectionOf(status: PerceptionStatus): DetectorId[] {
  const selected = Array.isArray(status.selected) ? withNeeds(status.selected.filter((s) => typeof s === 'string')) : []
  return selected.length > 0 ? selected : [...DETECTOR_IDS]
}

/** What the robot's perception status says about detection. */
export function detectionView(status: PerceptionStatus | undefined): DetectionView {
  if (!status) return { kind: 'notInstalled' }
  if (typeof status.enabled !== 'boolean') return { kind: 'olderRobot' }
  const setting: DetectionSetting = { enabled: status.enabled, selected: selectionOf(status) }
  if (status.off_reason === 'survey') return { kind: 'survey', setting }
  if (!status.enabled || status.off_reason === 'switched_off') return { kind: 'off', setting }
  const detectors = Array.isArray(status.detectors) ? status.detectors : []
  const chosen = detectors.filter((d) => isDetectorId(d.detector_id) && setting.selected.includes(d.detector_id))
  const running = setting.selected.filter((id) =>
    chosen.some((d) => d.detector_id === id && (d.status === 'running' || d.status === 'degraded')))
  if (status.source_state === 'unavailable' || running.length === 0) {
    const reason = chosen.find((d) => d.status === 'unavailable' && d.reason)?.reason
      ?? detectors.find((d) => d.reason)?.reason ?? null
    return { kind: 'unavailable', setting, reason }
  }
  return { kind: 'on', setting, running }
}

/** SET_DETECTION's params for the on/off switch: the remembered selection
 * goes with it either way, so switching back on restores it. */
export function switchParams(setting: DetectionSetting, on: boolean): SetDetectionParams {
  const selected = withNeeds(setting.selected)
  return { enabled: on, detectors: selected.length > 0 ? selected : [...DETECTOR_IDS] }
}

/** SET_DETECTION's params for a checkbox click. Unticking the last detector
 * switches detection off and keeps the selection it had, so switching on
 * again brings it back. A checkbox never switches detection on: while off it
 * edits the remembered selection, and the switch turns it on. */
export function checkboxParams(setting: DetectionSetting, id: DetectorId): SetDetectionParams {
  const next = toggleDetector(setting.selected, id)
  if (next.length === 0) return switchParams(setting, false)
  return { enabled: setting.enabled, detectors: next }
}

/** The menu's controls, or null where there is no switch to show. While a
 * survey holds detection off, they show the setting it comes back to. */
export function detectionMenu(view: DetectionView): { switchOn: boolean; checked: Record<DetectorId, boolean> } | null {
  if (view.kind === 'notInstalled' || view.kind === 'olderRobot') return null
  const { enabled, selected } = view.setting
  const checked = Object.fromEntries(DETECTOR_IDS.map((id) => [id, selected.includes(id)])) as Record<DetectorId, boolean>
  return { switchOn: enabled, checked }
}

/** The "AI" button on the command bar.
 * - `kind`: the view's kind, except `olderRobot` also for a bridge older than
 *   0.0.31 (the backend refuses SET_DETECTION there).
 * - `count`: the chosen detectors, for "AI on · n"; null when off or held by
 *   a survey ("AI off", "AI off · survey") and where there is no setting.
 * - `enabled` / `reason`: whether the menu may send. notInstalled and
 *   olderRobot are disabled with no reason here -- the button words them;
 *   otherwise `reason` is getCommandAvailability's (offline, E-Stop latch).
 * - `setting`: what the click helpers take; null with no switch to show. */
export interface DetectionButton {
  kind: DetectionViewKind
  count: number | null
  enabled: boolean
  reason?: string
  setting: DetectionSetting | null
}

export function detectionButton(robot: RobotState, status: PerceptionStatus | undefined, run?: RobotRunView): DetectionButton {
  const view = detectionView(status)
  if (view.kind === 'notInstalled' || view.kind === 'olderRobot' || !schemaAtLeast(robot.bridge?.schema_version, DETECTION_SCHEMA)) {
    return { kind: view.kind === 'notInstalled' ? 'notInstalled' : 'olderRobot', count: null, enabled: false, setting: null }
  }
  const count = view.kind === 'on' || view.kind === 'unavailable' ? view.setting.selected.length : null
  const availability = getCommandAvailability(robot, 'SET_DETECTION', run)
  return {
    kind: view.kind, count, enabled: availability.enabled, setting: view.setting,
    ...(availability.reason ? { reason: availability.reason } : {}),
  }
}
