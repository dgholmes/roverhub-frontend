import { useEffect, useState } from 'react'
import { dataProvider } from '@/lib/realtime/dataProvider'
import type { RobotState } from '@/types'

/** The robots as the provider reports them, live. Read here rather than from
 * the LiveOps store so the Maps page and its editor stay free of it (the store
 * builds the provider's subscriptions when first imported). */
export function useProviderRobots(): RobotState[] {
  const [robots, setRobots] = useState<RobotState[]>(() => dataProvider.getRobots())
  useEffect(() => dataProvider.subscribeTelemetry((next) => setRobots(next)), [])
  return robots
}
