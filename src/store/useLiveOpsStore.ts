import { robotsForSite } from '@/org/siteRobots'
import { create } from 'zustand'
import type { RobotState, Mission, TimelineEvent, Command, CommandType } from '@/types'
import { dataProvider, USE_REAL_BACKEND } from '@/lib/realtime/dataProvider'
import { LOCAL_FAILURE_PREFIX } from '@/lib/realtime/realDataProvider'
import { mockDataProvider } from '@/mocks/mockDataProvider'
import { initialMissions } from '@/mocks/mockMissions'
import { seedEvents } from '@/mocks/mockEvents'
import { retainCommands } from '@/liveops/commandToasts'
import { getCommandAvailability } from '@/liveops/commandPolicy'
import { gestureSpec, type ActiveGesture } from '@/liveops/gestures'
import { telemetryFreshness } from '@/lib/realtime/linkHealth'
import type { LinkPhase, TelemetryFreshness } from '@/lib/realtime/linkHealth'
import { useSessionStore } from './useSessionStore'
import { reconcileStartingRuns, type StartingRuns } from '@/liveops/startingRuns'
import type { StartRunRequest } from '@/lib/realtime/runStart'
import type { Step } from '@/missions/program/types'
import type { MissionRun, TaskOccurrence } from '@/types'

export type CommandOutcome = {
  result: 'completed' | 'failed' | 'cancelled' | 'unknown'
  command: Command
}

const TERMINAL_RESULT: Partial<Record<Command['current_stage'], CommandOutcome['result']>> = {
  execution_completed: 'completed',
  execution_failed: 'failed',
  cancelled: 'cancelled',
  timed_out: 'unknown',
}

interface LiveOpsState {
  robots: RobotState[]
  missions: Record<string, Mission>
  events: TimelineEvent[]
  activeCommands: Command[]
  /** Transport state and whether frames are still arriving over it. Read
   * together via `linkBanner` — see `@/lib/realtime/linkHealth`. */
  linkPhase: LinkPhase
  telemetryFreshness: TelemetryFreshness
  _unsubscribeTelemetry: (() => void) | null
  _unsubscribeEvents: (() => void) | null
  _teardownLink: (() => void) | null
  init: () => void
  teardown: () => void
  dispatchCommand: (
    robotId: string,
    type: CommandType,
    label: string,
    params?: Record<string, unknown>,
    opts?: {
      /** Forces this dispatch through mockDataProvider's simulated ack
       * lifecycle even when the real backend is active and this command
       * type is otherwise wired for real -- for command *shapes* that have
       * no real backing yet (e.g. SPEAK's "Shout" mode, which has no
       * streaming/mic-capture pipeline to send to), so it doesn't fail every
       * time against the real edge bridge. */
      forceMock?: boolean
    },
  ) => void
  /** Shared body of dispatchCommand / dispatchCommandAsync; `observe` sees every
   * stage update before it is recorded. */
  _dispatch: (
    robotId: string,
    type: CommandType,
    label: string,
    params?: Record<string, unknown>,
    /** `keepGesture`: this command is the gesture card's own start or stop,
     * so it must not end the card the way any other motion command does. */
    opts?: { forceMock?: boolean; keepGesture?: boolean },
    observe?: (command: Command) => void,
  ) => void
  /** The gesture each robot is performing, as far as the console knows: one it
   * started from the gesture menu that has not yet ended. Drives the LiveOps
   * gesture card (time left, Stop). */
  activeGestures: Record<string, ActiveGesture>
  /** Sends a gesture from the menu and, if it is one the card tracks
   * (see liveops/gestures.ts), starts tracking it. */
  startGesture: (robotId: string, gestureId: string, label: string) => void
  /** Ends the robot's running gesture the way Dobot's app does -- for wave,
   * sending it again -- and drops the card once the robot has acked. */
  stopGesture: (robotId: string) => void
  /** The robot has reported being in the gesture's state. */
  markGestureSeen: (robotId: string) => void
  clearGesture: (robotId: string) => void
  /** Same dispatch, resolving once on the first terminal stage. Never rejects:
   * a command that is lost, or whose POST failed in the browser, resolves as
   * `'unknown'`. */
  dispatchCommandAsync: (
    robotId: string,
    type: CommandType,
    label: string,
    params?: Record<string, unknown>,
  ) => Promise<CommandOutcome>
  dismissCommand: (commandId: string) => void
  acknowledgeEvent: (eventId: string) => void
  /** Teleoperation velocity burst — bypasses dispatchCommand's staged-ack
   * pipeline entirely (see dataProvider.driveRobot). vx/vy in body-frame
   * m/s, vyaw in rad/s. speedRatio is the SDK's 10-100 speed_ratio for this
   * burst (see RealDataProvider.driveRobot); omitted falls back to
   * DRIVE_SPEED_RATIO. Returns false when the DRIVE policy refused the move
   * and nothing was sent; a stop is never refused. */
  driveRobot: (robotId: string, vx: number, vy: number, vyaw: number, speedRatio?: number) => boolean
  /** Uploads a real audio file for SPEAK's Play tab -- delegates to
   * dataProvider so mock mode still "succeeds" with a fabricated path
   * (see mockDataProvider.uploadAudioClip) rather than requiring a real
   * backend just to exercise the UI. */
  /** Where to GET a captured snapshot. Only the provider knows the API base
   * URL the browser should use -- the bridge sends only the id, because its
   * own CLOUD_API_URL need not be reachable under that name from here. */
  snapshotUrl: (snapshotId: string) => string
  /** Turns the clip playing on `robotId` up or down (0-100) while it plays.
   * Debounced, sent without a toast, and a no-op when nothing is playing. */
  setSpeakVolume: (robotId: string, volume: number) => void
  uploadAudioClip: (robotId: string, file: File | Blob) => Promise<{ clip_id: string; file_path: string }>
  /** Synthesises spoken text and stores it as a clip, so an announcement typed
   * into the UI becomes an ordinary clip -- same store, same edge cache, same
   * volume, same streaming path as an uploaded file. */
  createSpokenClip: (robotId: string, text: string) => Promise<{ clip_id: string }>
  /** Runs this console started and the robot has not shown yet; LiveOps says
   * "Starting the mission…" for them. See liveops/startingRuns.ts. */
  startingRuns: StartingRuns
  /** Starts a mission on the robot (POST /robots/{id}/runs). START_MISSION is
   * tracked like any dispatched command: its acks reach the toasts and
   * `observe`, and a refusal from the edge reaches the Logs. Throws as
   * dataProvider.startRun does. */
  startRun: (robotId: string, req: StartRunRequest, observe?: (command: Command) => void) => Promise<{ run: MissionRun }>
  /** Run now for a task (POST /tasks/{id}/run-now), tracked the same way. */
  runTaskNow: (taskId: string, steps: Step[], observe?: (command: Command) => void) => Promise<{ occurrence: TaskOccurrence; run: MissionRun }>
  /** Shared by startRun and runTaskNow: the toast, the observer, and dropping
   * the starting hint once the start has failed. */
  _onStartCommand: (command: Command, observe?: (command: Command) => void) => void
  _markStarting: (run: MissionRun) => void
}

/** A START_MISSION outcome after which the run will not appear. */
const START_FAILED = new Set<Command['current_stage']>(['execution_failed', 'cancelled'])

/** Commands that take the robot out of whatever gesture it is doing, so the
 * gesture card must go. */
const GESTURE_ENDING_TYPES = new Set<CommandType>([
  'SET_STATE', 'SET_GAIT', 'CHANGE_MODE', 'ESTOP', 'TAKE_CONTROL', 'RELEASE_CONTROL',
  'LINE_WALK', 'ROTATE', 'CIRCLE', 'VELOCITY_SEQUENCE',
  'BALANCE_AXIS', 'BALANCE_NEUTRAL', 'BALANCE_SEQUENCE', 'DYNAMIC_POSE', 'STATIC_POSE',
])

const SPEAK_DONE_STAGES = new Set<Command['current_stage']>(['execution_completed', 'execution_failed', 'timed_out', 'cancelled'])
export const SPEAK_VOLUME_DEBOUNCE_MS = 150
const speakVolumeTimers = new Map<string, ReturnType<typeof setTimeout>>()

export const useLiveOpsStore = create<LiveOpsState>((set, get) => ({
  robots: dataProvider.getRobots(),
  // Seeded sample data is for the mock build only. In real mode these used to
  // load anyway, so a live console opened onto six fabricated events —
  // including an unacknowledged "Obstacle detected — speed reduced to 0.8 m/s"
  // that drove the Alert Center badge — and mission cards for missions that do
  // not exist. Nothing distinguished them from real ones.
  // docs/audit/2026-08-12-ui-ux-audit.md A-15.
  missions: USE_REAL_BACKEND ? {} : initialMissions,
  events: USE_REAL_BACKEND ? [] : seedEvents(),
  activeCommands: [],
  // Starts pessimistic: until the transport says otherwise, the console has not
  // established that anything it shows is current.
  linkPhase: 'connecting',
  telemetryFreshness: 'lost',
  _unsubscribeTelemetry: null,
  _unsubscribeEvents: null,
  _teardownLink: null,

  init: () => {
    if (get()._unsubscribeTelemetry) return
    const unsubscribeLink = dataProvider.subscribeLinkPhase((linkPhase) => set({ linkPhase }))
    // Polled, not pushed. The failure being watched for is *silence*, which by
    // definition emits no event — so the only way to notice it is to keep
    // asking. Previously nothing asked, and a dead socket left every value on
    // screen frozen while still labelled live.
    const watchdog = setInterval(() => {
      const freshness = telemetryFreshness(dataProvider.telemetryAgeMs())
      if (freshness !== get().telemetryFreshness) set({ telemetryFreshness: freshness })
    }, 1000)
    const unsubscribeTelemetry = dataProvider.subscribeTelemetry((robots) => {
      const startingRuns = reconcileStartingRuns(get().startingRuns, robots, Date.now())
      set(startingRuns === get().startingRuns ? { robots: [...robots] } : { robots: [...robots], startingRuns })
      // Single place where robots enter the UI, so also the single place the
      // selection is kept honest -- robots are now discovered at runtime rather
      // than configured, so nothing else knows a valid id up front.
      // reconcileSelectedRobot no-ops once the selection is valid, which matters
      // because this runs on every telemetry frame.
      // Only this site's robots count: a selection must never point at a robot
      // another site's workspace owns.
      const siteId = useSessionStore.getState().activeSiteId
      useSessionStore.getState().reconcileSelectedRobot(robotsForSite(robots, siteId).map((r) => r.robot_id))
    })
    const unsubscribeEvents = dataProvider.subscribeEvents((evt) =>
      set((s) => ({ events: [evt, ...s.events].slice(0, 100) }))
    )
    set({
      _unsubscribeTelemetry: unsubscribeTelemetry,
      _unsubscribeEvents: unsubscribeEvents,
      _teardownLink: () => { unsubscribeLink(); clearInterval(watchdog) },
    })
  },

  teardown: () => {
    get()._teardownLink?.()
    set({ _teardownLink: null })
    get()._unsubscribeTelemetry?.()
    get()._unsubscribeEvents?.()
    set({ _unsubscribeTelemetry: null, _unsubscribeEvents: null })
  },

  dispatchCommand: (robotId, type, label, params, opts) => {
    get()._dispatch(robotId, type, label, params, opts)
  },

  dispatchCommandAsync: (robotId, type, label, params) =>
    new Promise<CommandOutcome>((resolve) => {
      let settled = false
      get()._dispatch(robotId, type, label, params, undefined, (command) => {
        if (settled) return
        const terminal = TERMINAL_RESULT[command.current_stage]
        if (!terminal) return
        // A POST that timed out may still have reached the robot, so its
        // outcome is not known. A refused or unsent one stays 'failed'.
        const result = command.command_id.startsWith(LOCAL_FAILURE_PREFIX) ? 'unknown' : terminal
        settled = true
        resolve({ result, command })
      })
    }),

  _dispatch: (robotId, type, label, params, opts, observe) => {
    if (!opts?.keepGesture && GESTURE_ENDING_TYPES.has(type)) get().clearGesture(robotId)
    // Robot state changes triggered by a command (e.g. ESTOP -> E_STOP) are
    // applied inside mockDataProvider itself and arrive here via the
    // telemetry subscription in init() — mutating `robots` from this
    // callback too would race with the provider's next 1 Hz tick.
    const provider = opts?.forceMock ? mockDataProvider : dataProvider
    // `forceMock` against a real backend is simulated by definition; in mock
    // mode everything is simulated and the badge would be noise.
    const simulated = USE_REAL_BACKEND && opts?.forceMock === true
    provider.dispatchCommand(robotId, type, label, (raw) => {
      const command = simulated ? { ...raw, simulated: true } : raw
      observe?.(command)
      set((s) => {
        const idx = s.activeCommands.findIndex((c) => c.command_id === command.command_id)
        const next = [...s.activeCommands]
        if (idx >= 0) next[idx] = command
        else next.unshift(command)
        return { activeCommands: retainCommands(next) }
      })
    }, params)
  },

  activeGestures: {},

  startGesture: (robotId, gestureId, label) => {
    // Recorded before dispatching, so a failure that comes back at once still
    // finds the card to clear. Whatever gesture was running is replaced.
    const startedAt = Date.now()
    get().clearGesture(robotId)
    if (gestureSpec(gestureId)) {
      set((s) => ({
        activeGestures: { ...s.activeGestures, [robotId]: { robotId, id: gestureId, label, startedAt, seen: false, stopping: false } },
      }))
    }
    get()._dispatch(robotId, 'SET_STATE', label, { state: gestureId }, { keepGesture: true }, (command) => {
      const result = TERMINAL_RESULT[command.current_stage]
      // Refused or lost: the robot never started it, so there is nothing to show.
      if (result && result !== 'completed' && get().activeGestures[robotId]?.startedAt === startedAt) {
        get().clearGesture(robotId)
      }
    })
  },

  stopGesture: (robotId) => {
    const gesture = get().activeGestures[robotId]
    const stop = gesture ? gestureSpec(gesture.id)?.stop : null
    if (!gesture || !stop || gesture.stopping) return
    set((s) => ({ activeGestures: { ...s.activeGestures, [robotId]: { ...gesture, stopping: true } } }))
    get()._dispatch(robotId, 'SET_STATE', gesture.label, { state: stop }, { keepGesture: true }, (command) => {
      const result = TERMINAL_RESULT[command.current_stage]
      if (!result) return
      const current = get().activeGestures[robotId]
      if (current?.startedAt !== gesture.startedAt) return
      if (result === 'completed') get().clearGesture(robotId)
      // The stop did not land: the gesture is presumably still going, so the
      // card stays and Stop can be pressed again.
      else set((s) => ({ activeGestures: { ...s.activeGestures, [robotId]: { ...current, stopping: false } } }))
    })
  },

  markGestureSeen: (robotId) => {
    const gesture = get().activeGestures[robotId]
    if (!gesture || gesture.seen) return
    set((s) => ({ activeGestures: { ...s.activeGestures, [robotId]: { ...gesture, seen: true } } }))
  },

  clearGesture: (robotId) => {
    if (!get().activeGestures[robotId]) return
    set((s) => {
      const next = { ...s.activeGestures }
      delete next[robotId]
      return { activeGestures: next }
    })
  },

  startingRuns: {},

  startRun: async (robotId, req, observe) => {
    // A refusal can arrive before the POST answers (an early ack, replayed), and
    // then the start must not be marked at all.
    let failed = false
    const out = await dataProvider.startRun(robotId, req, (c) => {
      if (START_FAILED.has(c.current_stage)) failed = true
      get()._onStartCommand(c, observe)
    })
    if (!failed) get()._markStarting(out.run)
    return out
  },

  runTaskNow: async (taskId, steps, observe) => {
    let failed = false
    const out = await dataProvider.runTaskNow(taskId, steps, (c) => {
      if (START_FAILED.has(c.current_stage)) failed = true
      get()._onStartCommand(c, observe)
    })
    if (!failed) get()._markStarting(out.run)
    return out
  },

  _onStartCommand: (command, observe) => {
    observe?.(command)
    set((s) => {
      const idx = s.activeCommands.findIndex((c) => c.command_id === command.command_id)
      const next = [...s.activeCommands]
      if (idx >= 0) next[idx] = command
      else next.unshift(command)
      const runId = (command.params as { run_id?: unknown } | undefined)?.run_id
      const failed = START_FAILED.has(command.current_stage)
      if (!failed || !s.startingRuns[command.robot_id]) return { activeCommands: retainCommands(next) }
      const startingRuns = { ...s.startingRuns }
      if (runId === undefined || startingRuns[command.robot_id].runId === runId) delete startingRuns[command.robot_id]
      return { activeCommands: retainCommands(next), startingRuns }
    })
  },

  _markStarting: (run) => {
    const robot = get().robots.find((r) => r.robot_id === run.robot_id)
    if (robot?.active_run?.run_id === run.run_id) return
    set((s) => ({ startingRuns: { ...s.startingRuns, [run.robot_id]: { runId: run.run_id, at: Date.now() } } }))
  },

  dismissCommand: (commandId) => {
    set((s) => ({ activeCommands: s.activeCommands.filter((c) => c.command_id !== commandId) }))
  },

  driveRobot: (robotId, vx, vy, vyaw, speedRatio) => {
    // `commandPolicy` has always defined a DRIVE rule, and nothing consumed it:
    // teleop bursts went straight to the provider, so the robot could be driven
    // in E_STOP, in FAULT, with the SDK link down, or with the bridge offline —
    // exactly the states in which every *button* is greyed out. The stop burst
    // is deliberately exempt: refusing to send zero velocity because the robot
    // is in a bad state would strand it moving.
    // docs/audit/2026-08-12-ui-ux-audit.md A-08.
    const isStop = vx === 0 && vy === 0 && vyaw === 0
    if (!isStop) {
      const robot = get().robots.find((r) => r.robot_id === robotId)
      if (!robot || !getCommandAvailability(robot, 'DRIVE').enabled) return false
    }
    dataProvider.driveRobot(robotId, vx, vy, vyaw, speedRatio)
    return true
  },

  setSpeakVolume: (robotId, volume) => {
    // Only a clip that is playing has a volume to change; the next SPEAK
    // carries the session volume itself.
    const playing = get().activeCommands.some((c) =>
      c.robot_id === robotId && c.type === 'SPEAK' && !SPEAK_DONE_STAGES.has(c.current_stage))
    if (!playing) return
    // Trailing debounce: a drag fires dozens of change events, and only where
    // it comes to rest matters.
    const pending = speakVolumeTimers.get(robotId)
    if (pending) clearTimeout(pending)
    speakVolumeTimers.set(robotId, setTimeout(() => {
      speakVolumeTimers.delete(robotId)
      dataProvider.setSpeakVolume(robotId, volume)
    }, SPEAK_VOLUME_DEBOUNCE_MS))
  },

  snapshotUrl: (snapshotId) => dataProvider.snapshotUrl(snapshotId),
  uploadAudioClip: (robotId, file) => dataProvider.uploadAudioClip(robotId, file),

  createSpokenClip: async (robotId, text) => {
    const wav = await dataProvider.synthesizeSpeech(text)
    return dataProvider.uploadAudioClip(robotId, wav)
  },

  acknowledgeEvent: (eventId) => {
    // Clearing an alert in the UI acknowledges it — it does not resolve the
    // underlying condition (docs/05-ui-ux.md §16.2).
    set((s) => ({
      events: s.events.map((e) => (e.event_id === eventId ? { ...e, acknowledged: true } : e)),
    }))
  },
}))
