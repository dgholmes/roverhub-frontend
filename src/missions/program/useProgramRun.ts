import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useTranslation } from 'react-i18next'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { OPERATOR_ID } from '@/lib/realtime/realDataProvider'
import { useRobotAvailability } from '@/components/missions/RobotPicker'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import type { MissionLibraryEntry, RobotState, ValidationIssue } from '@/types'
import { checkProgram } from './check'
import { compileProgram } from './compile'
import { dryRun, type DryRunResult } from './dryRun'
import { runProgram, type RunLogEntry, type RunnerEffects, type RunOutcome } from './run'
import { programRunMissionErrors, runBlockers, type RunBlocker } from './runBlockers'
import { addLogEntry, type LogLine } from './runLog'
import { recordSink, startRunRecord } from './runRecord'
import type { CommandStep, ProgramBlock } from './types'

/** What the Program tab's canvas offers the runner (BlocklyEditor's ref). */
export interface ProgramEditorHandle {
  programBlocks(): ProgramBlock[]
  detachedCount(): number
  highlight(blockId: string | null): void
}

/** Stop ignores clicks this soon after Run, which a double-click on Run would make. */
export const STOP_GRACE_MS = 400

export type RunState = 'idle' | 'running' | 'stopping'

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
  const { i18n } = useTranslation()
  const lng = i18n.language
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)
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
  // Stop takes Run's place in the bar, so a double-click on Run would land on
  // Stop; clicks this soon after starting are ignored.
  const startedAtRef = useRef(0)

  // Leaving the editor (or the page) stops the program after the current block.
  useEffect(() => () => abortRef.current?.abort(), [])
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

  const takeControl = useCallback((label: string) => {
    if (robotId) dispatchCommand(robotId, 'TAKE_CONTROL', label, { operator: OPERATOR_ID })
  }, [robotId, dispatchCommand])

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
    // Snapshot ids by block, from SNAPSHOT outcomes, for the step's `done` entry.
    const snapshots = new Map<string, string>()
    const fx: RunnerEffects = {
      async send(step: CommandStep) {
        sent++
        setProgress({ sent, total: Math.max(total, sent), label: step.label })
        if (!step.speech) {
          const out = await store.dispatchCommandAsync(robotId, step.type, step.label, step.params)
          const snapshotId = out.command.result?.snapshot_id
          if (step.type === 'SNAPSHOT' && typeof snapshotId === 'string') snapshots.set(step.blockId, snapshotId)
          return out.result
        }
        let clip: { clip_id: string }
        try {
          clip = await store.createSpokenClip(robotId, step.speech.text)
        } catch {
          return 'failed'
        }
        const params = { clip_id: clip.clip_id, volume: step.params.volume ?? 100 }
        const playing = store.dispatchCommandAsync(robotId, 'SPEAK', step.label, params)
        // "Once" carries on as soon as the clip is sent; "until done" waits for playback to end.
        return step.speech.untilDone ? (await playing).result : 'completed'
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
    setOutcome(result)
    setState('idle')
    setProgress(null)
    void record.end(result, Date.now())
  }, [robotId, robot, blockers.length, freshSteps, mission, editorRef])

  const stop = useCallback(() => {
    if (!abortRef.current || Date.now() - startedAtRef.current < STOP_GRACE_MS) return
    abortRef.current.abort()
    setState('stopping')
  }, [])

  return {
    state, lines, shows, outcome, dry, runId, recordFailed, progress, blockers,
    steps, programIssues, missionErrors, robot,
    startDryRun, start, stop, takeControl,
  }
}

export type ProgramRun = ReturnType<typeof useProgramRun>
