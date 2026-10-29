import { mockDataProvider } from '@/mocks/mockDataProvider'
import { RealDataProvider } from './realDataProvider'
import { currentPageHostname, resolveServiceUrl } from './serviceHost'

/** Exported so nothing has to *simulate* real data when a real backend is
 * present. Mock missions, mock alerts and a stock camera still showed up in
 * real mode, indistinguishable from live readings.
 * docs/audit/2026-08-12-ui-ux-audit.md A-15. */
export const USE_REAL_BACKEND = import.meta.env.VITE_USE_REAL_BACKEND === 'true'
const PAGE_HOSTNAME = currentPageHostname()

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
/** The MQTT and API URLs are resolved against the host the page was served from
 * (see `serviceHost.ts`). Configured as `localhost`, they only work while the
 * browser is on this machine; opening the UI from a phone or another laptop over
 * `vite --host` would otherwise point those at the *visiting* device and produce
 * a UI that renders with no robots and commands that never send. */
export const MQTT_WS_URL = resolveServiceUrl(import.meta.env.VITE_MQTT_WS_URL ?? 'ws://localhost:9001', PAGE_HOSTNAME)
export const API_BASE_URL = resolveServiceUrl(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000', PAGE_HOSTNAME)
export const SITE_FILTER: string | undefined = import.meta.env.VITE_SITE_ID || undefined

export const dataProvider = USE_REAL_BACKEND
  ? new RealDataProvider({ wsUrl: MQTT_WS_URL, apiBaseUrl: API_BASE_URL, siteId: SITE_FILTER })
  : mockDataProvider

// Vite re-executes this module on a hot update whenever anything it imports
// changes -- and that includes every i18n locale file, through realDataProvider
// -> connectivityHealth -> i18n. Each re-execution built a new provider and a
// new broker connection while the old one stayed alive: its WebSocket kept
// reconnecting, its subscriptions kept firing, and it kept parsing every
// telemetry frame for nobody. Over an editing session that stacked up one live
// provider per edit in the same tab (2026-10-29: 231 hot updates in six
// minutes, and a tab that ended in Chrome's "Out of Memory"). Disposing the
// outgoing instance keeps it to one. Dev-only by construction: `import.meta.hot`
// is undefined in a production build.
if (import.meta.hot) import.meta.hot.dispose(() => dataProvider.dispose())
