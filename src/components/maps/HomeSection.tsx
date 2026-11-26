import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { House, LocateFixed } from 'lucide-react'
import { Button } from '@/components/kit'
import { Section } from '@/components/fleet/v2/parts'
import { color, font, radius, space } from '@/design-system/tokens'
import { ApiError } from '@/lib/realtime/apiError'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { initialPoseFrom } from '@/liveops/navGoal'
import { robotsForSite } from '@/org/siteRobots'
import { useCan } from '@/org/useCan'
import type { RobotState } from '@/types'
import type { MapHomePose, Point2D, SiteMap } from '@/types/maps'
import { errorText } from './mapPipeline'
import { robotOnFloor } from './robotMaps'
import { useProviderRobots } from './useProviderRobots'

/**
 * Home on the Map page (schema 0.0.33): where Return home walks the robot to,
 * one per floor. Set home, then a press on the floor plan and a drag toward the
 * way the robot should face -- the same gesture as Set position in LiveOps,
 * read by the same map input (NavMapInput) -- then Save. The backend refuses a
 * spot off the walked area or without room to turn, and its sentence is shown
 * as it comes.
 *
 * Or "Use {robot}'s position" (operator, 2026-11-26): where a robot placed on
 * this floor stands now, facing the way it faces. Offered only for a robot
 * whose position means something here (robotOnFloor: its nav stack runs this
 * floor, and the position is localisation's, not odometry's). The pose is
 * shown, and drawn on the plan, before Save, exactly as a pick on the plan is.
 *
 * Self-contained, as the zones are: `useHomeDraft` holds the pick, the centre
 * map (MapPlanView) draws and reads it, and this section is the words and the
 * buttons. Who may change it: whoever may edit zones, as the backend rules.
 */

type PoseProblem = 'needDrag' | 'outsideFloor'

interface DraftState {
  picking: boolean
  /** The press and where the drag is now; kept after release to draw the pick. */
  pose: { at: Point2D; toward: Point2D } | null
  picked: MapHomePose | null
  problem: PoseProblem | null
  /** The robot whose position the pick is, or null for a pick on the plan. */
  robot: string | null
}

type DraftAction =
  | { type: 'start' } | { type: 'cancel' }
  | { type: 'press'; point: Point2D } | { type: 'drag'; point: Point2D }
  | { type: 'picked'; pose: MapHomePose; toward: Point2D } | { type: 'problem'; problem: PoseProblem }
  | { type: 'fromRobot'; robot: string; pose: MapHomePose; toward: Point2D }
  | { type: 'robotOutside'; robot: string }

const IDLE: DraftState = { picking: false, pose: null, picked: null, problem: null, robot: null }

function reduce(s: DraftState, a: DraftAction): DraftState {
  switch (a.type) {
    case 'start': return { ...IDLE, picking: true }
    case 'cancel': return IDLE
    case 'fromRobot': return {
      picking: true, pose: { at: [a.pose.x_m, a.pose.y_m], toward: a.toward }, picked: a.pose, problem: null, robot: a.robot,
    }
    case 'robotOutside': return { ...IDLE, picking: true, problem: 'outsideFloor', robot: a.robot }
    case 'press': return s.picking ? { ...s, pose: { at: a.point, toward: a.point }, picked: null, problem: null, robot: null } : s
    case 'drag': return s.picking && s.pose ? { ...s, pose: { ...s.pose, toward: a.point } } : s
    case 'picked': return s.picking && s.pose ? { ...s, pose: { ...s.pose, toward: a.toward }, picked: a.pose, problem: null } : s
    case 'problem': return s.picking ? { ...s, pose: null, picked: null, problem: a.problem } : s
  }
}

export interface HomeDraft {
  picking: boolean
  pose: DraftState['pose']
  /** The pose a finished press-drag-release picked, ready to save. */
  picked: MapHomePose | null
  problem: PoseProblem | null
  /** The robot whose position was taken, or null for a pick on the plan. */
  robot: string | null
  start: () => void
  /** Takes a robot's live position and heading as the pick, ready to save. */
  fromRobot: (robot: Pick<RobotState, 'name' | 'position'>) => void
  cancel: () => void
  onPress: (point: Point2D) => void
  onDrag: (point: Point2D) => void
  onRelease: (point: Point2D) => void
}

/** The home being picked on `map`'s floor `floorIndex`. Another map or floor
 * drops the pick. */
export function useHomeDraft(map: SiteMap, floorIndex: number): HomeDraft {
  const [state, dispatch] = useReducer(reduce, IDLE)
  const floor = map.floors.find((f) => f.index === floorIndex)
  useEffect(() => { dispatch({ type: 'cancel' }) }, [map.map_id, floorIndex])

  const start = useCallback(() => dispatch({ type: 'start' }), [])
  const cancel = useCallback(() => dispatch({ type: 'cancel' }), [])
  // Where the press landed, read on release without waiting for a render:
  // the two can arrive in one batch.
  const pressedAt = useRef<Point2D | null>(null)
  const onPress = useCallback((point: Point2D) => { pressedAt.current = point; dispatch({ type: 'press', point }) }, [])
  const onDrag = useCallback((point: Point2D) => dispatch({ type: 'drag', point }), [])
  const onRelease = useCallback((point: Point2D) => {
    const at = pressedAt.current
    pressedAt.current = null
    if (!at || !floor) return
    // The floor's edge is checked here; the walked area and the room to turn
    // are the backend's (maps/home.py), on the planning grid this page does
    // not load.
    const pose = initialPoseFrom(at, point, floor, null)
    if (!pose.ok) { dispatch({ type: 'problem', problem: 'outsideFloor' }); return }
    if (pose.yaw_rad === null) { dispatch({ type: 'problem', problem: 'needDrag' }); return }
    dispatch({ type: 'picked', pose: { x_m: pose.x_m, y_m: pose.y_m, yaw_rad: pose.yaw_rad }, toward: point })
  }, [floor])
  const fromRobot = useCallback((robot: Pick<RobotState, 'name' | 'position'>) => {
    if (!floor) return
    const pose = homeFromRobot(robot.position)
    const at: Point2D = [pose.x_m, pose.y_m]
    // A metre along its heading: where the plan draws the arrow.
    const toward: Point2D = [pose.x_m + Math.cos(pose.yaw_rad), pose.y_m + Math.sin(pose.yaw_rad)]
    if (!initialPoseFrom(at, toward, floor, null).ok) { dispatch({ type: 'robotOutside', robot: robot.name }); return }
    dispatch({ type: 'fromRobot', robot: robot.name, pose, toward })
  }, [floor])

  return { ...state, start, fromRobot, cancel, onPress, onDrag, onRelease }
}

/** A robot's live map pose as a home: x and y as they are, and its heading
 * (degrees anticlockwise from the map's +x) as radians, in [-pi, pi). */
export function homeFromRobot(position: Pick<RobotState['position'], 'x_m' | 'y_m' | 'heading_deg'>): MapHomePose {
  const deg = ((((position.heading_deg + 180) % 360) + 360) % 360) - 180
  return { x_m: position.x_m, y_m: position.y_m, yaw_rad: (deg * Math.PI) / 180 }
}

/** The backend's sentence for a refusal: `{code, message}` (422 home_not_clear
 * and friends), else whatever the error says. */
function homeErrorText(e: unknown): string {
  if (e instanceof ApiError) {
    const d = (e.body as { detail?: unknown } | null)?.detail
    if (d && typeof d === 'object' && typeof (d as { message?: unknown }).message === 'string') {
      return (d as { message: string }).message
    }
  }
  return errorText(e)
}

/** A pose's numbers as the section words them: two decimals, and the heading
 * in whole degrees anticlockwise from the map's +x, in (-180, 180]. */
export function poseFigures(p: MapHomePose): { x: string; y: string; heading: string } {
  let deg = Math.round((p.yaw_rad * 180) / Math.PI) % 360
  if (deg > 180) deg -= 360
  if (deg <= -180) deg += 360
  return { x: p.x_m.toFixed(2), y: p.y_m.toFixed(2), heading: String(deg === 0 ? 0 : deg) }
}

export function HomeSection({ map, floorIndex, draft, onChanged }: {
  map: SiteMap
  floorIndex: number
  draft: HomeDraft
  /** The map as the server stored it, after a save or a removal. */
  onChanged: (map: SiteMap) => void
}) {
  const { t } = useTranslation()
  const canEdit = useCan('editZones')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const home = map.floors.find((f) => f.index === floorIndex)?.home ?? null
  const note: React.CSSProperties = { margin: 0, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }
  const poseText = (p: MapHomePose) => t('missions.maps.home.pose', poseFigures(p))
  // The site's robots placed on this floor now: their position may be taken as home.
  const all = useProviderRobots()
  const placed = useMemo(
    () => (canEdit ? robotsForSite(all, map.site_id).filter((r) => robotOnFloor(r, map, floorIndex)) : []),
    [canEdit, all, map, floorIndex],
  )

  // A new pick, map or floor starts without the last refusal.
  useEffect(() => { setError(null) }, [map.map_id, floorIndex, draft.picking, draft.robot])

  const save = async () => {
    if (!draft.picked) return
    setBusy(true)
    setError(null)
    try {
      const stored = await dataProvider.setMapHome(map.map_id, floorIndex, draft.picked)
      draft.cancel()
      onChanged(stored)
    } catch (e) {
      setError(homeErrorText(e))
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    setBusy(true)
    setError(null)
    try {
      onChanged(await dataProvider.clearMapHome(map.map_id, floorIndex))
    } catch (e) {
      setError(homeErrorText(e))
    } finally {
      setBusy(false)
    }
  }

  const fromRobotButtons = placed.map((r) => (
    <Button key={r.robot_id} size="sm" icon={LocateFixed} disabled={busy} data-home-from-robot={r.robot_id}
      title={t('missions.maps.home.useRobotTitle', { robot: r.name })} onClick={() => draft.fromRobot(r)}>
      {t('missions.maps.home.useRobot', { robot: r.name })}
    </Button>
  ))

  const aside = canEdit && !draft.picking ? (
    <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <Button size="sm" icon={House} disabled={busy} onClick={draft.start}>
        {t(home ? 'missions.maps.home.move' : 'missions.maps.home.set')}
      </Button>
      {home && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void remove()}>{t('missions.maps.home.remove')}</Button>}
    </div>
  ) : undefined

  return (
    <Section title={t('missions.maps.home.title')} aside={aside}>
      <div data-home-section="" style={{ display: 'grid', gap: space[2] }}>
        {!draft.picking && (
          <p
            title={home ? undefined : t('missions.maps.home.noneHint')}
            style={{ ...note, display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: space[2], color: home ? color.t1 : color.t2, fontVariantNumeric: 'tabular-nums' }}
          >
            <House size={16} strokeWidth={1.75} aria-hidden style={{ flexShrink: 0, color: home ? color.accent : color.t3 }} />
            <span data-home-pose="">{home ? poseText(home) : t('missions.maps.home.none')}</span>
            {home?.set_by && <span style={{ color: color.t3 }}>{t('missions.maps.home.setBy', { who: home.set_by })}</span>}
          </p>
        )}
        {!draft.picking && fromRobotButtons.length > 0 && (
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>{fromRobotButtons}</div>
        )}

        {draft.picking && (
          // A tint, not an outline: the pick in progress reads as a state of
          // the section, the way the trim question does.
          <div style={{ display: 'grid', gap: space[2], padding: space[3], borderRadius: radius.md, background: color.blueBg }}>
            {draft.picked ? (
              <p data-home-picked="" style={{ ...note, color: color.t1, fontVariantNumeric: 'tabular-nums' }}>
                {draft.robot ? t('missions.maps.home.pickedFrom', { robot: draft.robot }) : t('missions.maps.home.picked')}: {poseText(draft.picked)}
              </p>
            ) : (
              <p role="status" style={{ ...note, color: draft.problem ? color.amber : color.t2 }}>
                {draft.problem === 'needDrag' ? t('missions.maps.home.needDrag')
                  : draft.problem === 'outsideFloor' ? t('missions.maps.home.outsideFloor')
                  : t('missions.maps.home.pickHint')}
              </p>
            )}
            <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
              {draft.picked && (
                <Button size="sm" variant="primary" disabled={busy} onClick={() => void save()}>
                  {busy ? t('missions.maps.home.saving') : t('missions.maps.home.save')}
                </Button>
              )}
              {/* Picking on the plan, a placed robot's position is still one press away. */}
              {!draft.robot && fromRobotButtons}
              <Button size="sm" disabled={busy} onClick={draft.cancel}>{t('missions.maps.home.cancel')}</Button>
            </div>
          </div>
        )}

        {error && <p role="alert" style={{ ...note, color: color.red }}>{error}</p>}
      </div>
    </Section>
  )
}
