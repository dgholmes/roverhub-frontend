import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { useRobotAvailability } from '@/components/missions/RobotPicker'
import { useRobotRun } from '@/liveops/useRobotRun'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { OPERATOR_ID } from '@/lib/realtime/operator'
import type { MissionLibraryEntry, RobotState, RunEvent, ValidationIssue } from '@/types'
import { checkProgram } from './check'
import { compileProgram } from './compile'
import { dryRun, type DryRunResult } from './dryRun'
import { adoptRun, mergeRunEvents, runToAdopt, startTestRun, testRunModel, type TestRunState } from './edgeTestRun'
import { programRunMissionErrors, runBlockers, type RunBlocker } from './runBlockers'
import { addLogEntry, logLinesFromEvents, type RunLogLine } from './runLog'
import type { ProgramBlock } from './types'

/** What the Program tab's canvas offers the test run (BlocklyEditor's ref). */
export interface ProgramEditorHandle {
  /** Null while the canvas has no workspace yet; callers then use the saved program. */
  programBlocks(): ProgramBlock[] | null
  detachedCount(): number
  highlight(blockId: string | null): void
}

/**
 * The Program tab's test run (spec 5.4). Run compiles the editor's current
 * program, saved or not, makes its speech clips and starts it through the
 * backend; the robot's edge executor runs it. Everything shown after that --
 * running, paused, ended, the highlighted block, the log -- comes from the
 * robot's /state and run events, so the editor shows what the robot does, not
 * what the browser hoped. Stop sends Stop mission; taking control is LiveOps'.
 * The dry run is the browser's own walk of the program, as before.
 *
 * `blocks` is the canvas as last edited; the program is recompiled when it,
 * the robot's type or the language changes (labels are made at compile time).
 */
export function useEdgeTestRun({ mission, robots, robotId, blocks, missionIssues, editorRef }: {
  mission: MissionLibraryEntry
  robots: RobotState[]
  robotId: string | undefined
  blocks: ProgramBlock[]
  missionIssues: ValidationIssue[]
  editorRef: RefObject<ProgramEditorHandle | null>
}) {
  const { t, i18n } = useTranslation()
  const lng = i18n.language
  const robot = robots.find((r) => r.robot_id === robotId)
  const robotType = robot?.robot_type ?? null
  const availability = useRobotAvailability(robots)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const steps = useMemo(() => compileProgram(blocks, robotType), [blocks, robotType, lng])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const programIssues = useMemo(() => checkProgram(steps, robotType), [steps, robotType, lng])
  const missionErrors = useMemo(() => programRunMissionErrors(missionIssues), [missionIssues])

  const [starting, setStarting] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [stopping, setStopping] = useState(false)
  const [events, setEvents] = useState<RunEvent[]>([])
  const [seenOnRobot, setSeenOnRobot] = useState(false)
  const [shows, setShows] = useState<'dry' | 'run' | null>(null)
  const [dry, setDry] = useState<DryRunResult | null>(null)
  const [dryLines, setDryLines] = useState<RunLogLine[]>([])
  // The robot the run is on: switching the picker while one goes is blocked, but be sure.
  const [runRobot, setRunRobot] = useState<string | null>(null)
  const { view } = useRobotRun(runRobot ?? robotId ?? null)
  // The robot whose run is being looked up to re-attach to (see below).
  const [adoptingOn, setAdoptingOn] = useState<string | null>(null)

  // Collect the robot's run events from the moment Run is pressed (the edge can
  // publish run_started before the POST answers), and while a run is looked up
  // to re-attach to, so nothing between its stored events and the live ones is
  // lost. Filtered by run id when shown.
  const listening = starting || runId !== null || adoptingOn !== null
  const listenTo = runRobot ?? adoptingOn
  useEffect(() => {
    if (!listening || !listenTo) return
    return dataProvider.subscribeRunEvents(listenTo, (e) => setEvents((list) => [...list, e]))
  }, [listening, listenTo])

  useEffect(() => {
    if (runId && view?.runId === runId) setSeenOnRobot(true)
  }, [runId, view?.runId])

  const model = testRunModel({ starting, runId, refusal, events, view, seenOnRobot })
  const state: TestRunState = model.state
  const active = state === 'starting' || state === 'running' || state === 'paused'

  // Re-attach on opening the editor while the robot runs this mission (the
  // operator went to LiveOps to take control, and came back): adopt the run,
  // so Paused/Running, the highlight and Stop return, and seed the log from
  // the run's stored events. Each run is looked up once. Live events are
  // already being collected (adoptingOn) while the lookup runs, and the two
  // are merged by seq. Everything is set together once both answers are in:
  // setting runId changes `candidate`, which ends this effect.
  const lookedUp = useRef(new Set<string>())
  const candidate = runToAdopt({ runId, starting, view })
  const missionId = mission.mission_id
  useEffect(() => {
    if (!candidate || !robotId || lookedUp.current.has(candidate)) return
    lookedUp.current.add(candidate)
    let live = true
    setAdoptingOn(robotId)
    void adoptRun({ getRun: (id) => dataProvider.getRun(id), getRunEvents: (id) => dataProvider.getRunEvents(id) }, candidate, missionId)
      .then((adopted) => {
        if (!live) return
        if (adopted) {
          setRunRobot(robotId)
          setRunId(adopted.runId)
          setSeenOnRobot(true)
          setRefusal(null)
          setStopping(false)
          setShows('run')
          setEvents((list) => mergeRunEvents(adopted.events, list))
        }
        setAdoptingOn(null)
      })
    return () => {
      live = false
      setAdoptingOn(null)
    }
  }, [candidate, robotId, missionId])

  // Picking another robot (only possible once a run is over) forgets the last
  // run and refusal, which were about the old one.
  useEffect(() => {
    if (active || !runRobot || runRobot === robotId) return
    setRunRobot(null)
    setRunId(null)
    setRefusal(null)
    setEvents([])
    setShows((s) => (s === 'run' ? null : s))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [robotId])

  // The block being executed, from the robot's own report. `blocks` changes
  // when the canvas (re)opens and reports its program, e.g. after a tab
  // switch, so a fresh canvas is highlighted too.
  useEffect(() => {
    editorRef.current?.highlight(model.blockId)
  }, [editorRef, model.blockId, blocks])
  useEffect(() => () => editorRef.current?.highlight(null), [editorRef])

  const runLines = useMemo(
    () => (runId ? logLinesFromEvents(events.filter((e) => e.run_id === runId), t) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [events, runId, t, lng],
  )
  const lines = shows === 'dry' ? dryLines : runLines

  const blockers: RunBlocker[] = runBlockers({
    robotId,
    availability: robotId ? availability.get(robotId) : undefined,
    controlOwner: robot?.control_owner ?? null,
    youHoldControl: robot?.control_owner === OPERATOR_ID,
    programErrors: programIssues.filter((i) => i.severity === 'error').length,
    missionErrors: missionErrors.length,
    running: active,
  })

  /** The canvas as it is now, saved or not. */
  const editorBlocks = useCallback(() => editorRef.current?.programBlocks() ?? blocks, [editorRef, blocks])

  const startDryRun = useCallback(() => {
    if (active) return
    const live = robotId ? useLiveOpsStore.getState().robots.find((r) => r.robot_id === robotId) : undefined
    const result = dryRun(compileProgram(editorBlocks(), robotType), live)
    setDry(result)
    setDryLines(result.log.reduce<RunLogLine[]>((acc, e, i) => addLogEntry(acc, e, i), []))
    setShows('dry')
  }, [active, robotId, editorBlocks, robotType])

  const start = useCallback(async () => {
    if (active || !robotId || blockers.length > 0) return
    setStarting(true)
    setRunId(null)
    setRefusal(null)
    setStopping(false)
    setEvents([])
    setSeenOnRobot(false)
    setDry(null)
    setRunRobot(robotId)
    setShows('run')
    const out = await startTestRun(
      { startRun: (id, req) => dataProvider.startRun(id, req), makeClip: (id, text) => useLiveOpsStore.getState().createSpokenClip(id, text) },
      { mission, robotId, robotType, editorBlocks: editorBlocks() },
    )
    if (out.ok) setRunId(out.runId)
    else setRefusal(out.reason)
    setStarting(false)
  }, [active, robotId, blockers.length, mission, robotType, editorBlocks])

  const stop = useCallback(() => {
    if (!runId || !runRobot || stopping || (state !== 'running' && state !== 'paused')) return
    setStopping(true)
    // A Stop the robot did not take leaves Stop clickable again; the run's own end clears it otherwise.
    void useLiveOpsStore.getState()
      .dispatchCommandAsync(runRobot, 'STOP_MISSION', t('missions.program.run.stopCommand'), { run_id: runId })
      .then((out) => { if (out.result !== 'completed') setStopping(false) }, () => setStopping(false))
  }, [runId, runRobot, stopping, state, t])

  return {
    state, runId, refusal: model.refusal, lines, dry, shows, blockers,
    stopping: stopping && (state === 'running' || state === 'paused'),
    stepLabel: model.stepLabel, ended: model.ended,
    steps, programIssues, missionErrors, robot,
    startDryRun, start, stop,
  }
}

export type EdgeTestRun = ReturnType<typeof useEdgeTestRun>
