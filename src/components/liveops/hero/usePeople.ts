import { useEffect, useReducer, useState } from 'react'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { PEOPLE_CLEAR_MS, peopleFresh, type PeopleSample } from '@/liveops/people'
import type { PeopleFrame } from '@/types'

/**
 * The people a robot's perception sees now (perception/people, schema 0.0.38),
 * or null once frames have stopped for PEOPLE_CLEAR_MS -- detection switched
 * off, the robot gone, or a bridge older than 0.0.38 that never sends any.
 * `robotId` null subscribes to nothing.
 */
export function usePeople(robotId: string | null): PeopleFrame | null {
  const [latest, setLatest] = useState<{ robotId: string; sample: PeopleSample } | null>(null)
  useEffect(() => {
    if (!robotId) return
    return dataProvider.subscribePeople(robotId, (sample) => setLatest({ robotId, sample }))
  }, [robotId])
  const sample = latest && latest.robotId === robotId ? latest.sample : null

  // Re-evaluated when the latest sample turns stale, so a robot that stops
  // sending clears on its own.
  const [, tick] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (!sample) return
    const left = PEOPLE_CLEAR_MS - (Date.now() - sample.receivedAt)
    if (left <= 0) return
    const id = setTimeout(tick, left + 1)
    return () => clearTimeout(id)
  }, [sample])

  return peopleFresh(sample) ? sample!.frame : null
}

/**
 * Whether the robot is sending people frames at all: true from the first one,
 * false once they have stopped for PEOPLE_CLEAR_MS. Re-renders only when that
 * changes, not at the frame rate -- for the Detections toggle, which is
 * disabled while nothing arrives.
 */
export function usePeopleArriving(robotId: string | null): boolean {
  const [state, setState] = useState<{ robotId: string | null; arriving: boolean }>({ robotId, arriving: false })
  useEffect(() => {
    if (!robotId) return
    let timer: ReturnType<typeof setTimeout> | undefined
    const off = dataProvider.subscribePeople(robotId, (sample) => {
      clearTimeout(timer)
      const left = PEOPLE_CLEAR_MS - (Date.now() - sample.receivedAt)
      if (left <= 0) return
      setState((s) => (s.robotId === robotId && s.arriving ? s : { robotId, arriving: true }))
      timer = setTimeout(() => setState({ robotId, arriving: false }), left)
    })
    return () => { clearTimeout(timer); off() }
  }, [robotId])
  return state.robotId === robotId && state.arriving
}
