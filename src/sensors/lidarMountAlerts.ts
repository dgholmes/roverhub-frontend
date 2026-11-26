import i18n from '@/i18n'
import { hashForFleet } from '@/app/routes'
import type { TimelineEvent } from '@/types'
import type { LidarMountStatus } from '@/types/sensors'
import { LidarMoveAlerts } from './lidarMount'

/** Opens one robot's Sensors tab in Fleet. */
export function hashForRobotSensors(siteId: string, robotId: string): string {
  return hashForFleet(siteId, { robotId, inspectorTab: 'sensors' })
}

/** One memory of what was alerted for the whole tab: every workspace stops
 * the live feed when it closes and the next one starts it again, and the
 * retained statuses replayed then must not ring the bell a second time. */
const TAB_ALERTS = new LidarMoveAlerts()

/**
 * The bell's "The lidar seems to have moved on {robot}": one warning when a
 * robot in Suggest starts reporting `differs` (LidarMoveAlerts says when),
 * linking to that robot's Sensors tab in Fleet. Returns the unsubscribe.
 */
export function watchLidarMoves(
  subscribe: (listener: (status: LidarMountStatus) => void) => () => void,
  robotName: (robotId: string) => string,
  emit: (event: TimelineEvent) => void,
  now: () => number = Date.now,
  alerts: LidarMoveAlerts = TAB_ALERTS,
): () => void {
  return subscribe((status) => {
    if (!alerts.observe(status)) return
    const at = now()
    emit({
      event_id: `lidar-moved-${status.robot_id}-${at}`,
      source: 'edge',
      severity: 'warning',
      message: i18n.t('sensors.alert.moved', { robot: robotName(status.robot_id) }),
      ts: new Date(at).toISOString(),
      acknowledged: false,
      link: { href: hashForRobotSensors(status.site_id, status.robot_id), label: i18n.t('sensors.alert.open') },
    })
  })
}
