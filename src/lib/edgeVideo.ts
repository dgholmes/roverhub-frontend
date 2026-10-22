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
 * Configuration, in precedence order:
 *
 *   VITE_EDGE_VIDEO_BASE_URLS -- per-robot map, comma-separated `robotId=url`:
 *     robot-dev-01=http://10.0.12.116:8090,robot-dev-02=http://10.0.12.22:8090
 *
 *   VITE_EDGE_VIDEO_BASE_URL -- single URL applied to every robot. Only correct
 *     when the deployment has exactly one edge device; prefer the map otherwise.
 *
 * The same base URL serves both video paths the bridge can run: the MJPEG relay
 * at `/video/{camera}` (VIDEO_SOURCE=dds) and the WebRTC handshake at
 * `/video/{camera}/webrtc` (VIDEO_SOURCE=rtsp, lib/webrtcVideo.ts). Either way the
 * browser talks straight to the edge device, so this is still same-LAN only.
 *
 * Longer term the bridge should advertise its own video URL in its retained
 * registration, so this needs no per-deployment configuration at all and a
 * robot that moves to a different device keeps working. That is a wire-contract
 * change (shared/schemas + SCHEMA_VERSION + redeploying both devices), so it is
 * deliberately not bundled in here.
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

/** Base URL of the edge device serving this robot's video, or undefined when none is
 * configured (mock mode). Callers append `/video/{front,back}`. */
export function edgeVideoBaseUrlFor(
  robotId: string,
  overrides?: { perRobot?: Record<string, string>; global?: string },
): string | undefined {
  const perRobot = overrides?.perRobot ?? PER_ROBOT_URLS
  const global = overrides && 'global' in overrides ? overrides.global : GLOBAL_URL
  return perRobot[robotId] ?? global
}
