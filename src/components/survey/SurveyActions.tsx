import { useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FastForward, RotateCcw } from 'lucide-react'
import { Button, InlineAlertDialog } from '@/components/kit'
import { bridgeOffline, USE_NAV_MAP_SCHEMA } from '@/components/maps/robotMaps'
import { color, font, radius, space } from '@/design-system/tokens'
import { ApiError } from '@/lib/realtime/apiError'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { schemaAtLeast } from '@/lib/schemaVersion'
import { useCan } from '@/org/useCan'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { asSentence, reprocessSurvey, skipMovingSearch } from '@/survey/surveyCommands'
import type { RobotState } from '@/types'

/**
 * The survey's after-Stop buttons (map ready spec 4.2, 4.6), shared by
 * Map › Survey and LiveOps' survey banner:
 *   - Process again, on a survey that failed: the same processing run again on
 *     the recording still on the robot (REPROCESS_SURVEY). Its progress shows
 *     on survey/status as after Stop & save; its ack only comes when it ends.
 *   - Skip for now, while the robot is finding things that moved: the search
 *     stops and the map is uploaded with no moved list (Find now can run it
 *     later from the map's checklist).
 * Both need `configure`, as START_SURVEY does, and a 0.0.29 bridge.
 */

/** Set while mounted, so a late answer is not written into an unmounted row.
 *  Set again on every mount: StrictMode mounts twice. */
export function useMounted() {
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  return mounted
}

/** The robot as the LiveOps store holds it. */
export function useRobot(robotId: string | null | undefined): RobotState | undefined {
  return useLiveOpsStore((s) => (robotId ? s.robots.find((r) => r.robot_id === robotId) : undefined))
}

/** Whether this robot's bridge answers the map ready commands. */
export const answersMapReady = (robot: Pick<RobotState, 'bridge'> | undefined) =>
  !!robot && schemaAtLeast(robot.bridge?.schema_version, USE_NAV_MAP_SCHEMA)

const note: React.CSSProperties = { margin: 0, fontSize: font.size.sm, color: color.t2, lineHeight: 1.5 }

/** Where Process again sends the survey: its map and floor from its record in
 *  the cloud, with the floor's current name from that map. */
interface AgainTarget { map_id: string | null; floor_index: number; floor_label: string | null; name: string }

/** The survey's record as Process again reads it: `undefined` while reading,
 *  `null` when the backend has no record (a 404 -- it failed before one was
 *  uploaded), or the read's error. Only a 404 means "no record": any other
 *  failure must not send `map_id: null`, which would make a second map of a
 *  survey that already has one. */
type AgainRead = AgainTarget | null | undefined | { error: string }

/** The survey's floor name, read from its map, so processing again keeps it.
 *  Unknown (the map unreadable, or no name) leaves it out: the backend keeps a
 *  stored floor's name when none is sent. */
export async function floorLabelOf(mapId: string | null, floorIndex: number): Promise<string | null> {
  if (!mapId) return null
  try {
    const map = await dataProvider.getMap(mapId)
    return map?.floors.find((f) => f.index === floorIndex)?.label ?? null
  } catch {
    return null
  }
}

/** REPROCESS_SURVEY's params: `floor_label` only when known. */
export const reprocessParams = (
  surveyId: string, target: Pick<AgainTarget, 'map_id' | 'floor_index' | 'floor_label'>, rebuild: boolean,
) => ({
  survey_id: surveyId, map_id: target.map_id, floor_index: target.floor_index,
  ...(target.floor_label ? { floor_label: target.floor_label } : {}), rebuild,
})

/** Process again on a failed survey's card. The map and floor are the survey's
 *  own, from its record in the cloud; with no record (it failed before one was
 *  uploaded) it makes a new map, and says so. A record that cannot be read
 *  says so too, and nothing is sent. Off while the robot is offline. */
export function ProcessAgain({ robotId, surveyId }: { robotId: string; surveyId: string }) {
  const { t } = useTranslation()
  const robot = useRobot(robotId)
  const canConfigure = useCan('configure')
  const mounted = useMounted()
  const [read, setRead] = useState<AgainRead>(undefined)
  // Asked first, as on Data › Surveys: it uploads a new version and can run for an hour.
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'asking' } | { kind: 'sent' } | { kind: 'failed'; error: string }>({ kind: 'idle' })
  const opener = useRef<HTMLButtonElement>(null)
  const textId = useId()

  useEffect(() => {
    let cancelled = false
    setRead(undefined)
    dataProvider.getSurvey(surveyId).then(
      async (d) => {
        const floor_label = await floorLabelOf(d.record.map_id, d.record.floor_index)
        if (!cancelled) setRead({ map_id: d.record.map_id, floor_index: d.record.floor_index, floor_label, name: d.record.name })
      },
      (e: unknown) => {
        if (cancelled) return
        setRead(e instanceof ApiError && e.status === 404 ? null : { error: e instanceof Error ? e.message : String(e) })
      },
    )
    return () => { cancelled = true }
  }, [surveyId])

  if (!answersMapReady(robot)) return null
  const recording = robot!.bridge?.recordings?.find((r) => r.survey_id === surveyId)
  if (!recording?.has_bag) return <p style={note}>{t('survey.again.noRecording')}</p>
  if (!canConfigure) return <p style={note}>{t('survey.again.needsEngineer')}</p>

  const readError = read && 'error' in read ? read.error : null
  // Where it is sent: the record's map, a new map (no record), or nowhere yet.
  const target: (Pick<AgainTarget, 'map_id' | 'floor_index' | 'floor_label'> & { name?: string }) | null =
    read === null ? { map_id: null, floor_index: 0, floor_label: null } : read && !('error' in read) ? read : null
  const offline = bridgeOffline(robot!)
  const offlineText = t('survey.again.offline', { robot: robot!.name })

  const go = async () => {
    if (!target || offline) return
    setState({ kind: 'sent' })
    const result = await reprocessSurvey(robotId, reprocessParams(surveyId, target, false))
    if (mounted.current && !result.ok) setState({ kind: 'failed', error: result.error ?? '' })
  }

  return (
    <div style={{ display: 'grid', gap: space[2], justifyItems: 'start' }}>
      {state.kind !== 'asking' && (
        <Button ref={opener} icon={RotateCcw} disabled={target === null || offline || state.kind === 'sent'}
          title={offline ? offlineText : undefined} onClick={() => setState({ kind: 'asking' })}>
          {t('survey.again.button')}
        </Button>
      )}
      {state.kind === 'asking' && target && (
        <InlineAlertDialog label={t('survey.again.button')} describedBy={textId} returnFocus={opener}
          onClose={() => setState({ kind: 'idle' })}
          style={{ display: 'grid', gap: space[2], padding: space[3], borderRadius: radius.md, background: color.amberBg, maxWidth: 560 }}>
          <p id={textId} style={{ ...note, color: color.t1 }}>
            {t('survey.again.confirm', {
              name: target.name || surveyId, robot: robot!.name,
              target: target.map_id ? t('survey.recording.itsMap') : t('survey.recording.newMap'),
            })}
          </p>
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
            <Button size="sm" variant="primary" icon={RotateCcw} disabled={offline} onClick={() => void go()}>{t('survey.again.button')}</Button>
            <Button size="sm" data-autofocus onClick={() => setState({ kind: 'idle' })}>{t('survey.recording.cancel')}</Button>
          </div>
        </InlineAlertDialog>
      )}
      {offline && state.kind !== 'sent' && <p style={{ ...note, color: color.t3 }}>{offlineText}</p>}
      {read === null && state.kind === 'idle' && <p style={{ ...note, color: color.t3 }}>{t('survey.again.newMap')}</p>}
      {readError !== null && (
        <p role="alert" data-again-error style={{ ...note, color: color.red }}>{t('survey.again.readFailed', { error: readError })}</p>
      )}
      {state.kind === 'sent' && <p role="status" style={note}>{t('survey.again.sent')}</p>}
      {state.kind === 'failed' && (
        <p role="alert" style={{ ...note, color: color.red }}>{t('survey.again.failed', { error: asSentence(state.error) })}</p>
      )}
    </div>
  )
}

/** Skip for now, while survey/status says the robot is finding things that moved. */
export function SkipMoving({ robotId, surveyId, compact = false }: { robotId: string; surveyId: string; compact?: boolean }) {
  const { t } = useTranslation()
  const robot = useRobot(robotId)
  const canConfigure = useCan('configure')
  const mounted = useMounted()
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'sending' } | { kind: 'failed'; error: string }>({ kind: 'idle' })
  if (!canConfigure || !answersMapReady(robot)) return null

  const skip = async () => {
    setState({ kind: 'sending' })
    const result = await skipMovingSearch(robotId, { survey_id: surveyId })
    if (!mounted.current) return
    setState(result.ok ? { kind: 'idle' } : { kind: 'failed', error: result.error ?? '' })
  }

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
      <Button size="sm" icon={FastForward} title={t('survey.skip.hint')} disabled={state.kind === 'sending'} onClick={() => void skip()}>
        {state.kind === 'sending' ? t('survey.skip.sending') : t('survey.skip.button')}
      </Button>
      {!compact && state.kind !== 'failed' && <span style={{ ...note, fontSize: font.size.xs, color: color.t3 }}>{t('survey.skip.hint')}</span>}
      {state.kind === 'failed' && (
        <span role="alert" style={{
          fontSize: font.size.sm, color: color.red, padding: `2px ${space[2]}px`, borderRadius: radius.sm, background: color.redBg,
        }}>
          {t('survey.skip.failed', { error: asSentence(state.error) })}
        </span>
      )}
    </span>
  )
}
