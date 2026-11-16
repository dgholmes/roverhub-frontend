import i18n from '@/i18n'
import { hashForSystemsPage } from '@/app/routes'
import type { TimelineEvent } from '@/types'
import type { LidarMountStatus } from '@/types/sensors'
import { LidarMoveAlerts } from './lidarMount'

/** Opens Systems › Sensors on one robot: the page reads `?robot=` once and
 * drops it from the address. */
export function hashForRobotSensors(siteId: string, robotId: string): string {
  return `${hashForSystemsPage(siteId, 'sensors')}?robot=${encodeURIComponent(robotId)}`
}

/** The robot a Sensors hash names with `?robot=`, if any. */
export function robotFromSensorsHash(hash: string): string | null {
  const m = hash.match(/^#\/site\/[^/]+\/systems\/sensors\?(?:[^#]*&)?robot=([^&#]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

/** One memory of what was alerted for the whole tab: every workspace stops
 * the live feed when it closes and the next one starts it again, and the
 * retained statuses replayed then must not ring the bell a second time. */
const TAB_ALERTS = new LidarMoveAlerts()

/**
 * The bell's "The lidar seems to have moved on {robot}": one warning when a
 * robot in Suggest starts reporting `differs` (LidarMoveAlerts says when),
 * linking to Systems › Sensors on that robot. Returns the unsubscribe.
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
