import { useEffect, useState } from 'react'
import { dataProvider } from '@/lib/realtime/dataProvider'
import type { LidarMountStatus } from '@/types/sensors'

/** Every robot's latest LidarMountStatus, robot_id -> status, live. Empty
 * until the first (retained) status arrives. */
export function useLidarMounts(): Readonly<Record<string, LidarMountStatus>> {
  const [byRobot, setByRobot] = useState<Readonly<Record<string, LidarMountStatus>>>({})
  useEffect(() => dataProvider.subscribeLidarMount((status) => {
    setByRobot((prev) => ({ ...prev, [status.robot_id]: status }))
  }), [])
  return byRobot
}
