import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { House } from 'lucide-react'
import { Button } from '@/components/kit'
import { Section } from '@/components/fleet/v2/parts'
import { color, font, radius, space } from '@/design-system/tokens'
import { ApiError } from '@/lib/realtime/apiError'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { initialPoseFrom } from '@/liveops/navGoal'
import { useCan } from '@/org/useCan'
import type { MapHomePose, Point2D, SiteMap } from '@/types/maps'
import { errorText } from './mapPipeline'

/**
 * Home on the Map page (schema 0.0.33): where Return home walks the robot to,
 * one per floor. Set home, then a press on the floor plan and a drag toward the
 * way the robot should face -- the same gesture as Set position in LiveOps,
 * read by the same map input (NavMapInput) -- then Save. The backend refuses a
 * spot off the walked area or without room to turn, and its sentence is shown
 * as it comes.
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
}

type DraftAction =
  | { type: 'start' } | { type: 'cancel' }
  | { type: 'press'; point: Point2D } | { type: 'drag'; point: Point2D }
  | { type: 'picked'; pose: MapHomePose; toward: Point2D } | { type: 'problem'; problem: PoseProblem }

const IDLE: DraftState = { picking: false, pose: null, picked: null, problem: null }

function reduce(s: DraftState, a: DraftAction): DraftState {
  switch (a.type) {
    case 'start': return { ...IDLE, picking: true }
    case 'cancel': return IDLE
    case 'press': return s.picking ? { ...s, pose: { at: a.point, toward: a.point }, picked: null, problem: null } : s
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
  start: () => void
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

  return { ...state, start, cancel, onPress, onDrag, onRelease }
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

  // A new pick, map or floor starts without the last refusal.
  useEffect(() => { setError(null) }, [map.map_id, floorIndex, draft.picking])

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

  const aside = canEdit && !draft.picking ? (
    <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
      <Button size="sm" icon={House} disabled={busy} onClick={draft.start}>
        {t(home ? 'missions.maps.home.move' : 'missions.maps.home.set')}
      </Button>
      {home && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void remove()}>{t('missions.maps.home.remove')}</Button>}
    </div>
  ) : undefined

  return (
    <Section title={t('missions.maps.home.title')} aside={aside}>
      <div data-home-section="" style={{ display: 'grid', gap: space[2] }}>
        {!draft.picking && (home ? (
          <>
            <p style={{ ...note, display: 'flex', alignItems: 'center', gap: space[2], color: color.t1, fontVariantNumeric: 'tabular-nums' }}>
              <span aria-hidden style={{ width: 8, height: 8, borderRadius: radius.full, flexShrink: 0, background: color.accent }} />
              {poseText(home)}
            </p>
            {home.set_by && <p style={note}>{t('missions.maps.home.setBy', { who: home.set_by })}</p>}
          </>
        ) : (
          <>
            <p style={{ ...note, color: color.t2 }}>{t('missions.maps.home.none')}</p>
            <p style={note}>{t('missions.maps.home.noneHint')}</p>
          </>
        ))}

        {draft.picking && (
          // A tint, not an outline: the pick in progress reads as a state of
          // the section, the way the trim question does.
          <div style={{ display: 'grid', gap: space[2], padding: space[3], borderRadius: radius.md, background: color.blueBg }}>
            {draft.picked ? (
              <p style={{ ...note, color: color.t1, fontVariantNumeric: 'tabular-nums' }}>
                {t('missions.maps.home.picked')}: {poseText(draft.picked)}
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
              <Button size="sm" disabled={busy} onClick={draft.cancel}>{t('missions.maps.home.cancel')}</Button>
            </div>
          </div>
        )}

        {error && <p role="alert" style={{ ...note, color: color.red }}>{error}</p>}
      </div>
    </Section>
  )
}
