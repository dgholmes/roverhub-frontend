import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Crosshair, Info } from 'lucide-react'
import { hashForSiteWorkspace } from '@/app/routes'
import { Badge, Button, IconButton, type Tone } from '@/components/kit'
import { Section } from '@/components/fleet/v2/parts'
import { color, font, radius, space } from '@/design-system/tokens'
import { useCan } from '@/org/useCan'
import { robotsForSite } from '@/org/siteRobots'
import { useSessionStore } from '@/store/useSessionStore'
import type { RobotState } from '@/types'
import type { SiteMap } from '@/types/maps'
import { usePutRoleReason } from './PutOnRobots'
import { blockText, putPlan, type RowState } from './putPlan'
import { robotOnFloor } from './robotMaps'
import { useProviderRobots } from './useProviderRobots'

export type { Act, RowState } from './putPlan'

const MATCH_DOT: Record<RowState, string> = {
  same: color.green, differs: color.amber, unknown: color.t3, otherMap: color.t3, noMap: color.t3,
}
const MATCH_TONE: Record<RowState, Tone> = {
  same: 'green', differs: 'amber', unknown: 'neutral', otherMap: 'neutral', noMap: 'neutral',
}
/** The summary's order: what is fine first, then what needs doing. */
const SUMMARY_ORDER: RowState[] = ['same', 'differs', 'otherMap', 'noMap', 'unknown']

/** Rows shown before "Show all N". */
export const ROWS_SHOWN = 3

/**
 * The Map workspace's "Robot maps" (schema 0.0.26), for a site with many
 * robots (operator, 2026-11-26): one line that sums them up -- "2 robots at
 * this site · 1 has this version · 1 has no map" -- then the first three rows
 * and "Show all N". A row is the robot's dot, name and whether it runs this
 * floor as shown (Same / Differs / Unknown / Other map / No map), Placed or
 * Not placed with Set position, and an info button for what stands in the
 * way of putting this floor on it.
 *
 * Putting the floor on robots is not done from the rows any more: it is the
 * panel's pinned "Put on robots…" and its chooser (PutOnRobots.tsx), which
 * sends each robot what it needs.
 */
export function MapRobotsSection({ map, floorIndex, maps, title }: {
  map: SiteMap
  floorIndex: number
  /** The section's heading; "Robot maps" by default. */
  title?: string
  /** The site's maps, to name the one a robot is set up for instead. */
  maps: SiteMap[]
}) {
  const { t } = useTranslation()
  // The provider's robots, as "Get it ready" above reads them: one source, so
  // the checklist and these rows never disagree about a robot.
  const all = useProviderRobots()
  const robots = useMemo(() => robotsForSite(all, map.site_id), [all, map.site_id])
  const [showAll, setShowAll] = useState(false)
  const floorHash = map.floors.find((f) => f.index === floorIndex)?.content_hash ?? null
  const note: React.CSSProperties = { margin: 0, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }

  const plans = robots.map((robot) => ({ robot, plan: putPlan(robot, map.map_id, floorHash) }))
  const counts = new Map<RowState, number>()
  for (const { plan } of plans) counts.set(plan.row, (counts.get(plan.row) ?? 0) + 1)
  const summary = [
    t('missions.maps.robots.summary.robots', { count: robots.length }),
    ...SUMMARY_ORDER.filter((s) => counts.has(s)).map((s) => t(`missions.maps.robots.summary.${s}`, { count: counts.get(s)! })),
  ].join(' · ')
  const shown = showAll ? plans : plans.slice(0, ROWS_SHOWN)

  return (
    <Section title={title ?? t('missions.maps.robots.title')}>
      {robots.length === 0 && <p style={note}>{t('missions.maps.robots.none')}</p>}
      {robots.length > 0 && <p data-robot-summary="" style={{ ...note, color: color.t2, marginBottom: space[2] }}>{summary}</p>}
      {robots.length > 0 && !floorHash && <p style={{ ...note, marginBottom: space[2] }}>{t('missions.maps.robots.noFloorHash')}</p>}
      {robots.length > 0 && (
        <ul aria-label={t('missions.maps.robots.title')} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: space[1] }}>
          {shown.map(({ robot, plan }) => (
            <RobotMapRow key={robot.robot_id} robot={robot} map={map} floorIndex={floorIndex} maps={maps} plan={plan} />
          ))}
        </ul>
      )}
      {plans.length > ROWS_SHOWN && (
        <div style={{ marginTop: space[1] }}>
          <Button size="sm" variant="ghost" data-show-all={showAll ? 'open' : 'closed'} aria-expanded={showAll}
            onClick={() => setShowAll((v) => !v)}>
            {showAll ? t('missions.maps.robots.showFewer') : t('missions.maps.robots.showAll', { count: plans.length })}
          </Button>
        </div>
      )}
    </Section>
  )
}

function RobotMapRow({ robot, map, floorIndex, maps, plan }: {
  robot: RobotState
  map: SiteMap
  floorIndex: number
  maps: SiteMap[]
  plan: ReturnType<typeof putPlan>
}) {
  const { t } = useTranslation()
  const canSend = useCan('configure')
  const role = usePutRoleReason()
  const [showWhy, setShowWhy] = useState(false)
  const state = plan.row
  const navMap = robot.bridge?.nav_map_id ?? null
  const otherName = navMap ? (maps.find((m) => m.map_id === navMap)?.name ?? navMap) : null
  const note: React.CSSProperties = { margin: 0, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }
  const setPosition = () => {
    useSessionStore.getState().setSelectedRobot(robot.robot_id)
    window.location.hash = hashForSiteWorkspace(map.site_id, 'LiveOps')
  }

  // Why this floor cannot be put on it now: behind the row's info button, not
  // a paragraph under every row (operator, 2026-11-26: "too texty"). To an
  // engineer, what stands in the way; to anyone else, the role it needs.
  const why = plan.act === null ? null
    : canSend ? (plan.block ? blockText(t, plan.block, plan.act) : null)
      : role
  const whyKind = !canSend ? 'role' : plan.act === 'use' ? 'useBlock' : 'block'
  // Placed: on this version, and the robot's position is localisation's on it.
  const placed = state === 'same' ? robotOnFloor(robot, map, floorIndex) : null

  return (
    <li data-robot={robot.robot_id} data-match={state} style={{
      display: 'grid', gap: space[2], padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.sm, background: color.hover,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap', minHeight: 32 }}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: radius.full, background: MATCH_DOT[state], flexShrink: 0 }} />
        <span style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.t1, minWidth: 0 }}>{robot.name}</span>
        <Badge tone={MATCH_TONE[state]} title={t(`missions.maps.robots.matchTitle.${state}`)}>{t(`missions.maps.robots.match.${state}`)}</Badge>
        {placed !== null && (
          <span data-placed={String(placed)}>
            <Badge tone={placed ? 'green' : 'amber'} title={t(placed ? 'missions.maps.robots.placedTitle' : 'missions.maps.robots.notPlacedTitle')}>
              {t(placed ? 'missions.maps.robots.placed' : 'missions.maps.robots.notPlaced')}
            </Badge>
          </span>
        )}
        {state === 'otherMap' && otherName && (
          <span style={{ fontSize: font.size.sm, color: color.t3 }}>{t('missions.maps.robots.otherMap', { map: otherName })}</span>
        )}
        <span style={{ flex: 1 }} />
        {why && (
          <IconButton size="sm" icon={Info} label={why} data-why={whyKind} data-use-block={whyKind === 'useBlock' ? plan.block ?? undefined : undefined}
            aria-expanded={showWhy} onClick={() => setShowWhy((v) => !v)} />
        )}
        {placed === false && (
          <Button size="sm" icon={Crosshair} onClick={setPosition}>{t('missions.maps.robots.setPosition')}</Button>
        )}
      </div>
      {why && showWhy && <p data-why-text="" style={{ ...note, color: color.t3 }}>{why}</p>}
    </li>
  )
}
