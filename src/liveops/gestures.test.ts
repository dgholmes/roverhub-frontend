import { describe, expect, it } from 'vitest'
import { STATE_SETTLE_S } from '@/lib/realtime/commandDeadline'
import { formatRemaining, gestureCardView, gestureSpec, GESTURES, TIMED_GRACE_MS, type ActiveGesture } from './gestures'

const gesture = (id: string, extra: Partial<ActiveGesture> = {}): ActiveGesture =>
  ({ robotId: 'r1', id, label: id, startedAt: 0, seen: false, stopping: false, ...extra })
const robot = (sdk_state: string, abstract_state: 'MANUAL' | 'E_STOP' = 'MANUAL') => ({ sdk_state, abstract_state })

describe('gestureCardView', () => {
  it('counts a timed gesture down and ends it after its estimate', () => {
    const dance = gesture('dance0')
    expect(gestureCardView(dance, robot('dance0'), 26_500)).toMatchObject({ remainingS: 100, over: false })
    expect(gestureCardView(dance, robot('dance0'), 126_500 + TIMED_GRACE_MS + 1).over).toBe(true)
  })

  it('keeps a held wave until the robot is seen to leave it', () => {
    expect(gestureCardView(gesture('wave'), robot('balance_stand'), 60_000)).toMatchObject({ remainingS: null, over: false })
    expect(gestureCardView(gesture('wave', { seen: true }), robot('wave'), 60_000).over).toBe(false)
    expect(gestureCardView(gesture('wave', { seen: true }), robot('balance_stand'), 60_000).over).toBe(true)
  })

  it('ends on E-Stop', () => {
    expect(gestureCardView(gesture('wave'), robot('passive', 'E_STOP'), 0).over).toBe(true)
  })
})

describe('GESTURES', () => {
  it('stops wave the verified way, and only offers stop where a gesture outlasts a few seconds', () => {
    expect(gestureSpec('wave')).toMatchObject({ kind: 'held', stop: 'wave', stopVerified: true })
    for (const [id, spec] of Object.entries(GESTURES)) {
      if (spec.kind === 'timed' && (spec.seconds ?? 0) <= 9) expect(spec.stop, id).toBeNull()
    }
  })

  it('agrees with the bridge wait for every timed gesture the bridge waits out', () => {
    // The card's estimate is the run length; the bridge's wait is that plus up
    // to ~1.3 s of margin, never less.
    for (const [id, spec] of Object.entries(GESTURES)) {
      const bridge = STATE_SETTLE_S[id]
      if (spec.kind !== 'timed' || bridge === undefined) continue
      expect(bridge - spec.seconds!, id).toBeGreaterThanOrEqual(0)
      expect(bridge - spec.seconds!, id).toBeLessThanOrEqual(1.5)
    }
  })
})

describe('formatRemaining', () => {
  it('reads as seconds under a minute and m:ss above', () => {
    expect(formatRemaining(9)).toBe('9s')
    expect(formatRemaining(112)).toBe('1:52')
  })
})
