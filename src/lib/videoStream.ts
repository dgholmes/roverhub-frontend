/**
 * Lifecycle rules for the MJPEG camera feeds.
 *
 * Why this exists: each feed is a long-lived `<img>` pointed at a
 * `multipart/x-mixed-replace` stream. Chrome accumulates decoded-frame memory
 * for the life of that element and does NOT release it when the stream stops —
 * measured on a real session, the RoverHub tab reached a 945 MB footprint
 * against a 92 MB JS heap (normal, and in line with every other tab), i.e.
 * ~850 MB of non-JS memory, with the network already idle at 385 B/s. Left
 * running for hours that ends in Chrome's "Aw, Snap! Out of Memory".
 *
 * Two rules follow, and they fix different halves of the problem:
 *
 *  - Disconnect while the tab is hidden. A dashboard left open overnight
 *    otherwise keeps decoding video nobody is looking at. This stops further
 *    growth but cannot reclaim what is already held.
 *
 *  - Recycle the element periodically while visible. Because the memory is tied
 *    to the element rather than the connection, only destroying and recreating
 *    the `<img>` actually frees it. Costs one dropped frame per recycle.
 *
 * The decisions live here rather than in the component because this project's
 * Vitest runs in a node environment with no DOM, so logic inside JSX cannot be
 * tested — the same reason postureModel and manualControlMath are separate.
 */

/** How often a visible stream's `<img>` is recreated to release decoded frames.
 *
 * Five minutes is a deliberate compromise. At ~20 fps a feed accumulates
 * steadily, so shorter is safer for memory; but each recycle drops a frame and
 * reopens an HTTP connection to the edge relay, which on a teleop view is a
 * visible blink. Five minutes bounds growth to a few hundred MB at worst while
 * blinking rarely enough that an operator will not notice it.
 */
export const STREAM_RECYCLE_INTERVAL_MS = 5 * 60_000

/** Whether the feed should hold an open MJPEG connection right now. */
export function shouldConnectStream(opts: {
  /** document.visibilityState === 'visible' */
  documentVisible: boolean
  /** A relay URL is configured for this robot. */
  hasUrl: boolean
  /** The robot's DDS link is up, so there are frames to receive. */
  ddsAvailable: boolean
  /** A previous connection attempt failed; do not hammer the relay. */
  errored: boolean
}): boolean {
  return opts.hasUrl && opts.ddsAvailable && !opts.errored && opts.documentVisible
}

/** Which recycle generation a stream is in after running for `elapsedMs`.
 *
 * Used as part of the element's React `key`: when it changes, React unmounts
 * the old `<img>` and mounts a new one, which is what actually releases the
 * decoded frames.
 */
export function recycleGeneration(
  elapsedMs: number,
  intervalMs: number = STREAM_RECYCLE_INTERVAL_MS,
): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0
  if (!Number.isFinite(intervalMs) || intervalMs <= 0) return 0
  return Math.floor(elapsedMs / intervalMs)
}

/** React key for the feed element.
 *
 * Changing the key is the mechanism, so it must change on exactly the things
 * that require a fresh element: a different URL (camera swap), a recycle tick,
 * and the switch between live feed and placeholder. It must NOT change on
 * anything else, or the feed blinks for no reason.
 */
export function streamKey(url: string | undefined, generation: number, connected: boolean): string {
  if (!connected || !url) return 'placeholder'
  return `${url}#${generation}`
}
