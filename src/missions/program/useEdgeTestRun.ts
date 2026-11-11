import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { useRobotAvailability } from '@/components/missions/RobotPicker'
import { useRobotRun } from '@/liveops/useRobotRun'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useOperatorId } from '@/lib/realtime/operator'
import type { MissionLibraryEntry, RobotState, RunEvent, ValidationIssue } from '@/types'
import { checkProgram } from './check'
import { compileProgram } from './compile'
import { dryRun, type DryRunResult } from './dryRun'
import { adoptRun, mergeRunEvents, polledRunEnd, runToAdopt, START_POLL_MS, startFailureClearsRun, startFailureOf, startTestRun, stopClearsLocally, testRunModel, type TestRunInput, type TestRunState } from './edgeTestRun'
import { runReasonText } from '@/components/missions/program/runText'
import { programRunMissionErrors, routeRunMissionErrors, runBlockers, type RunBlocker } from './runBlockers'
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
export function useEdgeTestRun({ mission, robots, robotId, blocks, missionIssues, editorRef, routeMapActive = false }: {
  mission: MissionLibraryEntry
  robots: RobotState[]
  robotId: string | undefined
  blocks: ProgramBlock[]
  missionIssues: ValidationIssue[]
  editorRef: RefObject<ProgramEditorHandle | null>
  /** A route only: its map is the site's active map, which a route run needs. */
  routeMapActive?: boolean
}) {
  const { t, i18n } = useTranslation()
  const lng = i18n.language
  const operatorId = useOperatorId()
  const robot = robots.find((r) => r.robot_id === robotId)
  const robotType = robot?.robot_type ?? null
  const availability = useRobotAvailability(robots)

  // A route test run (schema 0.0.16) posts no steps: the backend compiles the
  // route into walk-to-point legs when the run starts. There is no program to
  // compile, check or dry-run; the route's own checks decide instead.
  const isRoute = mission.kind === 'route'
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const steps = useMemo(() => (isRoute ? [] : compileProgram(blocks, robotType)), [isRoute, blocks, robotType, lng])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const programIssues = useMemo(() => (isRoute ? [] : checkProgram(steps, robotType)), [isRoute, steps, robotType, lng])
  const missionErrors = useMemo(
    () => (isRoute ? routeRunMissionErrors(missionIssues) : programRunMissionErrors(missionIssues)),
    [isRoute, missionIssues],
  )

  const [starting, setStarting] = useState(false)
  const [runId, setRunId] = useState<string | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [stopping, setStopping] = useState(false)
  const [events, setEvents] = useState<RunEvent[]>([])
  const [seenOnRobot, setSeenOnRobot] = useState(false)
  // The edge refused the start after the backend accepted it (START_MISSION's ack).
  const [startFailure, setStartFailure] = useState<string | null>(null)
  // The stored run had ended before the robot ever showed it (backend noAnswer).
  const [polledEnd, setPolledEnd] = useState<TestRunInput['polledEnd']>(null)
  // Which press of Run an ack belongs to: one from an earlier start is ignored.
  const startSeq = useRef(0)
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

  // While the robot has not shown the run, ask the backend how it is: a start no
  // bridge answered is failed there (noAnswer) and reaches us on no other path.
  useEffect(() => {
    if (!runId || seenOnRobot || polledEnd || startFailure) return
    let live = true
    const id = setInterval(() => {
      void dataProvider.getRun(runId).then((detail) => {
        const end = polledRunEnd(detail)
        if (live && end) setPolledEnd(end)
      }, () => {})
    }, START_POLL_MS)
    return () => { live = false; clearInterval(id) }
  }, [runId, seenOnRobot, polledEnd, startFailure])

  // A refused start frees the editor to re-attach to a run really on the robot:
  // drop the run id (the model keeps showing startFailure as the refusal).
  useEffect(() => {
    if (runId && startFailureClearsRun({ startFailure, seenOnRobot })) {
      setRunId(null)
      setPolledEnd(null)
    }
  }, [runId, startFailure, seenOnRobot])

  const model = testRunModel({ starting, runId, refusal, events, view, seenOnRobot, startFailure, polledEnd })
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
          setStartFailure(null)
          setPolledEnd(null)
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
    setStartFailure(null)
    setPolledEnd(null)
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
    youHoldControl: robot?.control_owner === operatorId,
    programErrors: programIssues.filter((i) => i.severity === 'error').length,
    missionErrors: missionErrors.length,
    running: active,
    batteryPct: robot ? robot.battery.percent : undefined,
    ...(isRoute ? { route: { mapActive: routeMapActive, wheel: robotType === 'wheel' } } : {}),
  })

  /** The canvas as it is now, saved or not. */
  const editorBlocks = useCallback(() => editorRef.current?.programBlocks() ?? blocks, [editorRef, blocks])

  const startDryRun = useCallback(() => {
    if (active || isRoute) return
    const live = robotId ? useLiveOpsStore.getState().robots.find((r) => r.robot_id === robotId) : undefined
    const result = dryRun(compileProgram(editorBlocks(), robotType), live)
    setDry(result)
    setDryLines(result.log.reduce<RunLogLine[]>((acc, e, i) => addLogEntry(acc, e, i), []))
    setShows('dry')
  }, [active, isRoute, robotId, editorBlocks, robotType])

  const start = useCallback(async () => {
    if (active || !robotId || blockers.length > 0) return
    setStarting(true)
    setRunId(null)
    setRefusal(null)
    setStartFailure(null)
    setPolledEnd(null)
    setStopping(false)
    setEvents([])
    setSeenOnRobot(false)
    const seq = ++startSeq.current
    // START_MISSION's acks: a refusal by the edge, after the backend said 201.
    const onCommand = (command: Parameters<typeof startFailureOf>[0]) => {
      const failure = startFailureOf(command)
      if (failure && seq === startSeq.current) {
        setStartFailure(failure)
        setStopping(false)
      }
    }
    setDry(null)
    setRunRobot(robotId)
    setShows('run')
    const out = await startTestRun(
      { startRun: (id, req) => useLiveOpsStore.getState().startRun(id, req, onCommand), makeClip: (id, text) => useLiveOpsStore.getState().createSpokenClip(id, text) },
      { mission, robotId, robotType, editorBlocks: editorBlocks() },
    )
    if (out.ok) setRunId(out.runId)
    else setRefusal(out.reason)
    setStarting(false)
  }, [active, robotId, blockers.length, mission, robotType, editorBlocks])

  const stop = useCallback(() => {
    if (!runId || !runRobot || stopping || (state !== 'running' && state !== 'paused')) return
    if (stopClearsLocally({ seenOnRobot })) {
      // The robot has never shown this run: there is nothing there to wait on,
      // and the edge would ack the stop as a no-op while the run stayed
      // "Stopping…" here. Sent anyway in case the run is just starting; if it
      // does start, the editor re-attaches to it from /state.
      void useLiveOpsStore.getState()
        .dispatchCommandAsync(runRobot, 'STOP_MISSION', t('missions.program.run.stopCommand'), { run_id: runId })
      setRunId(null)
      setStopping(false)
      return
    }
    setStopping(true)
    // A Stop the robot did not take leaves Stop clickable again; the run's own end clears it otherwise.
    void useLiveOpsStore.getState()
      .dispatchCommandAsync(runRobot, 'STOP_MISSION', t('missions.program.run.stopCommand'), { run_id: runId })
      .then((out) => { if (out.result !== 'completed') setStopping(false) }, () => setStopping(false))
  }, [runId, runRobot, stopping, state, seenOnRobot, t])

  return {
    state, runId, refusal: model.refusal ? runReasonText(t, model.refusal) : null, lines, dry, shows, blockers,
    /** A dry run walks a program; a route has none to walk. */
    canDryRun: !isRoute,
    /** The waypoint this run's robot is on (a route run), for the map to highlight. */
    activeWaypointId: runId && view?.runId === runId && active ? (view.waypointId ?? null) : null,
    stopping: stopping && (state === 'running' || state === 'paused'),
    stepLabel: model.stepLabel, ended: model.ended,
    steps, programIssues, missionErrors, robot,
    startDryRun, start, stop,
  }
}

export type EdgeTestRun = ReturnType<typeof useEdgeTestRun>
