import { currentPageHostname, resolveServiceUrl } from './serviceHost'

/** Where the backend and broker are, and whether to use them at all. Its own
 * module, free of the providers, so the session layer (src/lib/auth) can read
 * it without importing RealDataProvider -- which itself depends on the session
 * for who the operator is. dataProvider.ts re-exports every name here. */

/** Exported so nothing has to *simulate* real data when a real backend is
 * present. Mock missions, mock alerts and a stock camera still showed up in
 * real mode, indistinguishable from live readings.
 * docs/audit/2026-08-12-ui-ux-audit.md A-15. */
export const USE_REAL_BACKEND = import.meta.env.VITE_USE_REAL_BACKEND === 'true'
const PAGE_HOSTNAME = currentPageHostname()

/** The MQTT and API URLs are resolved against the host the page was served from
 * (see `serviceHost.ts`). Configured as `localhost`, they only work while the
 * browser is on this machine; opening the UI from a phone or another laptop over
 * `vite --host` would otherwise point those at the *visiting* device and produce
 * a UI that renders with no robots and commands that never send. */
export const MQTT_WS_URL = resolveServiceUrl(import.meta.env.VITE_MQTT_WS_URL ?? 'ws://localhost:9001', PAGE_HOSTNAME)
export const API_BASE_URL = resolveServiceUrl(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000', PAGE_HOSTNAME)

/** `VITE_SITE_ID` is an optional filter, not a requirement: leaving it unset
 * spans every site, which is what a single-site deployment wants.
 *
 * There is deliberately no `VITE_ROBOT_ID` any more. It used to pin the browser
 * to one robot at build time -- so with two robots and two edge bridges, the
 * second robot's telemetry was ingested by the backend and returned by
 * `GET /robots`, but the UI could never display it. Robots are now discovered at
 * runtime, from the backend registry plus the bridges' retained MQTT
 * registrations, so a robot appears as soon as its bridge announces itself and
 * no rebuild or env change is needed to add one. */
export const SITE_FILTER: string | undefined = import.meta.env.VITE_SITE_ID || undefined
