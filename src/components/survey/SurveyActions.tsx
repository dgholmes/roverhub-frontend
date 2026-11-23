import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FastForward, RotateCcw } from 'lucide-react'
import { Button } from '@/components/kit'
import { USE_NAV_MAP_SCHEMA } from '@/components/maps/robotMaps'
import { color, font, radius, space } from '@/design-system/tokens'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { schemaAtLeast } from '@/lib/schemaVersion'
import { useCan } from '@/org/useCan'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { reprocessSurvey, skipMovingSearch } from '@/survey/surveyCommands'
import type { RobotState } from '@/types'

/**
 * The survey's after-Stop buttons (map ready spec 4.2, 4.6), shared by
 * Missions › Maps › Survey and LiveOps' survey banner:
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

/** Process again on a failed survey's card. The map and floor are the survey's
 *  own, from its record in the cloud; with no record (it failed before one was
 *  uploaded) it makes a new map, and says so. */
export function ProcessAgain({ robotId, surveyId }: { robotId: string; surveyId: string }) {
  const { t } = useTranslation()
  const robot = useRobot(robotId)
  const canConfigure = useCan('configure')
  const mounted = useMounted()
  // undefined: still reading; null: no record in the cloud.
  const [target, setTarget] = useState<{ map_id: string | null; floor_index: number; name: string } | null | undefined>(undefined)
  // Asked first, as on Data › Surveys: it uploads a new version and can run for an hour.
  const [state, setState] = useState<{ kind: 'idle' } | { kind: 'asking' } | { kind: 'sent' } | { kind: 'failed'; error: string }>({ kind: 'idle' })

  useEffect(() => {
    let cancelled = false
    dataProvider.getSurvey(surveyId).then(
      (d) => { if (!cancelled) setTarget({ map_id: d.record.map_id, floor_index: d.record.floor_index, name: d.record.name }) },
      () => { if (!cancelled) setTarget(null) },
    )
    return () => { cancelled = true }
  }, [surveyId])

  if (!answersMapReady(robot)) return null
  const recording = robot!.bridge?.recordings?.find((r) => r.survey_id === surveyId)
  if (!recording?.has_bag) return <p style={note}>{t('survey.again.noRecording')}</p>
  if (!canConfigure) return <p style={note}>{t('survey.again.needsEngineer')}</p>

  const go = async () => {
    setState({ kind: 'sent' })
    const result = await reprocessSurvey(robotId, {
      survey_id: surveyId, map_id: target?.map_id ?? null, floor_index: target?.floor_index ?? 0, rebuild: false,
    })
    if (mounted.current && !result.ok) setState({ kind: 'failed', error: result.error ?? '' })
  }

  return (
    <div style={{ display: 'grid', gap: space[2], justifyItems: 'start' }}>
      {state.kind !== 'asking' && (
        <Button icon={RotateCcw} disabled={target === undefined || state.kind === 'sent'} onClick={() => setState({ kind: 'asking' })}>
          {t('survey.again.button')}
        </Button>
      )}
      {state.kind === 'asking' && (
        <div role="alertdialog" aria-label={t('survey.again.button')} style={{
          display: 'grid', gap: space[2], padding: space[3], borderRadius: radius.md, background: color.amberBg, maxWidth: 560,
        }}>
          <p style={{ ...note, color: color.t1 }}>
            {t('survey.again.confirm', {
              name: target?.name || surveyId, robot: robot!.name,
              target: target?.map_id ? t('survey.recording.itsMap') : t('survey.recording.newMap'),
            })}
          </p>
          <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
            <Button size="sm" variant="primary" icon={RotateCcw} onClick={() => void go()}>{t('survey.again.button')}</Button>
            <Button size="sm" onClick={() => setState({ kind: 'idle' })}>{t('survey.recording.cancel')}</Button>
          </div>
        </div>
      )}
      {target === null && state.kind === 'idle' && <p style={{ ...note, color: color.t3 }}>{t('survey.again.newMap')}</p>}
      {state.kind === 'sent' && <p role="status" style={note}>{t('survey.again.sent')}</p>}
      {state.kind === 'failed' && (
        <p role="alert" style={{ ...note, color: color.red }}>{t('survey.again.failed', { error: state.error })}</p>
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
          {t('survey.skip.failed', { error: state.error })}
        </span>
      )}
    </span>
  )
}
