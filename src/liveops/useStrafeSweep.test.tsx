// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { currentOperatorId } from '@/lib/realtime/operator'
import type { RobotState } from '@/types'

const live = vi.hoisted(() => {
  const drives: number[][] = []
  const control = { refuseMoves: false }
  const actions = {
    driveRobot: (_robotId: string, vx: number, vy: number, vyaw: number, ratio?: number) => {
      const isStop = vx === 0 && vy === 0 && vyaw === 0
      if (!isStop && control.refuseMoves) return false
      drives.push([vx, vy, vyaw, ratio ?? NaN])
      return true
    },
  }
  return { drives, control, actions }
})
vi.mock('@/store/useLiveOpsStore', () => ({
  useLiveOpsStore: (select: (s: typeof live.actions) => unknown) => select(live.actions),
}))

import { useStrafeSweep, type StrafeSweep } from './useStrafeSweep'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Robot = Pick<RobotState, 'robot_id' | 'control_owner' | 'abstract_state'>

let sweep: StrafeSweep
function Harness({ robot }: { robot: Robot }) {
  sweep = useStrafeSweep(robot)
  return null
}

const mine = (): Robot => ({ robot_id: 'rover-pi', control_owner: currentOperatorId(), abstract_state: 'MANUAL' })

let container: HTMLDivElement
let root: Root
const render = (robot: Robot) => act(() => root.render(<Harness robot={robot} />))
const advance = (ms: number) => act(() => { vi.advanceTimersByTime(ms) })
const lastDrive = () => live.drives[live.drives.length - 1]
/** The distinct setpoints sent, in order, collapsing keepalive repeats. */
const setpoints = () => live.drives.filter((d, i, all) => i === 0 || d.join() !== all[i - 1].join())

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(2026, 10, 24, 14, 0, 0))
  live.drives.length = 0
  live.control.refuseMoves = false
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

describe('useStrafeSweep', () => {
  it('drives the whole schedule left and right at 80 %, stopping in rests and at the end', () => {
    render(mine())
    act(() => sweep.start())
    expect(lastDrive()).toEqual([0, 0.025, 0, 80])
    advance(30_000)

    const expected: number[][] = []
    for (const vy of [0.025, 0.05, 0.07, 0.085]) {
      expected.push([0, vy, 0, 80], [0, 0, 0, 80], [0, -vy, 0, 80], [0, 0, 0, 80])
    }
    expect(setpoints()).toEqual(expected)
    expect(live.drives.every((d) => d[3] === 80 && d[0] === 0 && d[2] === 0)).toBe(true)
    expect(sweep.state).toEqual({
      phase: 'done',
      startedAt: new Date(2026, 10, 24, 14, 0, 0).getTime(),
      endedAt: new Date(2026, 10, 24, 14, 0, 28).getTime(),
    })
    // Nothing more once done.
    const sent = live.drives.length
    advance(5000)
    expect(live.drives.length).toBe(sent)
  })

  it('resends a held setpoint as a keepalive, and a rest only once', () => {
    render(mine())
    act(() => sweep.start())
    advance(1999)
    // t=0 and t=1000 within the first 2 s hold.
    expect(live.drives).toEqual([[0, 0.025, 0, 80], [0, 0.025, 0, 80]])
    advance(1500)
    expect(live.drives.slice(2)).toEqual([[0, 0, 0, 80]])
  })

  it('reports the current step and its seconds left', () => {
    render(mine())
    act(() => sweep.start())
    expect(sweep.state).toMatchObject({ phase: 'running', stepIndex: 0, kind: 'hold', side: 'left', stick: 0.5, secondsLeft: 2 })
    advance(600)
    expect(sweep.state).toMatchObject({ stepIndex: 0, secondsLeft: 1.4 })
    advance(10_500 - 600) // the second level's right hold starts at 10.5 s
    expect(sweep.state).toMatchObject({ phase: 'running', stepIndex: 6, kind: 'hold', side: 'right', stick: 0.55, secondsLeft: 2 })
  })

  it('stops at once on Stop, sending the zero', () => {
    render(mine())
    act(() => sweep.start())
    advance(500)
    act(() => sweep.stop())
    expect(lastDrive()).toEqual([0, 0, 0, 80])
    expect(sweep.state).toMatchObject({ phase: 'stopped', reason: 'operator' })
    const sent = live.drives.length
    advance(10_000)
    expect(live.drives.length).toBe(sent)
  })

  it('stops at once on unmount', () => {
    render(mine())
    act(() => sweep.start())
    advance(500)
    act(() => root.unmount())
    expect(lastDrive()).toEqual([0, 0, 0, 80])
    const sent = live.drives.length
    advance(10_000)
    expect(live.drives.length).toBe(sent)
    root = createRoot(container) // for afterEach
  })

  it('stops at once when this operator loses control', () => {
    render(mine())
    act(() => sweep.start())
    advance(500)
    render({ ...mine(), control_owner: 'someone-else' })
    expect(lastDrive()).toEqual([0, 0, 0, 80])
    expect(sweep.state).toMatchObject({ phase: 'stopped', reason: 'lostControl' })
    const sent = live.drives.length
    advance(10_000)
    expect(live.drives.length).toBe(sent)
  })

  it('stops at once on E-Stop', () => {
    render(mine())
    act(() => sweep.start())
    advance(500)
    render({ ...mine(), abstract_state: 'E_STOP' })
    expect(lastDrive()).toEqual([0, 0, 0, 80])
    expect(sweep.state).toMatchObject({ phase: 'stopped', reason: 'estop' })
  })

  it('stops when a move is refused', () => {
    render(mine())
    act(() => sweep.start())
    advance(3000) // in the first rest
    live.control.refuseMoves = true
    advance(1000) // the right hold is refused
    expect(lastDrive()).toEqual([0, 0, 0, 80])
    expect(sweep.state).toMatchObject({ phase: 'stopped', reason: 'refused' })
  })

  it('will not start without control, or in E-Stop', () => {
    render({ ...mine(), control_owner: null })
    act(() => sweep.start())
    render({ ...mine(), abstract_state: 'E_STOP' })
    act(() => sweep.start())
    advance(5000)
    expect(live.drives).toEqual([])
    expect(sweep.state).toEqual({ phase: 'idle' })
  })

  it('resets to idle after it ends', () => {
    render(mine())
    act(() => sweep.start())
    act(() => sweep.stop())
    act(() => sweep.reset())
    expect(sweep.state).toEqual({ phase: 'idle' })
    expect(sweep.isRunning()).toBe(false)
  })
})
