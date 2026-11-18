import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Send } from 'lucide-react'
import { Button } from '@/components/kit'
import { Section } from '@/components/fleet/v2/parts'
import { color, font, radius, space } from '@/design-system/tokens'
import { useCan } from '@/org/useCan'
import { robotsForSite } from '@/org/siteRobots'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import type { RobotState } from '@/types'
import type { SiteMap } from '@/types/maps'
import {
  robotMapMatch, robotsForMap, sendMapToRobot, SYNC_MAP_SCHEMA, syncBlock, syncOutcomeOf,
  type RobotMapMatch, type SyncOutcome,
} from './robotMaps'

const MATCH_DOT: Record<RobotMapMatch, string> = {
  same: color.green, differs: color.amber, unknown: color.t3, otherMap: color.t3,
}

/** After "Sent", the robot's next registration (every heartbeat, ~5 s) brings
 *  its new hash. Until then, or this long, Send stays away. */
const SENT_HOLD_MS = 30_000

/**
 * Missions › Maps' "Robot maps" (schema 0.0.26): each robot on the site that
 * is set up for this map or reports a map hash, whether it runs this floor
 * as shown (Same / Differs / Unknown), and -- for one that differs, to a
 * person with `configure` -- Send to robot, confirmed in place, then the
 * robot's answer. The bridge decides; this only says what it can see coming.
 */
export function MapRobotsSection({ map, floorIndex, maps }: {
  map: SiteMap
  floorIndex: number
  /** The site's maps, to name the one a robot is set up for instead. */
  maps: SiteMap[]
}) {
  const { t } = useTranslation()
  const all = useLiveOpsStore((s) => s.robots)
  const robots = useMemo(() => robotsForMap(robotsForSite(all, map.site_id), map.map_id), [all, map.site_id, map.map_id])
  const canSend = useCan('configure')
  const floorHash = map.floors.find((f) => f.index === floorIndex)?.content_hash ?? null
  const note: React.CSSProperties = { margin: 0, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }

  return (
    <Section title={t('missions.maps.robots.title')}>
      {robots.length === 0 && <p style={note}>{t('missions.maps.robots.none')}</p>}
      {robots.length > 0 && !floorHash && <p style={{ ...note, marginBottom: space[2] }}>{t('missions.maps.robots.noFloorHash')}</p>}
      {robots.length > 0 && (
        <ul aria-label={t('missions.maps.robots.title')} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: space[1] }}>
          {robots.map((r) => (
            // A new floor version is a new question: what was sent before is not its answer.
            <RobotMapRow
              key={`${r.robot_id}@${map.map_id}/${floorIndex}/${floorHash ?? ''}`}
              robot={r} map={map} floorIndex={floorIndex} floorHash={floorHash} maps={maps} canSend={canSend}
            />
          ))}
        </ul>
      )}
    </Section>
  )
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'confirming' }
  | { kind: 'sending' }
  | { kind: 'done'; outcome: SyncOutcome; at: number }

function RobotMapRow({ robot, map, floorIndex, floorHash, maps, canSend }: {
  robot: RobotState
  map: SiteMap
  floorIndex: number
  floorHash: string | null
  maps: SiteMap[]
  canSend: boolean
}) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [holding, setHolding] = useState(false)
  const mounted = useRef(true)
  // Set on every mount: StrictMode mounts twice, and the first cleanup ran.
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useEffect(() => {
    if (!holding) return
    const id = setTimeout(() => setHolding(false), SENT_HOLD_MS)
    return () => clearTimeout(id)
  }, [holding])

  const match = robotMapMatch(robot, map.map_id, floorHash)
  const block = syncBlock(robot)
  const navMap = robot.bridge?.nav_map_id ?? null
  const otherName = navMap ? (maps.find((m) => m.map_id === navMap)?.name ?? navMap) : null
  // Send is for a robot that differs, by a person who may configure robots,
  // and not again while a sent map is on its way back in the registration.
  const offerSend = canSend && match === 'differs' && !!floorHash && !holding
  const note: React.CSSProperties = { margin: 0, fontSize: font.size.sm, color: color.t2, lineHeight: 1.5 }

  const send = async () => {
    if (!floorHash) return
    setPhase({ kind: 'sending' })
    const outcome = syncOutcomeOf(t, await sendMapToRobot(robot.robot_id, { map_id: map.map_id, floor_index: floorIndex, map_hash: floorHash }))
    if (!mounted.current) return
    setPhase({ kind: 'done', outcome, at: Date.now() })
    if (outcome.ok) setHolding(true)
  }

  const blockText = block
    ? t(`missions.maps.robots.block.${block}`, block === 'oldBridge' ? { version: SYNC_MAP_SCHEMA } : undefined)
    : null

  return (
    <li data-robot={robot.robot_id} data-match={match} style={{
      display: 'grid', gap: space[2], padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.sm,
      background: phase.kind === 'confirming' ? color.amberBg : color.hover,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
        <span style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: color.t1, minWidth: 0 }}>{robot.name}</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: space[1], fontSize: font.size.sm, color: color.t2 }}>
          <span aria-hidden style={{ width: 8, height: 8, borderRadius: radius.full, background: MATCH_DOT[match], flexShrink: 0 }} />
          {t(`missions.maps.robots.match.${match}`)}
        </span>
        {match === 'otherMap' && otherName && (
          <span style={{ fontSize: font.size.sm, color: color.t3 }}>{t('missions.maps.robots.otherMap', { map: otherName })}</span>
        )}
        <span style={{ flex: 1 }} />
        {offerSend && (phase.kind === 'idle' || phase.kind === 'done') && (
          <Button size="sm" icon={Send} disabled={block !== null} title={blockText ?? undefined}
            onClick={() => setPhase({ kind: 'confirming' })}>
            {t('missions.maps.robots.send')}
          </Button>
        )}
      </div>
      {offerSend && blockText && phase.kind !== 'sending' && <p style={{ ...note, color: color.t3 }}>{blockText}</p>}
      {phase.kind === 'confirming' && (
        <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
          <span style={{ fontSize: font.size.sm, color: color.t1, flex: '1 1 220px', lineHeight: 1.5 }}>
            {t('missions.maps.robots.confirm', { robot: robot.name })}
          </span>
          <Button size="sm" variant="primary" disabled={block !== null} onClick={() => void send()}>
            {t('missions.maps.robots.confirmSend')}
          </Button>
          <Button size="sm" onClick={() => setPhase({ kind: 'idle' })}>{t('missions.maps.robots.cancel')}</Button>
        </div>
      )}
      {phase.kind === 'sending' && <p role="status" style={note}>{t('missions.maps.robots.sending')}</p>}
      {phase.kind === 'done' && <OutcomeLine outcome={phase.outcome} />}
    </li>
  )
}

function OutcomeLine({ outcome }: { outcome: SyncOutcome }) {
  const { t } = useTranslation()
  const line: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: space[2], fontSize: font.size.sm, lineHeight: 1.5 }
  const dot = (c: string) => <span aria-hidden style={{ width: 6, height: 6, marginTop: 7, borderRadius: radius.full, background: c, flexShrink: 0 }} />
  if (outcome.ok) {
    return (
      <div role="status" style={{ display: 'grid', gap: space[1] }}>
        <span style={{ ...line, color: color.t1 }}>{dot(color.green)}{t('missions.maps.robots.sent')}</span>
        {outcome.relocalise && <span style={{ ...line, color: color.amber }}>{dot(color.amber)}{t('missions.maps.robots.relocalise')}</span>}
      </div>
    )
  }
  return (
    <div role="alert" style={{ display: 'grid', gap: space[1], padding: `${space[1]}px ${space[2]}px`, borderRadius: radius.sm, background: color.redBg }}>
      <span style={{ ...line, color: color.red }}>{dot(color.red)}{t('missions.maps.robots.failed', { reason: outcome.reason })}</span>
      {outcome.detail && <span style={{ fontSize: font.size.xs, color: color.t2, lineHeight: 1.5, wordBreak: 'break-word' }}>{outcome.detail}</span>}
    </div>
  )
}
