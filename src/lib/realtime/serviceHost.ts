/** Resolving backend service URLs when the UI is opened from another device.
 *
 * `VITE_MQTT_WS_URL` and `VITE_API_BASE_URL` are configured as `localhost`,
 * which is correct only while the browser runs on the same machine as the
 * services. Serve the dev server on the LAN (`vite --host`) and open it from a
 * phone or laptop, and those URLs resolve on the *visiting* device instead — so
 * the page loads and then silently fails to reach MQTT or the API. The symptom
 * is a UI that renders with no robots and commands that never send.
 *
 * Hardcoding the dev machine's LAN IP into `.env` fixes it until DHCP hands out
 * a different address, and breaks plain localhost use in the meantime. Instead,
 * derive the host from wherever the page was served: if you reached the UI at
 * `http://10.0.10.117:5175`, then MQTT and the API are at `10.0.10.117` too.
 */

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', '[::1]', ''])

export function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname.toLowerCase())
}

/**
 * Point `configured` at `pageHostname` when it targets loopback but the page
 * does not. Port, protocol and path are preserved.
 *
 * Left unchanged when:
 *  - the page itself is on loopback (ordinary local development), or
 *  - the configured URL already names a real host — someone pointed it
 *    somewhere deliberately, and guessing over that would be wrong. This is why
 *    `VITE_EDGE_VIDEO_BASE_URLS`, which names the edge devices' own LAN
 *    addresses, is unaffected: those hosts are not loopback.
 */
export function resolveServiceUrl(configured: string, pageHostname: string): string {
  if (!configured) return configured
  if (isLoopbackHostname(pageHostname)) return configured

  let url: URL
  try {
    url = new URL(configured)
  } catch {
    // Not absolute (e.g. a bare path) — nothing to rewrite.
    return configured
  }

  if (!isLoopbackHostname(url.hostname)) return configured

  url.hostname = pageHostname
  // URL#toString() appends a trailing slash to an empty path; keep the
  // configured form so callers that concatenate paths don't produce `//`.
  return configured.endsWith('/') ? url.toString() : url.toString().replace(/\/$/, '')
}

/** The hostname the page was served from, or `localhost` outside a browser
 * (unit tests, SSR). */
export function currentPageHostname(): string {
  if (typeof window === 'undefined' || !window.location) return 'localhost'
  return window.location.hostname
}
