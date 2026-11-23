import type { TFunction } from 'i18next'
import { formatClock } from '@/survey/replay/replayModel'
import { schemaAtLeast } from '@/lib/schemaVersion'
import type { RobotState } from '@/types'
import type { MapQualityReport } from '@/types/mapPipeline'
import type { Point2D, SiteMap } from '@/types/maps'
import type { SurveySummary } from '@/types/surveyReplay'
import type { SurveySource } from './editor/findMoving'
import { bridgeOffline, navMapSwitchBlock, robotMapMatch, USE_NAV_MAP_SCHEMA } from './robotMaps'
import { activationProblem } from './zoneGeometry'

/**
 * Missions › Maps' "Get it ready" checklist (map ready spec §3): the nine steps
 * between a surveyed floor and a robot walking on it, each with its state and
 * at most one button. Pure, so every rule is tested without a browser; the
 * page loads the inputs and draws the rows (MapReadyChecklist.tsx).
 *
 * The one rule over all the others: unknown is grey, never green. A step is
 * green only on something the console has read that says so -- still loading,
 * a request that failed, an older bridge that does not report it, all grey.
 *
 * A button the person may not use is left off, and the row's detail says why,
 * as Maps › Robot maps already does. Viewing (See drift, Set position, which
 * only opens LiveOps) is for everyone.
 */

/** The backend's trim margin around the walked track (maps/trim.py
 *  TRIM_MARGIN_M, spec §4.5): a floor reaching further than this past the
 *  walked path is "much larger than the walked area". */
export const TRIM_MARGIN_M = 10.0

export const READINESS_STEPS = ['mapped', 'legs', 'moved', 'quality', 'trimmed', 'zones', 'active', 'onRobot', 'placed'] as const
export type StepId = typeof READINESS_STEPS[number]
export type StepTone = 'green' | 'amber' | 'red' | 'grey'

/** What a row's button asks for. The page decides how: the three that only
 *  navigate (See drift, Draw zones, Set position) it does itself; the rest go
 *  to the action's own control or dialog. */
export type ReadinessAction =
  | { kind: 'seeDrift'; surveyId: string }
  | { kind: 'rebuild'; surveyId: string; robotId: string }
  | { kind: 'findMoving'; surveyId: string; robotId: string }
  | { kind: 'checkQuality' }
  | { kind: 'trim'; floorIndex: number }
  | { kind: 'drawZones' }
  | { kind: 'activate' }
  | { kind: 'sendToRobot'; robotId: string }
  | { kind: 'useOnRobot'; robotId: string; robotName: string }
  | { kind: 'setPosition'; robotId: string }

export type ReadinessActionKind = ReadinessAction['kind']

export interface ReadinessStep {
  id: StepId
  tone: StepTone
  /** One line: the state, and -- when a button is left off for want of a
   *  capability -- why. */
  detail: string
  action: ReadinessAction | null
}

/** The x, y box of the walked path, in the map frame (the bundle's levelled
 *  frame, as the floor's grid). */
export interface WalkedArea {
  min: Point2D
  max: Point2D
}

/** A robot as the checklist reads it. Use this map is held back while the
 *  robot is offline, E-Stopped, on a mission or walking, as Robot maps does
 *  (navMapSwitchBlock). Rows 8 and 9 count only an online robot: an offline
 *  one's map and placement are what it last reported, so they stay grey. A
 *  robot without `connectivity` is treated as offline -- the console cannot
 *  tell. */
export type ReadinessRobot = Pick<RobotState, 'robot_id' | 'name' | 'bridge'>
  & Partial<Pick<RobotState, 'connectivity' | 'abstract_state' | 'active_run' | 'control_owner' | 'nav_goal'>>

export interface ReadinessCan {
  /** Engineer: Rebuild, Send to robot, Use this map (and with editZones,
   *  Check again and Find now). */
  configure: boolean
  /** Supervisor: Trim, Draw zones, Activate (and Check again, Find now). */
  editZones: boolean
  /** An owner/admin whose Engineer tools are off: told to switch them on
   *  rather than that they lack the role. */
  engineerToolsSwitch: boolean
}

export interface ReadinessInput {
  t: TFunction
  map: SiteMap
  floorIndex: number
  /** The survey that made this floor (FindMovingPanel's source): undefined
   *  while loading or when it could not be read, null when the floor names none. */
  survey: SurveySource | null | undefined
  /** Data › Surveys' summary of that survey (its verdict describes the map's
   *  own take): undefined while loading or unreadable, null when the backend
   *  has no record of it. */
  summary: SurveySummary | null | undefined
  /** The floor's moved list: undefined unknown, null when there is none. */
  moved: { spots: number } | null | undefined
  /** The map's quality report: undefined loading, null none. */
  quality: MapQualityReport | null | undefined
  /** A check is running: the report is about to change. */
  qualityRunning: boolean
  /** The floor's walked track: undefined unknown, null when none is stored. */
  walked: WalkedArea | null | undefined
  /** The robots at the map's site. */
  robots: ReadinessRobot[]
  /** The site's maps, to name the one a robot runs instead. */
  maps: Pick<SiteMap, 'map_id' | 'name'>[]
  can: ReadinessCan
  /** Names for user ids (useUserNames), for who reviewed the zones; an id
   *  not in it is shown as it is. */
  names?: Readonly<Record<string, string>>
}

/** Whether the robot still holds the survey's bag: true or false from a
 *  0.0.29 bridge's recordings list, null (unknown) from anything older. */
function bagOnRobot(robot: ReadinessRobot | undefined, surveyId: string): boolean | null {
  if (!robot || !schemaAtLeast(robot.bridge?.schema_version, USE_NAV_MAP_SCHEMA)) return null
  return (robot.bridge?.recordings ?? []).some((r) => r.survey_id === surveyId && r.has_bag)
}

export function mapReadiness(input: ReadinessInput): ReadinessStep[] {
  const { t, map, floorIndex, survey, summary, can } = input
  const floor = map.floors.find((f) => f.index === floorIndex) ?? null
  const floorHash = floor?.content_hash ?? null
  const unknown = t('missions.maps.ready.unknown')

  const engineerWhy = t(can.engineerToolsSwitch ? 'missions.maps.ready.why.engineerTools' : 'missions.maps.ready.why.engineer')
  const supervisorWhy = t('missions.maps.ready.why.supervisor')
  const eitherWhy = t('missions.maps.ready.why.supervisorOrEngineer')
  const canEither = can.configure || can.editZones
  const withWhy = (detail: string, why: string) => `${detail} ${why}`

  const step = (id: StepId, tone: StepTone, detail: string, action: ReadinessAction | null = null): ReadinessStep =>
    ({ id, tone, detail, action })

  const surveyRobot = survey?.robotId ? input.robots.find((r) => r.robot_id === survey.robotId) : undefined

  // 1. Recorded and mapped.
  const mapped = (() => {
    if (!floor) return step('mapped', 'grey', t('missions.maps.ready.mapped.noFloor'))
    if (summary && survey) {
      const minutes = Math.max(1, Math.round(summary.duration_s / 60))
      return step('mapped', 'green', summary.legs_m !== null && summary.legs_m > 0
        ? t('missions.maps.ready.mapped.walked', { minutes, metres: Math.round(summary.legs_m) })
        : t('missions.maps.ready.mapped.duration', { minutes }))
    }
    return step('mapped', 'green', t('missions.maps.ready.mapped.stored'))
  })()

  // 2. Checked against the legs: Data › Surveys' verdict on the map's take.
  const legs = (() => {
    if (survey === undefined || (survey && summary === undefined)) return step('legs', 'grey', unknown)
    if (!survey || !summary) return step('legs', 'grey', t('missions.maps.ready.legs.noSurvey'))
    const seeDrift: ReadinessAction = { kind: 'seeDrift', surveyId: survey.surveyId }
    if (!summary.has_legs) return step('legs', 'grey', t('missions.maps.ready.legs.noLegs'), seeDrift)
    if (summary.first_bad_s === null) return step('legs', 'green', t('missions.maps.ready.legs.ok'), seeDrift)
    const at = formatClock(summary.first_bad_s)
    const detail = t('missions.maps.ready.legs.drift', { at })
    if (bagOnRobot(surveyRobot, survey.surveyId) === true && survey.robotId && surveyRobot) {
      const rebuildable = t('missions.maps.ready.legs.driftRebuild', { at, robot: surveyRobot.name })
      return can.configure
        ? step('legs', 'amber', rebuildable, { kind: 'rebuild', surveyId: survey.surveyId, robotId: survey.robotId })
        : step('legs', 'amber', withWhy(detail, engineerWhy), seeDrift)
    }
    return step('legs', 'amber', detail, seeDrift)
  })()

  // 3. Things that moved.
  const moved = (() => {
    if (survey === null) return step('moved', 'grey', t('missions.maps.ready.moved.noSurvey'))
    if (survey === undefined || input.moved === undefined) return step('moved', 'grey', unknown)
    if (input.moved) return step('moved', 'green', t('missions.maps.ready.moved.found', { count: input.moved.spots }))
    const bag = bagOnRobot(surveyRobot, survey.surveyId)
    if (bag === false || (bag === null && summary?.recording_kept === false)) {
      return step('moved', 'amber', t('missions.maps.ready.moved.noRecording'))
    }
    const detail = t('missions.maps.ready.moved.missing')
    if (!survey.robotId) return step('moved', 'amber', detail)
    return canEither
      ? step('moved', 'amber', detail, { kind: 'findMoving', surveyId: survey.surveyId, robotId: survey.robotId })
      : step('moved', 'amber', withWhy(detail, eitherWhy))
  })()

  // 4. Quality check.
  const quality = (() => {
    const q = input.quality
    if (input.qualityRunning) return step('quality', 'grey', t('missions.maps.ready.quality.running'))
    if (q === undefined) return step('quality', 'grey', unknown)
    if (q && q.current && q.passed) return step('quality', 'green', t('missions.maps.ready.quality.passed'))
    const [tone, detail]: [StepTone, string] = q === null ? ['grey', t('missions.maps.ready.quality.missing')]
      : !q.current ? ['grey', t('missions.maps.ready.quality.stale')]
        : ['red', t('missions.maps.ready.quality.failed', { count: Math.max(1, q.failed.length) })]
    return canEither ? step('quality', tone, detail, { kind: 'checkQuality' }) : step('quality', tone, withWhy(detail, eitherWhy))
  })()

  // 5. Trimmed: the floor's canvas against the walked path plus the margin
  // (and one cell, as the backend rounds the grid out to whole cells).
  const trimmed = (() => {
    if (!floor) return step('trimmed', 'grey', t('missions.maps.ready.mapped.noFloor'))
    if (input.walked === undefined) return step('trimmed', 'grey', unknown)
    if (input.walked === null) return step('trimmed', 'grey', t('missions.maps.ready.trimmed.noTrack'))
    const { min, max } = input.walked
    const lo: Point2D = floor.origin_xy_m
    const hi: Point2D = [lo[0] + floor.size_cells[0] * floor.resolution_m, lo[1] + floor.size_cells[1] * floor.resolution_m]
    const past = Math.max(0, min[0] - lo[0], min[1] - lo[1], hi[0] - max[0], hi[1] - max[1])
    if (past <= TRIM_MARGIN_M + floor.resolution_m) {
      return step('trimmed', 'green', t('missions.maps.ready.trimmed.ok', { margin: TRIM_MARGIN_M }))
    }
    const detail = t('missions.maps.ready.trimmed.over', { metres: Math.round(past) })
    return can.editZones
      ? step('trimmed', 'amber', detail, { kind: 'trim', floorIndex })
      : step('trimmed', 'amber', withWhy(detail, supervisorWhy))
  })()

  // 6. Zones over stairs, drops and glass.
  const zones = (() => {
    if (map.zones.length > 0) return step('zones', 'green', t('missions.maps.ready.zones.drawn', { count: map.zones.length }))
    if (map.zones_reviewed_at) {
      return step('zones', 'green', t('missions.maps.ready.zones.reviewed', { who: map.zones_reviewed_by ? input.names?.[map.zones_reviewed_by] ?? map.zones_reviewed_by : '—' }))
    }
    const detail = t('missions.maps.ready.zones.none')
    return can.editZones ? step('zones', 'grey', detail, { kind: 'drawZones' }) : step('zones', 'grey', withWhy(detail, supervisorWhy))
  })()

  // 7. Active.
  const active = (() => {
    if (map.status === 'active') return step('active', 'green', t('missions.maps.ready.active.active'))
    if (map.status === 'archived') return step('active', 'grey', t('missions.maps.ready.active.archived'))
    const detail = t('missions.maps.ready.active.draft')
    // A draft that cannot be activated yet: say why, and what to do about it.
    if (activationProblem(map) === 'noFloors') return step('active', 'grey', t('missions.maps.ready.active.noFloors'))
    return can.editZones ? step('active', 'grey', detail, { kind: 'activate' }) : step('active', 'grey', withWhy(detail, supervisorWhy))
  })()

  // 8. On a robot, and 9. placed: the robot set up for this map (an online
  // one first, then the one on this very version), else the one that surveyed
  // it, else the first -- online robots ahead of offline ones throughout. An
  // offline robot's report is stale: it can say which robot to look at, never
  // make either row green.
  const online = (r: ReadinessRobot) => !bridgeOffline(r)
  const RANK = { same: 0, differs: 1, unknown: 2, otherMap: 3 } as const
  const onMap = input.robots
    .filter((r) => r.bridge?.nav_map_id === map.map_id)
    .map((r) => ({ robot: r, match: robotMapMatch(r, map.map_id, floorHash), online: online(r) }))
    .sort((a, b) => Number(b.online) - Number(a.online) || RANK[a.match] - RANK[b.match])[0]

  const onRobot = (() => {
    if (input.robots.length === 0) return step('onRobot', 'grey', t('missions.maps.ready.onRobot.noRobot'))
    if (!floorHash) return step('onRobot', 'grey', t('missions.maps.ready.onRobot.noFloorHash'))
    if (onMap) {
      const robot = onMap.robot.name
      if (!onMap.online) return step('onRobot', 'grey', t('missions.maps.ready.onRobot.offline', { robot }))
      if (onMap.match === 'same') return step('onRobot', 'green', t('missions.maps.ready.onRobot.same', { robot }))
      if (onMap.match === 'differs') {
        const detail = t('missions.maps.ready.onRobot.differs', { robot })
        return can.configure
          ? step('onRobot', 'amber', detail, { kind: 'sendToRobot', robotId: onMap.robot.robot_id })
          : step('onRobot', 'amber', withWhy(detail, engineerWhy))
      }
      return step('onRobot', 'grey', t('missions.maps.ready.onRobot.noHash', { robot }))
    }
    const target = [surveyRobot, ...input.robots].find((r) => r && online(r)) ?? surveyRobot ?? input.robots[0]
    const robot = target.name
    const navMap = target.bridge?.nav_map_id ?? null
    const detail = navMap
      ? t('missions.maps.ready.onRobot.otherMap', { robot, map: input.maps.find((m) => m.map_id === navMap)?.name ?? navMap })
      : t('missions.maps.ready.onRobot.noMap', { robot })
    if (!schemaAtLeast(target.bridge?.schema_version, USE_NAV_MAP_SCHEMA)) {
      return step('onRobot', 'grey', withWhy(detail, t('missions.maps.ready.onRobot.oldBridge', { robot, version: USE_NAV_MAP_SCHEMA })))
    }
    // Not offered while the robot is offline, E-Stopped, on a mission or
    // walking: the row says which, as Robot maps does.
    const block = target.connectivity ? navMapSwitchBlock(target as Parameters<typeof navMapSwitchBlock>[0]) : 'offline'
    if (block) return step('onRobot', 'grey', withWhy(detail, t(`missions.maps.robots.block.${block}`, { version: USE_NAV_MAP_SCHEMA })))
    return can.configure
      ? step('onRobot', 'grey', detail, { kind: 'useOnRobot', robotId: target.robot_id, robotName: robot })
      : step('onRobot', 'grey', withWhy(detail, engineerWhy))
  })()

  const placed = (() => {
    if (!onMap) return step('placed', 'grey', t('missions.maps.ready.placed.noRobot'))
    const robot = onMap.robot.name
    if (!onMap.online) return step('placed', 'grey', t('missions.maps.ready.placed.offline', { robot }))
    const localised = onMap.robot.bridge?.nav_localised
    // Placed counts only on this very version: a robot placed on an older
    // one has to be sent this one (row 8) and placed again.
    if (onMap.match !== 'same') {
      return step('placed', 'grey', t(onMap.match === 'differs' ? 'missions.maps.ready.placed.otherVersion' : 'missions.maps.ready.placed.noVersion', { robot }))
    }
    if (localised === true) return step('placed', 'green', t('missions.maps.ready.placed.yes', { robot }))
    const setPosition: ReadinessAction = { kind: 'setPosition', robotId: onMap.robot.robot_id }
    return localised === false
      ? step('placed', 'grey', t('missions.maps.ready.placed.no', { robot }), setPosition)
      : step('placed', 'grey', t('missions.maps.ready.placed.unknown', { robot }), setPosition)
  })()

  return [mapped, legs, moved, quality, trimmed, zones, active, onRobot, placed]
}

/** The x, y box of a floor's track.csv (`t,x,y,z`, maps/survey_math.py
 *  read_track_csv): null for a file that is not a track or has no samples.
 *  Rows that are not four finite numbers are skipped, not fatal: this only
 *  sizes a box. */
export function trackExtent(data: ArrayBuffer): WalkedArea | null {
  const lines = new TextDecoder().decode(data).split(/\r?\n/)
  const header = (lines[0] ?? '').split(',').map((h) => h.trim().toLowerCase())
  if (header.join(',') !== 't,x,y,z') return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',')
    if (parts.length !== 4) continue
    const values = parts.map((p) => (p.trim() === '' ? NaN : Number(p)))
    if (!values.every(Number.isFinite)) continue
    const [, x, y] = values
    minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    minY = Math.min(minY, y); maxY = Math.max(maxY, y)
  }
  return minX === Infinity ? null : { min: [minX, minY], max: [maxX, maxY] }
}
