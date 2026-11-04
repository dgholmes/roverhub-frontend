import { mockDataProvider } from '@/mocks/mockDataProvider'
import { useAuthStore } from '@/lib/auth/authStore'
import { RealDataProvider } from './realDataProvider'
import { brokerSessionFor } from './brokerSession'
import { API_BASE_URL, MQTT_WS_URL, SITE_FILTER, USE_REAL_BACKEND } from './backendConfig'

// Defined in ./backendConfig (so the session layer can read them without the
// providers); re-exported because every caller already imports them from here.
export { API_BASE_URL, MQTT_WS_URL, SITE_FILTER, USE_REAL_BACKEND }

export const dataProvider = USE_REAL_BACKEND
  ? new RealDataProvider({
    wsUrl: MQTT_WS_URL, apiBaseUrl: API_BASE_URL, siteId: SITE_FILTER,
    brokerSession: brokerSessionFor(useAuthStore.getState()),
  })
  : mockDataProvider

// The broker login follows the session: signing in connects as that user,
// signing out drops the connection. Components never see this.
const unsubscribeSession = dataProvider instanceof RealDataProvider
  ? useAuthStore.subscribe((s) => (dataProvider as RealDataProvider).setBrokerSession(brokerSessionFor(s)))
  : () => {}

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
if (import.meta.hot) import.meta.hot.dispose(() => { unsubscribeSession(); dataProvider.dispose() })
