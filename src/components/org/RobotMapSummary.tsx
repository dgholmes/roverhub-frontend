import { useTranslation } from 'react-i18next'
import { hashForMap } from '@/app/routes'
import { Badge } from '@/components/kit'
import { color, font, space } from '@/design-system/tokens'
import { robotMapInfo, type RobotMapInfo } from '@/org/robotMapInfo'
import type { RobotState } from '@/types'
import type { SiteMap } from '@/types/maps'

const VERSION_TONE = { same: 'green', differs: 'amber', unknown: 'neutral' } as const

/**
 * A robot's map in one line: the map's name (opening it in the Map
 * workspace), whether the robot runs its current version, and whether it has
 * been placed on it. Fleet's robot details and Org › Sites' Robots tab.
 * `maps` is the robot's site's maps, null while they load.
 */
export function RobotMapSummary({ robot, maps }: {
  robot: Pick<RobotState, 'bridge' | 'site_id'>
  maps: readonly SiteMap[] | null
}) {
  const info = robotMapInfo(robot, maps)
  return <RobotMapInfoLine info={info} siteId={robot.site_id} loading={maps === null} />
}

export function RobotMapInfoLine({ info, siteId, loading }: { info: RobotMapInfo; siteId: string; loading?: boolean }) {
  const { t } = useTranslation()
  const muted: React.CSSProperties = { color: color.t3, fontWeight: font.weight.regular }
  const placed = info.placed === true
    ? <Badge tone="green">{t('orgSites.robotMap.placed')}</Badge>
    : info.placed === false ? <Badge>{t('orgSites.robotMap.notPlaced')}</Badge> : null

  return (
    <span data-robot-map={info.kind} style={{ display: 'inline-flex', alignItems: 'center', gap: space[1], flexWrap: 'wrap', justifyContent: 'flex-end', minWidth: 0 }}>
      {info.kind === 'noMap' && <span style={muted}>{t('orgSites.robotMap.noMap')}</span>}
      {info.kind === 'elsewhere' && (
        <span style={muted} title={loading ? undefined : t('orgSites.robotMap.elsewhereTitle')}>
          {loading ? info.mapId : t('orgSites.robotMap.elsewhere', { map: info.mapId })}
        </span>
      )}
      {info.kind === 'onMap' && (
        <>
          <a href={hashForMap(siteId, info.map.map_id)} style={{ color: color.accent, fontWeight: font.weight.semibold }}>
            {info.map.name}
          </a>
          <Badge tone={VERSION_TONE[info.version]} title={t(`orgSites.robotMap.versionTitle.${info.version}`)}>
            {t(`orgSites.robotMap.version.${info.version}`)}
          </Badge>
        </>
      )}
      {placed}
    </span>
  )
}
