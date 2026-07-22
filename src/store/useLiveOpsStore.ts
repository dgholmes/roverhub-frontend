import { create } from 'zustand'
import type { RobotState, Mission, TimelineEvent, Command, CommandType } from '@/types'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { mockDataProvider } from '@/mocks/mockDataProvider'
import { initialMissions } from '@/mocks/mockMissions'
import { seedEvents } from '@/mocks/mockEvents'

interface LiveOpsState {
  robots: RobotState[]
  missions: Record<string, Mission>
  events: TimelineEvent[]
  activeCommands: Command[]
  _unsubscribeTelemetry: (() => void) | null
  _unsubscribeEvents: (() => void) | null
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
  dismissCommand: (commandId: string) => void
  acknowledgeEvent: (eventId: string) => void
  /** Teleoperation velocity burst — bypasses dispatchCommand's staged-ack
   * pipeline entirely (see dataProvider.driveRobot). vx/vy in body-frame
   * m/s, vyaw in rad/s. */
  driveRobot: (robotId: string, vx: number, vy: number, vyaw: number) => void
  /** Uploads a real audio file for SPEAK's Play tab -- delegates to
   * dataProvider so mock mode still "succeeds" with a fabricated path
   * (see mockDataProvider.uploadAudioClip) rather than requiring a real
   * backend just to exercise the UI. */
  uploadAudioClip: (robotId: string, file: File) => Promise<{ file_path: string }>
}

export const useLiveOpsStore = create<LiveOpsState>((set, get) => ({
  robots: dataProvider.getRobots(),
  missions: initialMissions,
  events: seedEvents(),
  activeCommands: [],
  _unsubscribeTelemetry: null,
  _unsubscribeEvents: null,

  init: () => {
    if (get()._unsubscribeTelemetry) return
    const unsubscribeTelemetry = dataProvider.subscribeTelemetry((robots) => set({ robots: [...robots] }))
    const unsubscribeEvents = dataProvider.subscribeEvents((evt) =>
      set((s) => ({ events: [evt, ...s.events].slice(0, 100) }))
    )
    set({ _unsubscribeTelemetry: unsubscribeTelemetry, _unsubscribeEvents: unsubscribeEvents })
  },

  teardown: () => {
    get()._unsubscribeTelemetry?.()
    get()._unsubscribeEvents?.()
    set({ _unsubscribeTelemetry: null, _unsubscribeEvents: null })
  },

  dispatchCommand: (robotId, type, label, params, opts) => {
    // Robot state changes triggered by a command (e.g. ESTOP -> E_STOP) are
    // applied inside mockDataProvider itself and arrive here via the
    // telemetry subscription in init() — mutating `robots` from this
    // callback too would race with the provider's next 1 Hz tick.
    const provider = opts?.forceMock ? mockDataProvider : dataProvider
    provider.dispatchCommand(robotId, type, label, (command) => {
      set((s) => {
        const idx = s.activeCommands.findIndex((c) => c.command_id === command.command_id)
        const next = [...s.activeCommands]
        if (idx >= 0) next[idx] = command
        else next.unshift(command)
        return { activeCommands: next.slice(0, 5) }
      })
    }, params)
  },

  dismissCommand: (commandId) => {
    set((s) => ({ activeCommands: s.activeCommands.filter((c) => c.command_id !== commandId) }))
  },

  driveRobot: (robotId, vx, vy, vyaw) => {
    dataProvider.driveRobot(robotId, vx, vy, vyaw)
  },

  uploadAudioClip: (robotId, file) => dataProvider.uploadAudioClip(robotId, file),

  acknowledgeEvent: (eventId) => {
    // Clearing an alert in the UI acknowledges it — it does not resolve the
    // underlying condition (docs/05-ui-ux.md §16.2).
    set((s) => ({
      events: s.events.map((e) => (e.event_id === eventId ? { ...e, acknowledged: true } : e)),
    }))
  },
}))
