import { CircleStop, House } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ActionButton } from '@/components/liveops/mission/ActionButton'
import { getCommandAvailability } from '@/liveops/commandPolicy'
import { isReturningHome, returnHomeAvailability } from '@/liveops/returnHome'
import type { RobotRunView } from '@/liveops/robotRun'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { useSiteMapStore } from '@/store/useSiteMapStore'
import type { RobotState } from '@/types'
import type { SiteMap } from '@/types/maps'

const NO_MAPS: SiteMap[] = []

/**
 * Return home (RETURN, schema 0.0.33), and while the robot walks home, its
 * Cancel (NAV_CANCEL) in the same slot.
 *
 * The home is the one on the robot's OWN map and floor, looked up among all
 * the site's maps (`useSiteMapStore.maps`), never the map the page shows
 * (liveops/returnHome.ts). The backend checks the pose against the stored
 * home; a refusal there (`home_moved`, `home_missing`) means this console
 * holds an old map, so the maps are read again and the next press is right.
 */
export function ReturnHomeButton({ robot, run }: { robot: RobotState; run: RobotRunView }) {
  const { t } = useTranslation()
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)
  const dispatchCommandAsync = useLiveOpsStore((s) => s.dispatchCommandAsync)
  const maps = useSiteMapStore((s) => s.maps)
  const shown = useSiteMapStore((s) => s.map)

  if (isReturningHome(robot)) {
    return (
      <ActionButton
        icon={CircleStop}
        label={t('liveops.returnHome.cancel')}
        availability={getCommandAvailability(robot, 'NAV_CANCEL')}
        onClick={() => dispatchCommand(robot.robot_id, 'NAV_CANCEL', t('liveops.returnHome.cancelCommand'))}
      />
    )
  }

  const availability = returnHomeAvailability(robot, run, maps ?? (shown ? [shown] : NO_MAPS))
  const label = t('liveops.returnHome.button')
  return (
    <ActionButton
      icon={House}
      label={label}
      availability={availability}
      onClick={() => {
        const params = availability.params
        if (!availability.enabled || !params) return
        void dispatchCommandAsync(robot.robot_id, 'RETURN', t('liveops.returnHome.command'), { ...params })
          .then(({ result }) => { if (result === 'failed') void useSiteMapStore.getState().reload() })
      }}
    />
  )
}
