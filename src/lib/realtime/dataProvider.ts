import { mockDataProvider } from '@/mocks/mockDataProvider'
import { RealDataProvider } from './realDataProvider'

const USE_REAL_BACKEND = import.meta.env.VITE_USE_REAL_BACKEND === 'true'

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
export const dataProvider = USE_REAL_BACKEND
  ? new RealDataProvider({
      wsUrl: import.meta.env.VITE_MQTT_WS_URL ?? 'ws://localhost:9001',
      apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000',
      siteId: import.meta.env.VITE_SITE_ID || undefined,
    })
  : mockDataProvider
