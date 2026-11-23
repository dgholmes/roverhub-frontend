import i18n from '@/i18n'
import { navMapSwitchBlock, type SyncBlock } from '@/components/maps/robotMaps'
import type { SurveyCommandResult } from '@/survey/surveyCommands'
import { SITE_ID_PATTERN } from '@/types/commands'

/** Why Move to site is not offered now, or null: Use this map's blockers
 *  (offline, a bridge older than 0.0.29, E-Stop, a mission, a walk), and
 *  `control` while anyone holds the robot -- the bridge restarts, which would
 *  drop a person's control mid-drive, so it refuses REJECTED_CONTROL_HELD. */
export type MoveSiteBlock = SyncBlock | 'control'

export function moveSiteBlock(
  robot: Parameters<typeof navMapSwitchBlock>[0],
  now = Date.now(),
): MoveSiteBlock | null {
  return navMapSwitchBlock(robot, now) ?? (robot.control_owner ? 'control' : null)
}

/**
 * Move to site (SET_SITE, schema 0.0.29): a robot's site was SITE_ID in its
 * bridge's .env, fixed by hand. SET_SITE asks the bridge to move: it refuses
 * unless the robot is idle, clears its map choice (a map belongs to one site)
 * and restarts itself under the new site, so its topics move to
 * roverhub/<site>/<robot>/... The robot then shows at the new site with no
 * map; Use this map loads one. The backend checks the site exists and that the
 * user may configure both sites, and refuses first for an older bridge.
 *
 * The store is imported on send, so the Devices page does not build it by
 * import (its tests mock the provider with only what they read).
 */
export async function setRobotSite(robotId: string, siteId: string): Promise<SurveyCommandResult & { noAnswer?: boolean }> {
  // The id becomes a topic level: refused here, before anything is sent, rather
  // than as a 422 after a round trip.
  if (!SITE_ID_PATTERN.test(siteId)) return { ok: false, error: i18n.t('devices.moveSite.badSite') }
  const [{ useLiveOpsStore }, { commandResultOf }] = await Promise.all([
    import('@/store/useLiveOpsStore'), import('@/survey/surveyCommands'),
  ])
  const outcome = await useLiveOpsStore.getState().dispatchCommandAsync(
    robotId, 'SET_SITE', i18n.t('devices.moveSite.commandLabel', { site: siteId }), { site_id: siteId },
  )
  // No answer is not a refusal: the bridge may have moved and restarted
  // before its ack got out (the link drops as it exits).
  if (outcome.result === 'unknown') return { ...commandResultOf(outcome), noAnswer: true }
  return commandResultOf(outcome)
}
