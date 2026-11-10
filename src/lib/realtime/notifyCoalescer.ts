/**
 * The longest a high-rate reading waits before subscribers are told about it,
 * and so the shortest gap between two such repaints: 5 a second.
 *
 * Telemetry arrives at ~10 Hz per robot and lower_state at 5 Hz, and every
 * message used to set the store and repaint every subscriber -- tens of renders
 * a second with a few robots, 5,600/s recorded in the 2026-11-10 audit (§5.5),
 * and React's dev build keeps a performance measure for each one, which is how
 * a dev tab ran out of memory. Nothing a person reads off a screen needs more
 * than this; anything that must not wait (state, acks, a robot appearing or
 * dropping off) goes out at once instead (RealDataProvider.notifyRobotsNow).
 */
export const TELEMETRY_NOTIFY_INTERVAL_MS = 200

export interface NotifyCoalescer {
  /** Ask for a delivery: now if the last was at least an interval ago, else
   * once the interval is up. Asking again while one is pending changes nothing,
   * and that one delivers whatever is newest by then -- the last request is
   * never dropped. */
  request(): void
  /** Deliver now, folding in any pending delivery. */
  flush(): void
  /** Drop a pending delivery without making it. */
  cancel(): void
}

/** A leading-and-trailing throttle around `deliver`, which reads the newest
 * value itself when called (so nothing is ever delivered out of date). */
export function createNotifyCoalescer(deliver: () => void, intervalMs = TELEMETRY_NOTIFY_INTERVAL_MS): NotifyCoalescer {
  let timer: ReturnType<typeof setTimeout> | null = null
  let lastAt = Number.NEGATIVE_INFINITY

  const cancel = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }
  const flush = () => {
    cancel()
    lastAt = Date.now()
    deliver()
  }
  return {
    request() {
      if (timer !== null) return
      const wait = lastAt + intervalMs - Date.now()
      if (wait <= 0) flush()
      else timer = setTimeout(flush, wait)
    },
    flush,
    cancel,
  }
}
