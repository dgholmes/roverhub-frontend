/**
 * Resolves which edge device serves a given robot's camera.
 *
 * `stream_manager.py`'s MJPEG relay runs on the edge device next to the robot,
 * so the URL is per-robot, not per-deployment. With one edge device a single
 * global URL was fine; with two robots on two devices (a Jetson and a Pi) a
 * single URL would render one robot's camera while the *other* robot is
 * selected -- an operator looking at the wrong robot's view. That is the same
 * build-time-pinning mistake that `VITE_ROBOT_ID` made for robot discovery.
 *
 * Sources, in precedence order (first hit wins, `edgeVideoFor`):
 *
 *   1. VITE_EDGE_VIDEO_BASE_URLS -- per-robot override, comma-separated
 *      `robotId=url`:
 *        rover-jetson=http://10.0.12.116:8090,rover-pi=http://10.0.12.4:8090
 *      Applies only to the robot it names; never to another robot.
 *
 *   2. The url the robot's bridge advertises -- `video_base_url` in its
 *      registration (schema 0.0.34), carried as `robot.bridge.video_base_url`.
 *      Accepted only as an absolute http(s) URL with a host; anything else is
 *      treated as not advertised.
 *
 *   3. VITE_EDGE_VIDEO_BASE_URL -- single URL applied to every robot. Only correct
 *      when the deployment has exactly one edge device; prefer the map otherwise.
 *
 *   4. Nothing: no video, and the pane says so.
 *
 * The same base URL serves both video paths the bridge can run: the MJPEG relay
 * at `/video/{camera}` (VIDEO_SOURCE=dds) and the WebRTC handshake at
 * `/video/{camera}/webrtc` (VIDEO_SOURCE=rtsp, lib/webrtcVideo.ts). Either way the
 * browser talks straight to the edge device, so this is still same-LAN only.
 *
 * The advertised url (2.) means a device whose DHCP lease moves needs no
 * console rebuild; the env override (1.) stays first so an operator can still
 * pin a robot by hand when what the device advertises is wrong for this browser.
 */

/** Parses the comma-separated `robotId=url` map. Exported for tests.
 *
 * Tolerant by design: a malformed entry is skipped rather than throwing, since
 * this runs at module scope and a typo in one robot's URL must not take the
 * whole console down. Values keep any path but lose a trailing slash, so
 * callers can append `/video/front` unconditionally. */
export function parseEdgeVideoMap(raw: string | undefined): Record<string, string> {
  if (!raw) return {}
  const map: Record<string, string> = {}
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim()
    if (trimmed === '') continue
    // Split on the FIRST '=' only -- the URL itself can contain '=' in a query.
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const robotId = trimmed.slice(0, eq).trim()
    const url = trimmed.slice(eq + 1).trim().replace(/\/+$/, '')
    if (robotId === '' || url === '') continue
    map[robotId] = url
  }
  return map
}

export const PER_ROBOT_URLS = parseEdgeVideoMap(
  import.meta.env.VITE_EDGE_VIDEO_BASE_URLS as string | undefined,
)
export const GLOBAL_URL = (
  (import.meta.env.VITE_EDGE_VIDEO_BASE_URL as string | undefined) ?? ''
).trim().replace(/\/+$/, '') || undefined

/** Where a robot's video url came from (see the precedence above). */
export type EdgeVideoSource = 'override' | 'advertised' | 'global' | 'none'

/** An advertised base url, or undefined when it is not one we will use: only an
 * absolute http(s) URL with a non-empty host counts. A bare `host:port`, a
 * `javascript:` URL, an empty string or a non-string all read as "not
 * advertised", so the resolver falls through. Trailing slashes are dropped, as
 * in `parseEdgeVideoMap`. */
function advertisedUrlOf(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    return undefined
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return undefined
  if (parsed.hostname === '') return undefined
  return trimmed.replace(/\/+$/, '')
}

/** Base URL of the edge device serving this robot's video and where it came
 * from: the robot's own env override, then what its bridge advertises, then the
 * single global URL, then none. `url` is undefined for 'none' (mock mode, or an
 * unconfigured robot). Callers append `/video/{front,back}`. */
export function edgeVideoFor(
  robotId: string,
  advertised?: string | null,
  overrides?: { perRobot?: Record<string, string>; global?: string },
): { url: string | undefined; source: EdgeVideoSource } {
  const perRobot = overrides?.perRobot ?? PER_ROBOT_URLS
  const global = overrides && 'global' in overrides ? overrides.global : GLOBAL_URL
  // Own property only: a robot id like `constructor` must not find Object's.
  if (Object.prototype.hasOwnProperty.call(perRobot, robotId)) {
    return { url: perRobot[robotId], source: 'override' }
  }
  const fromDevice = advertisedUrlOf(advertised)
  if (fromDevice) return { url: fromDevice, source: 'advertised' }
  if (global) return { url: global, source: 'global' }
  return { url: undefined, source: 'none' }
}

/** `edgeVideoFor(...).url`, for callers that only need the address. */
export function edgeVideoBaseUrlFor(
  robotId: string,
  advertised?: string | null,
  overrides?: { perRobot?: Record<string, string>; global?: string },
): string | undefined {
  return edgeVideoFor(robotId, advertised, overrides).url
}
