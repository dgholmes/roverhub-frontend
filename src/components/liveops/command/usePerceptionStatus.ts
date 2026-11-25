import { useEffect, useState } from 'react'
import { dataProvider } from '@/lib/realtime/dataProvider'
import type { PerceptionStatus } from '@/types'

/** The robot's latest perception status (retained perception/status), or
 * undefined when its perception never sent one. Follows the robot: a new
 * robot id reads its own status at once, never the previous robot's. */
export function usePerceptionStatus(robotId: string): PerceptionStatus | undefined {
  const [latest, setLatest] = useState<{ robotId: string; status: PerceptionStatus | undefined }>(
    () => ({ robotId, status: dataProvider.getPerceptionStatus(robotId) }),
  )
  useEffect(() => {
    setLatest({ robotId, status: dataProvider.getPerceptionStatus(robotId) })
    return dataProvider.subscribePerceptionStatus(robotId, (status) => setLatest({ robotId, status }))
  }, [robotId])
  return latest.robotId === robotId ? latest.status : dataProvider.getPerceptionStatus(robotId)
}
