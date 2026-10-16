import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { OPERATOR_ID } from '@/lib/realtime/realDataProvider'
import { useRobotAvailability } from '@/components/missions/RobotPicker'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import type { Command, MissionLibraryEntry, RobotState, ValidationIssue } from '@/types'
import { checkProgram } from './check'
import { compileProgram } from './compile'
import { dryRun, type DryRunResult } from './dryRun'
import { runProgram, type RunLogEntry, type RunnerEffects, type RunOutcome } from './run'
import { programRunMissionErrors, runBlockers, type RunBlocker } from './runBlockers'
import { addLogEntry, type LogLine } from './runLog'
import { recordSink, startRunRecord } from './runRecord'
import { speechSteps } from './speech'
import type { CommandStep, ProgramBlock } from './types'

/** What the Program tab's canvas offers the runner (BlocklyEditor's ref). */
export interface ProgramEditorHandle {
  programBlocks(): ProgramBlock[]
  detachedCount(): number
  highlight(blockId: string | null): void
}

/** Stop takes Run's place in the bar, so a double-click on Run lands its
 * second click on Stop. For this long after Run, a Stop that is the second
 * click of a double-click is ignored, and any other Stop waits out the rest
 * of the grace and then stops the run. */
export const STOP_GRACE_MS = 400

/** What a Stop click does `sinceStartMs` after Run; `clickCount` is the
 * click's `detail` (2 for the second click of a double-click, 0 from the keyboard). */
export function stopDecision(sinceStartMs: number, clickCount: number): 'now' | 'defer' | 'ignore' {
  if (sinceStartMs >= STOP_GRACE_MS) return 'now'
  return clickCount >= 2 ? 'ignore' : 'defer'
}

export type RunState = 'idle' | 'running' | 'stopping'

/** A TAKE_CONTROL in one of these stages is no longer in flight. */
const TAKE_DONE_STAGES = new Set<Command['current_stage']>(['execution_completed', 'execution_failed', 'timed_out', 'cancelled'])

const live = (robotId: string): RobotState | undefined =>
  useLiveOpsStore.getState().robots.find((r) => r.robot_id === robotId)

/** The console's operator holds control of this robot. */
export const holdsControl = (r: RobotState | undefined): boolean => r?.control_owner === OPERATOR_ID

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('aborted', 'AbortError'))
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(t)
      reject(new DOMException('aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })

/**
 * Runs the Program tab's program on a real robot, one block at a time, from
 * the browser: wires runProgram to the console's command dispatch, the live
 * robot state, the canvas highlight and the run record. Also the dry run and
 * the reasons Run is disabled.
 *
 * `blocks` is the canvas as last edited; the program is recompiled when it,
 * the robot's type or the language changes (labels are made at compile time).
 * Run itself reads the canvas afresh through `editorRef`.
 */
export function useProgramRun({ mission, robots, robotId, blocks, missionIssues, editorRef }: {
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

  const [state, setState] = useState<RunState>('idle')
  const [lines, setLines] = useState<LogLine[]>([])
  const [shows, setShows] = useState<'dry' | 'run' | null>(null)
  const [outcome, setOutcome] = useState<RunOutcome>()
  const [dry, setDry] = useState<DryRunResult>()
  const [runId, setRunId] = useState<string>()
  const [recordFailed, setRecordFailed] = useState(false)
  const [progress, setProgress] = useState<{ sent: number; total: number; label: string } | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  // When the run started, for Stop's grace (see STOP_GRACE_MS), and a Stop
  // waiting for the grace to end.
  const startedAtRef = useRef(0)
  const deferredStopRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clearDeferredStop = () => {
    if (deferredStopRef.current) clearTimeout(deferredStopRef.current)
    deferredStopRef.current = null
  }

  // Take control from the run bar: Run stays disabled until the bridge has
  // stood the robot up and acked, not merely until ownership reads as ours.
  const [takingHere, setTakingHere] = useState(false)
  const [takeFailure, setTakeFailure] = useState<string | null>(null)
  // A TAKE_CONTROL sent from anywhere else (LiveOps) blocks Run the same way.
  const takingElsewhere = useLiveOpsStore((s) => s.activeCommands.some((c) =>
    c.type === 'TAKE_CONTROL' && c.robot_id === robotId && !TAKE_DONE_STAGES.has(c.current_stage)))
  const takingControl = takingHere || takingElsewhere
  useEffect(() => setTakeFailure(null), [robotId])

  // Leaving the editor (or the page) stops the program after the current block, with no grace.
  useEffect(() => () => {
    clearDeferredStop()
    abortRef.current?.abort()
  }, [])
  useEffect(() => {
    if (state === 'idle') return
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [state])

  const blockers: RunBlocker[] = runBlockers({
    robotId,
    availability: robotId ? availability.get(robotId) : undefined,
    ownsControl: holdsControl(robot),
    programErrors: programIssues.filter((i) => i.severity === 'error').length,
    missionErrors: missionErrors.length,
    running: state !== 'idle',
    takingControl,
  })

  /** The canvas as it is now, compiled for the chosen robot. */
  const freshSteps = useCallback(() => {
    const now = editorRef.current?.programBlocks() ?? blocks
    return compileProgram(now, robotType)
  }, [editorRef, blocks, robotType])

  const startDryRun = useCallback(() => {
    if (state !== 'idle') return
    const result = dryRun(freshSteps(), robotId ? live(robotId) : undefined)
    setDry(result)
    setOutcome(undefined)
    setRunId(undefined)
    setLines(result.log.reduce<LogLine[]>((acc, e, i) => addLogEntry(acc, e, i), []))
    setShows('dry')
  }, [state, freshSteps, robotId])

  const takeControl = useCallback(async (label: string) => {
    if (!robotId || takingHere) return
    setTakingHere(true)
    setTakeFailure(null)
    const out = await useLiveOpsStore.getState().dispatchCommandAsync(robotId, 'TAKE_CONTROL', label, { operator: OPERATOR_ID })
    setTakingHere(false)
    if (out.result !== 'completed') {
      setTakeFailure(out.command.failure_reason || t('missions.program.run.takeControlNoAnswer'))
    }
  }, [robotId, takingHere, t])

  const start = useCallback(async () => {
    if (abortRef.current || !robotId || !robot || blockers.length > 0) return
    const runSteps = freshSteps()
    const total = dryRun(runSteps, live(robotId)).commands
    const ctrl = new AbortController()
    abortRef.current = ctrl
    startedAtRef.current = Date.now()
    let key = 0
    setState('running')
    setShows('run')
    setLines([])
    setOutcome(undefined)
    setDry(undefined)
    setRecordFailed(false)
    setProgress({ sent: 0, total, label: '' })

    const rec = startRunRecord(mission, robot, OPERATOR_ID, Date.now())
    setRunId(rec.run.run_id)
    const record = recordSink(rec, dataProvider, () => {
      setRecordFailed(true)
      setLines((l) => [...l, { key: key++, at: Date.now(), blockId: null, label: '', result: 'warning' }])
    })

    const store = useLiveOpsStore.getState()
    let sent = 0
    let ended = false
    // Snapshot ids by block, from SNAPSHOT outcomes, for the step's `done` entry.
    const snapshots = new Map<string, string>()
    // A "once" clip that then fails to play is noted in the log rather than going unseen.
    const speech = speechSteps(store, robotId, (step, result) => {
      const at = Date.now()
      setLines((l) => [...l, { key: key++, at, blockId: null, label: t('missions.program.run.log.speechFailed', { label: step.label }), result: 'warning' }])
      if (!ended) record.event({ at, blockId: step.blockId, label: step.label, result, detail: 'playback did not complete' })
    })
    const fx: RunnerEffects = {
      prepare: speech.prepare,
      async send(step: CommandStep) {
        sent++
        setProgress({ sent, total: Math.max(total, sent), label: step.label })
        if (step.speech) return speech.send(step)
        const out = await store.dispatchCommandAsync(robotId, step.type, step.label, step.params)
        const snapshotId = out.command.result?.snapshot_id
        if (step.type === 'SNAPSHOT' && typeof snapshotId === 'string') snapshots.set(step.blockId, snapshotId)
        return out.result
      },
      robot: () => live(robotId),
      ownsControl: () => holdsControl(live(robotId)),
      now: () => Date.now(),
      sleep,
      log(raw: RunLogEntry) {
        const snapshotId = raw.result === 'done' ? snapshots.get(raw.blockId) : undefined
        if (snapshotId) snapshots.delete(raw.blockId)
        const entry = snapshotId ? { ...raw, snapshotId } : raw
        record.event(entry)
        setLines((l) => addLogEntry(l, entry, key++))
      },
      highlight: (id) => editorRef.current?.highlight(id),
    }

    let result: RunOutcome
    try {
      result = await runProgram(runSteps, fx, ctrl.signal)
    } catch {
      // The runner itself never throws by design; this keeps the bar honest if it does.
      result = { result: 'failed', reason: 'noAnswer', commandsSent: sent }
    }
    abortRef.current = null
    clearDeferredStop()
    setOutcome(result)
    setState('idle')
    setProgress(null)
    ended = true
    void record.end(result, Date.now())
  }, [robotId, robot, blockers.length, freshSteps, mission, editorRef, t])

  /** The run bar's Stop. `clickCount` is the click event's `detail`. */
  const stop = useCallback((clickCount = 1) => {
    const ctrl = abortRef.current
    if (!ctrl || ctrl.signal.aborted || deferredStopRef.current) return
    const since = Date.now() - startedAtRef.current
    const decision = stopDecision(since, clickCount)
    if (decision === 'ignore') return
    setState('stopping')
    if (decision === 'now') ctrl.abort()
    else deferredStopRef.current = setTimeout(() => ctrl.abort(), STOP_GRACE_MS - since)
  }, [])

  /** Stops at once, with no grace: leaving the editor while a run is going. */
  const abortNow = useCallback(() => {
    clearDeferredStop()
    if (!abortRef.current) return
    abortRef.current.abort()
    setState('stopping')
  }, [])

  return {
    state, lines, shows, outcome, dry, runId, recordFailed, progress, blockers,
    steps, programIssues, missionErrors, robot, takingControl, takeFailure,
    startDryRun, start, stop, abortNow, takeControl,
  }
}

export type ProgramRun = ReturnType<typeof useProgramRun>
