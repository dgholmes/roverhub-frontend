import { useEffect, useReducer, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RotateCw, ScanSearch } from 'lucide-react'
import { Button } from '@/components/kit'
import { color, font, radius, space } from '@/design-system/tokens'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { findMoving } from '@/sensors/sensorCommands'
import type { SiteMap } from '@/types/maps'
import { errorText } from '../mapPipeline'
import { useProviderRobots } from '../useProviderRobots'
import {
  DEFAULT_SENSITIVITY, IDLE_FIND, findMovingBlock, findReducer, resolveSurveySource, type SurveySource,
} from './findMoving'

/** How long the panel follows a search the robot accepted before it offers
 * only "Reload the list": the search takes minutes, not this long. */
const FOLLOW_LIMIT_MS = 20 * 60_000

/**
 * "Find moving things again" with its sensitivity (option A of the cleanup
 * trigger, 2026-11-16): asks the robot that surveyed this floor to search its
 * kept recording again (FIND_MOVING), follows the search from the robot's
 * survey status and the command's answer, and calls `onFound` when the new
 * list is stored so the editor reloads it. Nothing is removed by this: the
 * new list is reviewed like the first one.
 */
export function FindMovingPanel({ map, floorIndex, dirty, saving, onFound }: {
  map: SiteMap
  floorIndex: number
  /** Unsaved edits in the editor: a new list would replace what they refer to. */
  dirty: boolean
  saving: boolean
  onFound: () => void
}) {
  const { t } = useTranslation()
  const robots = useProviderRobots()
  const [source, setSource] = useState<SurveySource | null | 'loading'>('loading')
  const [jobsError, setJobsError] = useState<string | null>(null)
  const [sensitivity, setSensitivity] = useState(DEFAULT_SENSITIVITY)
  const [state, dispatch] = useReducer(findReducer, IDLE_FIND)
  const [overdue, setOverdue] = useState(false)
  const reported = useRef<FindPhaseKey | null>(null)

  // Which survey and robot: the floor's own record (survey.json), the map's
  // jobs only as a fallback, again after every change to the map.
  useEffect(() => {
    let cancelled = false
    setSource('loading')
    setJobsError(null)
    const floorRecord = dataProvider.getFloorSurvey(map.map_id, floorIndex).catch(() => undefined)
    const jobs = dataProvider.listMapJobs(map.map_id).then((j) => ({ jobs: j, error: null as string | null }),
      (e: unknown) => ({ jobs: [], error: errorText(e) }))
    void Promise.all([floorRecord, jobs]).then(([floor, j]) => {
      if (cancelled) return
      const found = resolveSurveySource(floor, j.jobs, floorIndex)
      setSource(found)
      // A job list that failed matters only when nothing else said which survey.
      if (!found && floor === undefined) setJobsError(j.error)
    })
    return () => { cancelled = true }
  }, [map.map_id, map.updated_at, floorIndex])

  const robotId = source && source !== 'loading' ? source.robotId : null
  const robotName = robots.find((r) => r.robot_id === robotId)?.name ?? robotId ?? ''
  const running = state.phase.kind === 'sending' || state.phase.kind === 'running'

  // The robot's survey status reports the search while it runs.
  useEffect(() => {
    if (!running || !robotId) return
    return dataProvider.subscribeSurveyStatus(robotId, (status) => dispatch({ type: 'status', status }))
  }, [running, robotId])

  useEffect(() => {
    if (!running) { setOverdue(false); return }
    const timer = setTimeout(() => setOverdue(true), FOLLOW_LIMIT_MS)
    return () => clearTimeout(timer)
  }, [running])

  // Done: the editor reloads the list, once per search.
  useEffect(() => {
    const key: FindPhaseKey = `${state.startedAt}:${state.phase.kind}`
    if (state.phase.kind !== 'done' || reported.current === key) return
    reported.current = key
    onFound()
  }, [state, onFound])

  const block = findMovingBlock({ source, robots, dirty, busy: saving || running })
  const start = async () => {
    if (block || !source || source === 'loading') return
    const at = Date.now()
    dispatch({ type: 'start', surveyId: source.surveyId, at })
    const outcome = await findMoving(source.robotId!, {
      survey_id: source.surveyId, map_id: map.map_id, floor_index: floorIndex, sensitivity,
    })
    dispatch({ type: 'outcome', outcome, statusSource: true })
  }

  const note: React.CSSProperties = { margin: 0, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5, wordBreak: 'keep-all' }
  const phase = state.phase
  const blockText = !block || block.reason === 'busy' ? null
    : block.reason === 'loading' ? t('missions.maps.editor.findMoving.loading')
      : t(`missions.maps.editor.findMoving.blocked.${block.reason}`, { robot: 'robot' in block ? block.robot : robotName })
  const pct = phase.kind === 'running' && phase.progress !== null ? Math.round(phase.progress * 100) : null

  return (
    <section aria-label={t('missions.maps.editor.findMoving.title')} style={{
      display: 'grid', gap: space[2], padding: space[3], borderRadius: radius.lg, background: color.hover, flexShrink: 0,
    }}>
      <Button icon={ScanSearch} disabled={!!block} onClick={() => void start()} title={blockText ?? undefined}>
        {t('missions.maps.editor.findMoving.button')}
      </Button>
      <label style={{ display: 'grid', gap: 4, fontSize: font.size.sm, color: color.t2 }}>
        <span style={{ display: 'flex', justifyContent: 'space-between', gap: space[2] }}>
          <span>{t('missions.maps.editor.findMoving.sensitivity')}</span>
          <span style={{ color: color.t1, fontVariantNumeric: 'tabular-nums' }}>{sensitivity.toFixed(2)}</span>
        </span>
        <input
          type="range" min={0} max={1} step={0.05} value={sensitivity} disabled={running}
          aria-valuetext={sensitivity.toFixed(2)}
          onChange={(e) => setSensitivity(Number(e.target.value))}
          style={{ width: '100%', accentColor: color.accent }}
        />
        <span style={{ display: 'flex', justifyContent: 'space-between', gap: space[2], fontSize: font.size.xs, color: color.t3 }}>
          <span>{t('missions.maps.editor.findMoving.fewer')}</span>
          <span style={{ textAlign: 'right' }}>{t('missions.maps.editor.findMoving.more')}</span>
        </span>
      </label>

      {blockText && !running && <p style={note}>{blockText}</p>}
      {jobsError && <p role="alert" style={{ ...note, color: color.red }}>{t('missions.maps.editor.findMoving.jobsFailed', { error: jobsError })}</p>}

      {phase.kind !== 'idle' && (
        <div role="status" data-phase={phase.kind} style={{ display: 'grid', gap: space[1] }}>
          <p style={{ ...note, color: phase.kind === 'failed' ? color.red : color.t1 }}>
            {phase.kind === 'sending' ? t('missions.maps.editor.findMoving.sending', { robot: robotName })
              : phase.kind === 'running' ? (phase.stage ? t('missions.maps.editor.findMoving.stage', { robot: robotName, stage: phase.stage })
                : t('missions.maps.editor.findMoving.running', { robot: robotName }))
                : phase.kind === 'done' ? (phase.spots === null ? t('missions.maps.editor.findMoving.doneUnknown')
                  : t('missions.maps.editor.findMoving.done', { count: phase.spots }))
                  : phase.kind === 'failed' ? t('missions.maps.editor.findMoving.failed', { robot: robotName, error: phase.error })
                    : t('missions.maps.editor.findMoving.noAnswer', { robot: robotName })}
          </p>
          {pct !== null && (
            <div aria-hidden style={{ height: 4, borderRadius: radius.full, background: color.card, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: color.accent, transition: 'width 300ms' }} />
            </div>
          )}
          {(phase.kind === 'noAnswer' || (running && overdue)) && (
            <Button size="sm" icon={RotateCw} onClick={() => { dispatch({ type: 'reset' }); onFound() }}>
              {t('missions.maps.editor.findMoving.reload')}
            </Button>
          )}
        </div>
      )}
      <p style={{ ...note, fontSize: font.size.xs }}>{t('missions.maps.editor.findMoving.hint')}</p>
    </section>
  )
}

type FindPhaseKey = `${number}:${string}`
