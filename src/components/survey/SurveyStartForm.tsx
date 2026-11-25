import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Play } from 'lucide-react'
import { Button, Segmented } from '@/components/kit'
import { Field, inputStyle } from '@/components/missions/parts'
import { color, font, radius, space } from '@/design-system/tokens'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { useOperatorId } from '@/lib/realtime/operator'
import { useCan } from '@/org/useCan'
import { useRobotRun } from '@/liveops/useRobotRun'
import { useControlHolderNames } from '@/liveops/controlOwner'
import { startSurvey } from '@/survey/surveyCommands'
import { defaultSurveyName, newSurveyId, robotCanSurvey, surveyStartRefusal, surveyStartRefusalText } from '@/survey/surveyModel'
import { useSurveyStatus } from '@/survey/useSurvey'
import type { RobotState } from '@/types'
import { MAX_FLOOR_LABEL_CHARS, type SiteMap } from '@/types/maps'
import { CAMERA_SETS, type CameraSet, type StartSurveyParams } from '@/types/survey'

const NEW_MAP = ''
/** The floor choice that adds a floor after the map's last. */
const NEXT_FLOOR = 'next'

/** The floor a survey of `map` covers (map ready spec 4.1). A new map starts
 * at the ground floor, index 0, named by `label` if given. An existing map's
 * floor is one it has (a re-survey of it) or the next one, index = its number
 * of floors -- the backend refuses anything past that. */
export function surveyFloor(map: Pick<SiteMap, 'floors'> | null, choice: string, label: string):
  { floor_index: number; floor_label: string | null } {
  const named = label.trim() || null
  if (!map) return { floor_index: 0, floor_label: named }
  if (choice === NEXT_FLOOR) return { floor_index: map.floors.length, floor_label: named }
  return { floor_index: Number(choice), floor_label: null }
}

/** The floors an existing map offers, lowest first. */
const floorsOf = (map: Pick<SiteMap, 'floors'>) => [...map.floors].sort((a, b) => a.index - b.index)

/** The robot a form opens on: the one asked for if it can survey, else the
 * first that can and is online, else the first that can. */
export function pickSurveyRobot(robots: RobotState[], preferred: string | null | undefined): string | null {
  const can = robots.filter(robotCanSurvey)
  if (preferred && can.some((r) => r.robot_id === preferred)) return preferred
  return (can.find((r) => r.connectivity.bridge_state === 'connected') ?? can[0])?.robot_id ?? null
}

/**
 * The survey's start form, the same in Missions › Maps › Survey and in
 * LiveOps' More menu: robot (unless the caller fixes it), name, the map it
 * makes or replaces, the floor (a new map's is the ground floor, with an
 * optional name; an existing map's is one of its floors or the next one), and
 * cameras -- off by default, because they are
 * an add-on the survey never depends on. Start is enabled only when the robot
 * can start one now; otherwise the reason is under the button.
 */
export function SurveyStartForm({ siteId, robots, robotId: fixedRobotId, initialRobotId, onStarted, onCancel }: {
  siteId: string
  /** The site's robots; only those whose bridge can survey are offered. */
  robots: RobotState[]
  /** Survey with this robot, no picker (LiveOps). */
  robotId?: string
  initialRobotId?: string | null
  onStarted: (robotId: string, surveyId: string) => void
  onCancel?: () => void
}) {
  const { t } = useTranslation()
  const operatorId = useOperatorId()
  const canConfigure = useCan('configure')
  const [chosen, setChosen] = useState<string | null>(() => fixedRobotId ?? pickSurveyRobot(robots, initialRobotId))
  const robotId = fixedRobotId ?? chosen
  const robot = robots.find((r) => r.robot_id === robotId)
  const status = useSurveyStatus(robotId)
  const { view: run } = useRobotRun(robotId ?? null)
  useControlHolderNames([robot?.control_owner])
  const [name, setName] = useState(() => defaultSurveyName(new Date(), t('survey.start.defaultNameWord')))
  const [mapId, setMapId] = useState<string>(NEW_MAP)
  const [floorChoice, setFloorChoice] = useState('0')
  const [floorLabel, setFloorLabel] = useState('')
  const [cameras, setCameras] = useState<CameraSet>('off')
  const [maps, setMaps] = useState<SiteMap[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    dataProvider.listMaps(siteId).then((list) => { if (live) setMaps(list) }, () => { /* new map only */ })
    return () => { live = false }
  }, [siteId])

  // A robot that drops out of the list (or loses its bridge version) is not kept.
  useEffect(() => {
    if (fixedRobotId) return
    if (!chosen || !robots.some((r) => r.robot_id === chosen && robotCanSurvey(r))) setChosen(pickSurveyRobot(robots, chosen))
  }, [robots, chosen, fixedRobotId])

  const target = maps.find((m) => m.map_id === mapId) ?? null
  const refusal = robot ? surveyStartRefusal(robot, status, run, operatorId) : null
  const trimmed = name.trim()
  const floor = surveyFloor(target, floorChoice, floorLabel)
  const floorOk = floor.floor_index <= 50 && (floor.floor_label?.length ?? 0) <= MAX_FLOOR_LABEL_CHARS
  const canStart = !!robot && !refusal && !!trimmed && trimmed.length <= 80 && floorOk && !busy
  const targetFloors = useMemo(() => (target ? floorsOf(target) : []), [target])
  // A floor name goes with a floor the map does not have yet.
  const namesFloor = !target || floorChoice === NEXT_FLOOR
  const pickMap = (id: string) => {
    setMapId(id)
    const picked = maps.find((m) => m.map_id === id)
    // An existing map opens on its lowest floor (a re-survey), a new one on its ground floor.
    setFloorChoice(picked && picked.floors.length ? String(floorsOf(picked)[0].index) : picked ? NEXT_FLOOR : '0')
  }

  const submit = async () => {
    if (!robot || !canStart) return
    setBusy(true)
    setError(null)
    const params: StartSurveyParams = {
      survey_id: newSurveyId(), name: trimmed, floor_index: floor.floor_index, map_id: target ? target.map_id : null, cameras,
      ...(floor.floor_label ? { floor_label: floor.floor_label } : {}),
    }
    const result = await startSurvey(robot.robot_id, params)
    setBusy(false)
    if (result.ok) onStarted(robot.robot_id, params.survey_id)
    else setError(result.error)
  }

  const candidates = robots
  // START_SURVEY needs `configure` on the backend (403 otherwise): say so
  // rather than offer a button that is refused.
  if (!canConfigure) {
    return <p role="status" style={{ margin: 0, fontSize: font.size.md, color: color.t2, lineHeight: 1.5, maxWidth: 560 }}>{t('survey.start.needsEngineer')}</p>
  }
  if (!fixedRobotId && !candidates.some(robotCanSurvey)) {
    return <p role="status" style={{ margin: 0, fontSize: font.size.md, color: color.t2, lineHeight: 1.5, maxWidth: 560 }}>{t('survey.start.noRobots')}</p>
  }

  return (
    <form
      aria-label={t('survey.start.title')}
      onSubmit={(e) => { e.preventDefault(); void submit() }}
      style={{ display: 'grid', gap: space[4], maxWidth: 560 }}
    >
      {!fixedRobotId && (
        <Field label={t('survey.start.robot')}>
          <select
            aria-label={t('survey.start.robotAria')} value={robotId ?? ''}
            onChange={(e) => { setChosen(e.target.value); setError(null) }}
            style={{ ...inputStyle, border: 'none' }}
          >
            {candidates.map((r) => {
              const can = robotCanSurvey(r)
              const offline = r.connectivity.bridge_state !== 'connected'
              const label = !can ? t('survey.start.robotTooOld', { name: r.name })
                : offline ? t('survey.start.robotOffline', { name: r.name }) : r.name
              return <option key={r.robot_id} value={r.robot_id} disabled={!can}>{label}</option>
            })}
          </select>
        </Field>
      )}
      <Field label={t('survey.start.name')}>
        <input
          value={name} maxLength={80} onChange={(e) => setName(e.target.value)}
          style={{ ...inputStyle, border: 'none' }}
        />
      </Field>
      <Field label={t('survey.start.map')} hint={target ? t('survey.start.replaceHint') : undefined}>
        <select aria-label={t('survey.start.map')} value={mapId} onChange={(e) => pickMap(e.target.value)} style={{ ...inputStyle, border: 'none' }}>
          <option value={NEW_MAP}>{t('survey.start.newMap')}</option>
          {maps.map((m) => <option key={m.map_id} value={m.map_id}>{t('survey.start.replaceMap', { name: m.name })}</option>)}
        </select>
      </Field>
      {target && (
        <Field label={t('survey.start.floor')} hint={t('survey.start.floorChoiceHint')}>
          <select
            aria-label={t('survey.start.floor')} value={floorChoice} onChange={(e) => setFloorChoice(e.target.value)}
            style={{ ...inputStyle, border: 'none' }}
          >
            {targetFloors.map((f) => (
              <option key={f.index} value={String(f.index)}>
                {f.label ? t('survey.start.floorOption', { label: f.label, index: f.index }) : t('liveops.map.floorN', { index: f.index })}
              </option>
            ))}
            <option value={NEXT_FLOOR}>{t('survey.start.floorNext', { index: target.floors.length })}</option>
          </select>
        </Field>
      )}
      {namesFloor && (
        <Field label={t('survey.start.floorName')} hint={target ? t('survey.start.floorNameHintNext') : t('survey.start.floorNameHint')}>
          <input
            name="floor-label" value={floorLabel} maxLength={MAX_FLOOR_LABEL_CHARS} placeholder={t('survey.start.floorNamePlaceholder')}
            onChange={(e) => setFloorLabel(e.target.value)} style={{ ...inputStyle, border: 'none' }}
          />
        </Field>
      )}
      <div style={{ display: 'grid', gap: space[1], justifyItems: 'start' }}>
        <span style={{ fontSize: font.size.sm, color: color.t2 }}>{t('survey.start.cameras')}</span>
        <Segmented<CameraSet>
          label={t('survey.start.cameras')} value={cameras} onChange={setCameras}
          options={CAMERA_SETS.map((c) => ({ value: c, label: t(`survey.start.camerasOption.${c}`) }))}
        />
        <span style={{ fontSize: font.size.xs, color: color.t3, lineHeight: 1.4 }}>{t('survey.start.camerasHint')}</span>
      </div>
      <div style={{ display: 'flex', gap: space[2], alignItems: 'center', flexWrap: 'wrap' }}>
        <Button type="submit" variant="primary" icon={Play} disabled={!canStart}>
          {busy ? t('survey.start.starting') : t('survey.start.submit')}
        </Button>
        {onCancel && <Button onClick={onCancel} disabled={busy}>{t('survey.start.cancel')}</Button>}
      </div>
      {refusal && (
        <p data-refusal={refusal} style={{ margin: 0, fontSize: font.size.sm, color: color.amber, lineHeight: 1.5 }}>
          {robot ? surveyStartRefusalText(refusal, robot) : t(`survey.refuse.${refusal}`)}
        </p>
      )}
      {!trimmed && <p style={{ margin: 0, fontSize: font.size.sm, color: color.amber }}>{t('survey.start.nameRequired')}</p>}
      {error && (
        <p role="alert" style={{ margin: 0, padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.md, background: color.redBg, color: color.t1, fontSize: font.size.sm }}>
          {error}
        </p>
      )}
    </form>
  )
}
