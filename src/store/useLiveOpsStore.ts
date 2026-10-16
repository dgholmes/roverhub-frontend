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
import { telemetryFreshness } from '@/lib/realtime/linkHealth'
import type { LinkPhase, TelemetryFreshness } from '@/lib/realtime/linkHealth'
import { useSessionStore } from './useSessionStore'

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
    opts?: { forceMock?: boolean },
    observe?: (command: Command) => void,
  ) => void
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
   * DRIVE_SPEED_RATIO. */
  driveRobot: (robotId: string, vx: number, vy: number, vyaw: number, speedRatio?: number) => void
  /** Uploads a real audio file for SPEAK's Play tab -- delegates to
   * dataProvider so mock mode still "succeeds" with a fabricated path
   * (see mockDataProvider.uploadAudioClip) rather than requiring a real
   * backend just to exercise the UI. */
  /** Where to GET a captured snapshot. Only the provider knows the API base
   * URL the browser should use -- the bridge sends only the id, because its
   * own CLOUD_API_URL need not be reachable under that name from here. */
  snapshotUrl: (snapshotId: string) => string
  uploadAudioClip: (robotId: string, file: File | Blob) => Promise<{ clip_id: string; file_path: string }>
  /** Synthesises spoken text and stores it as a clip, so an announcement typed
   * into the UI becomes an ordinary clip -- same store, same edge cache, same
   * volume, same streaming path as an uploaded file. */
  createSpokenClip: (robotId: string, text: string) => Promise<{ clip_id: string }>
}

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
      set({ robots: [...robots] })
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
      if (!robot || !getCommandAvailability(robot, 'DRIVE').enabled) return
    }
    dataProvider.driveRobot(robotId, vx, vy, vyaw, speedRatio)
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
