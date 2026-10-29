import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Every dispatch is recorded; `respond` decides the stages each one reaches. */
const stub = vi.hoisted(() => ({
  sent: [] as { type: string; params: unknown; onUpdate: (c: unknown) => void }[],
  speakVolumes: [] as number[],
}))

vi.mock('@/lib/realtime/dataProvider', () => ({
  USE_REAL_BACKEND: false,
  dataProvider: {
    getRobots: () => [],
    dispatchCommand: (
      robotId: string, type: string, label: string,
      onUpdate: (c: unknown) => void, params?: unknown,
    ) => {
      stub.sent.push({ type, params, onUpdate })
      onUpdate({ command_id: `c${stub.sent.length}`, robot_id: robotId, type, label, params, stages: [], current_stage: 'requested', initiated_by: 'test' })
    },
    setSpeakVolume: (_robotId: string, volume: number) => stub.speakVolumes.push(volume),
  },
}))

import { useLiveOpsStore } from './useLiveOpsStore'

function finish(index: number, stage: string) {
  const { type, params, onUpdate } = stub.sent[index]
  onUpdate({ command_id: `c${index + 1}`, robot_id: 'r1', type, label: '', params, stages: [], current_stage: stage, initiated_by: 'test' })
}

const store = () => useLiveOpsStore.getState()

beforeEach(() => {
  stub.sent = []
  stub.speakVolumes = []
  useLiveOpsStore.setState({ activeCommands: [], activeGestures: {} })
})

describe('gesture tracking', () => {
  it('starts a card for a tracked gesture and stops wave by sending it again', () => {
    store().startGesture('r1', 'wave', 'Wave')
    expect(store().activeGestures.r1).toMatchObject({ id: 'wave', stopping: false })

    store().stopGesture('r1')
    expect(stub.sent.map((s) => s.params)).toEqual([{ state: 'wave' }, { state: 'wave' }])
    expect(store().activeGestures.r1.stopping).toBe(true)

    finish(1, 'execution_completed')
    expect(store().activeGestures.r1).toBeUndefined()
  })

  it('keeps the card when a stop fails, so Stop can be pressed again', () => {
    store().startGesture('r1', 'wave', 'Wave')
    store().stopGesture('r1')
    finish(1, 'execution_failed')
    expect(store().activeGestures.r1).toMatchObject({ stopping: false })
  })

  it('drops the card when the robot refuses the gesture', () => {
    store().startGesture('r1', 'gongxi', 'Gongxi')
    finish(0, 'execution_failed')
    expect(store().activeGestures.r1).toBeUndefined()
  })

  it('ends the card when any other motion or state command is sent', () => {
    store().startGesture('r1', 'dance0', 'Dance')
    store().dispatchCommand('r1', 'SET_STATE', 'Stand', { state: 'balance_stand' })
    expect(store().activeGestures.r1).toBeUndefined()
  })

  it('leaves the card alone for commands that do not move the robot', () => {
    store().startGesture('r1', 'dance0', 'Dance')
    store().dispatchCommand('r1', 'LED_SIGNAL', 'Lights', {})
    expect(store().activeGestures.r1).toBeDefined()
  })

  it('offers no stop for a short one-shot move', () => {
    store().startGesture('r1', 'twirl_jump', 'Twirl Jump')
    store().stopGesture('r1')
    expect(stub.sent).toHaveLength(1)
  })
})

describe('setSpeakVolume', () => {
  it('does nothing when no clip is playing', () => {
    vi.useFakeTimers()
    store().setSpeakVolume('r1', 40)
    vi.runAllTimers()
    expect(stub.speakVolumes).toEqual([])
    vi.useRealTimers()
  })

  it('sends only where a drag comes to rest while a clip plays', () => {
    vi.useFakeTimers()
    store().dispatchCommand('r1', 'SPEAK', 'Play', { clip_id: 'x', volume: 100 })
    for (const v of [90, 70, 50]) store().setSpeakVolume('r1', v)
    vi.runAllTimers()
    expect(stub.speakVolumes).toEqual([50])
    vi.useRealTimers()
  })
})
