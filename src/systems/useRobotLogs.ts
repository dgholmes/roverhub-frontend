import { useCallback, useEffect, useReducer, useState } from 'react'
import { dataProvider } from '@/lib/realtime/dataProvider'
import { ApiError } from '@/lib/realtime/apiError'
import { INITIAL_LOGS_STATE, LOG_ANSWER_TIMEOUT_MS, logsReducer, type LogRange, type LogsState } from './robotLogs'

/**
 * One robot's log for Systems › Logs: its history since `range` hours ago,
 * asked for whenever the robot or the range changes, merged with the live
 * lines into one list (robotLogs.ts says how).
 *
 * Subscribes before asking, so an answer that beats the POST's reply is not
 * lost (the reducer holds it until the reply names our request). After the
 * reply, the robot has LOG_ANSWER_TIMEOUT_MS to send a batch, and the same
 * again between batches: silence before the first reads as "no answer" (a
 * bridge older than schema 0.0.22 never answers), silence after it as the end
 * of the answer (the topic is QoS 0, so a `done` batch can be lost).
 */
export function useRobotLogs(robotId: string | null, range: LogRange): { state: LogsState; retry: () => void } {
  const [state, dispatch] = useReducer(logsReducer, INITIAL_LOGS_STATE)
  const [attempt, setAttempt] = useState(0)
  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    dispatch({ type: 'reset' })
    if (!robotId) return
    let cancelled = false
    let requestId: string | null = null
    let timer: ReturnType<typeof setTimeout> | null = null
    const arm = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => { timer = null; if (!cancelled) dispatch({ type: 'timeout' }) }, LOG_ANSWER_TIMEOUT_MS)
    }
    const off = dataProvider.subscribeRobotLogs(robotId, (batch) => {
      if (cancelled) return
      dispatch({ type: 'batch', batch })
      if (requestId !== null && batch.request_id === requestId) {
        if (batch.done) { if (timer) clearTimeout(timer); timer = null } else arm()
      }
    })
    dataProvider.requestRobotLogs(robotId, { sinceHours: range })
      .then((ticket) => {
        if (cancelled) return
        requestId = ticket.requestId
        dispatch({ type: 'ticket', requestId: ticket.requestId })
        arm()
      })
      .catch((e: unknown) => {
        if (cancelled) return
        const status = e instanceof ApiError ? e.status : null
        const detail = e instanceof ApiError ? (e.detail ?? e.message) : e instanceof Error ? e.message : String(e)
        dispatch({ type: 'refused', status, detail })
      })
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      off()
    }
  }, [robotId, range, attempt])

  return { state, retry }
}
