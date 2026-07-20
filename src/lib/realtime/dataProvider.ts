import { mockDataProvider } from '@/mocks/mockDataProvider'
import { RealDataProvider } from './realDataProvider'

const USE_REAL_BACKEND = import.meta.env.VITE_USE_REAL_BACKEND === 'true'

export const dataProvider = USE_REAL_BACKEND
  ? new RealDataProvider({
      wsUrl: import.meta.env.VITE_MQTT_WS_URL ?? 'ws://localhost:9001',
      siteId: import.meta.env.VITE_SITE_ID ?? 'site-dev',
      robotId: import.meta.env.VITE_ROBOT_ID ?? 'robot-dev-01',
      robotName: 'Dev Robot',
    })
  : mockDataProvider
