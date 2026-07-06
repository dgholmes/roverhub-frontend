import { create } from 'zustand'
import type { RobotState, Mission, TimelineEvent, Command, CommandType } from '@/types'
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
  dispatchCommand: (robotId: string, type: CommandType, label: string) => void
  dismissCommand: (commandId: string) => void
  acknowledgeEvent: (eventId: string) => void
}

export const useLiveOpsStore = create<LiveOpsState>((set, get) => ({
  robots: mockDataProvider.getRobots(),
  missions: initialMissions,
  events: seedEvents(),
  activeCommands: [],
  _unsubscribeTelemetry: null,
  _unsubscribeEvents: null,

  init: () => {
    if (get()._unsubscribeTelemetry) return
    const unsubscribeTelemetry = mockDataProvider.subscribeTelemetry((robots) => set({ robots: [...robots] }))
    const unsubscribeEvents = mockDataProvider.subscribeEvents((evt) =>
      set((s) => ({ events: [evt, ...s.events].slice(0, 100) }))
    )
    set({ _unsubscribeTelemetry: unsubscribeTelemetry, _unsubscribeEvents: unsubscribeEvents })
  },

  teardown: () => {
    get()._unsubscribeTelemetry?.()
    get()._unsubscribeEvents?.()
    set({ _unsubscribeTelemetry: null, _unsubscribeEvents: null })
  },

  dispatchCommand: (robotId, type, label) => {
    // Robot state changes triggered by a command (e.g. ESTOP -> E_STOP) are
    // applied inside mockDataProvider itself and arrive here via the
    // telemetry subscription in init() — mutating `robots` from this
    // callback too would race with the provider's next 1 Hz tick.
    mockDataProvider.dispatchCommand(robotId, type, label, (command) => {
      set((s) => {
        const idx = s.activeCommands.findIndex((c) => c.command_id === command.command_id)
        const next = [...s.activeCommands]
        if (idx >= 0) next[idx] = command
        else next.unshift(command)
        return { activeCommands: next.slice(0, 5) }
      })
    })
  },

  dismissCommand: (commandId) => {
    set((s) => ({ activeCommands: s.activeCommands.filter((c) => c.command_id !== commandId) }))
  },

  acknowledgeEvent: (eventId) => {
    // Clearing an alert in the UI acknowledges it — it does not resolve the
    // underlying condition (docs/05-ui-ux.md §16.2).
    set((s) => ({
      events: s.events.map((e) => (e.event_id === eventId ? { ...e, acknowledged: true } : e)),
    }))
  },
}))
