import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Crosshair, Info, MapPinned, Send } from 'lucide-react'
import { hashForSiteWorkspace } from '@/app/routes'
import { Badge, Button, IconButton, InlineAlertDialog, type Tone } from '@/components/kit'
import { Section } from '@/components/fleet/v2/parts'
import { color, font, radius, space } from '@/design-system/tokens'
import { useAuthStore } from '@/lib/auth/authStore'
import { useCan } from '@/org/useCan'
import { robotsForSite } from '@/org/siteRobots'
import { useSessionStore } from '@/store/useSessionStore'
import type { RobotState } from '@/types'
import type { SiteMap } from '@/types/maps'
import {
  navMapSwitchBlock, robotMapMatch, robotOnFloor, sendMapToRobot, sendUseNavMap, SYNC_MAP_SCHEMA, syncBlock, syncOutcomeOf,
  USE_NAV_MAP_SCHEMA, type RobotMapMatch, type SyncOutcome,
} from './robotMaps'
import { useProviderRobots } from './useProviderRobots'

/** A row's state: the match, or `noMap` for a robot set up for no map at all. */
type RowState = RobotMapMatch | 'noMap'

const MATCH_DOT: Record<RowState, string> = {
  same: color.green, differs: color.amber, unknown: color.t3, otherMap: color.t3, noMap: color.t3,
}
const MATCH_TONE: Record<RowState, Tone> = {
  same: 'green', differs: 'amber', unknown: 'neutral', otherMap: 'neutral', noMap: 'neutral',
}

/** After "Sent", the robot's next registration (every heartbeat, ~5 s) brings
 *  its new hash. Until then, or this long, Send stays away. */
const SENT_HOLD_MS = 30_000

/**
 * the Map workspace's "Robot maps" (schema 0.0.26): every robot at the map's
 * site, whether it runs this floor as shown (Same / Differs / Unknown / Other
 * map / No map), and, to a person with `configure`:
 *   - for one that differs, Send to robot (SYNC_MAP);
 *   - for one on another map or none, Use this map (USE_NAV_MAP, 0.0.29, map
 *     ready spec 4.4): its navigation restarts on this floor, and then it has
 *     to be placed with Set position.
 * Each is confirmed in place, then shows the robot's answer. Use this map is
 * not offered while the robot is offline, in E-Stop, on a mission or walking,
 * or on a bridge older than 0.0.29: the row says which instead. The bridge
 * decides; this only says what it can see coming.
 */
export function MapRobotsSection({ map, floorIndex, maps, ask = null, title }: {
  map: SiteMap
  floorIndex: number
  /** The section's heading; "Robot maps" by default. */
  title?: string
  /** The site's maps, to name the one a robot is set up for instead. */
  maps: SiteMap[]
  /** Open one row's question (Send to robot or Use this map) from elsewhere:
   *  the Map workspace's checklist does, rather than scrolling to the row.
   *  `nonce` asks again for the same robot. Asked only where the row offers it. */
  ask?: RobotMapAsk | null
}) {
  const { t } = useTranslation()
  // The provider's robots, as "Get it ready" above reads them: one source, so
  // the checklist and these rows never disagree about a robot.
  const all = useProviderRobots()
  const robots = useMemo(() => robotsForSite(all, map.site_id), [all, map.site_id])
  const canSend = useCan('configure')
  const floorHash = map.floors.find((f) => f.index === floorIndex)?.content_hash ?? null
  const note: React.CSSProperties = { margin: 0, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }

  return (
    <Section title={title ?? t('missions.maps.robots.title')}>
      {robots.length === 0 && <p style={note}>{t('missions.maps.robots.none')}</p>}
      {robots.length > 0 && !floorHash && <p style={{ ...note, marginBottom: space[2] }}>{t('missions.maps.robots.noFloorHash')}</p>}
      {robots.length > 0 && (
        <ul aria-label={t('missions.maps.robots.title')} style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: space[1] }}>
          {robots.map((r) => (
            // A new floor version is a new question: what was sent before is not its answer.
            <RobotMapRow
              key={`${r.robot_id}@${map.map_id}/${floorIndex}/${floorHash ?? ''}`}
              robot={r} map={map} floorIndex={floorIndex} floorHash={floorHash} maps={maps} canSend={canSend}
              ask={ask?.robotId === r.robot_id ? ask : null}
            />
          ))}
        </ul>
      )}
    </Section>
  )
}

/** Send to robot (`send`) or Use this map (`use`). */
export type Act = 'send' | 'use'

/** A question for one robot's row, asked from outside the section. */
export interface RobotMapAsk { robotId: string; act: Act; nonce: number }

type Phase =
  | { kind: 'idle' }
  | { kind: 'confirming'; act: Act }
  | { kind: 'sending'; act: Act }
  | { kind: 'done'; act: Act; outcome: SyncOutcome; at: number }

function RobotMapRow({ robot, map, floorIndex, floorHash, maps, canSend, ask }: {
  robot: RobotState
  map: SiteMap
  floorIndex: number
  floorHash: string | null
  maps: SiteMap[]
  canSend: boolean
  ask: RobotMapAsk | null
}) {
  const { t } = useTranslation()
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' })
  const [holding, setHolding] = useState(false)
  const mounted = useRef(true)
  // Focus goes back to the button that asked when the question is put away.
  const sendButton = useRef<HTMLButtonElement>(null)
  const useButton = useRef<HTMLButtonElement>(null)
  const askId = useId()
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
  const state: RowState = navMap === null && match === 'unknown' ? 'noMap' : match
  const otherName = navMap ? (maps.find((m) => m.map_id === navMap)?.name ?? navMap) : null
  // Send is for a robot that differs, by a person who may configure robots,
  // and not again while a sent map is on its way back in the registration.
  const offerSend = canSend && match === 'differs' && !!floorHash && !holding
  // Use this map is for a robot on another map or none. Not offered at all
  // while something stands in the way: the row says what instead.
  const wantsUse = (state === 'otherMap' || state === 'noMap') && !!floorHash
  const useBlock = navMapSwitchBlock(robot)
  const offerUse = canSend && wantsUse && !holding && useBlock === null
  // This person may not send or use: say why instead of hiding the button
  // without a word. An owner/admin only has to turn Engineer tools on (it is
  // off after every sign-in).
  const canSwitchOn = useAuthStore((s) => s.status === 'signedIn' && s.user?.can_use_engineer_tools === true)
  const whyNoSend = !canSend && ((match === 'differs' && !!floorHash) || wantsUse)
    ? t(canSwitchOn ? 'missions.maps.robots.needsEngineerTools' : 'missions.maps.robots.needsEngineer')
    : null
  const note: React.CSSProperties = { margin: 0, fontSize: font.size.sm, color: color.t2, lineHeight: 1.5 }
  const [showWhy, setShowWhy] = useState(false)
  const setPosition = () => {
    useSessionStore.getState().setSelectedRobot(robot.robot_id)
    window.location.hash = hashForSiteWorkspace(map.site_id, 'LiveOps')
  }

  const send = async (act: Act) => {
    if (!floorHash) return
    setPhase({ kind: 'sending', act })
    const params = { map_id: map.map_id, floor_index: floorIndex, map_hash: floorHash }
    const outcome = syncOutcomeOf(t, await (act === 'use' ? sendUseNavMap : sendMapToRobot)(robot.robot_id, params))
    if (!mounted.current) return
    setPhase({ kind: 'done', act, outcome, at: Date.now() })
    if (outcome.ok) setHolding(true)
  }

  const blockText = block
    ? t(`missions.maps.robots.block.${block}`, block === 'oldBridge' ? { version: SYNC_MAP_SCHEMA } : undefined)
    : null
  // To an engineer only: anyone else is told about the role instead.
  const useBlockText = canSend && wantsUse && useBlock && !holding
    ? t(`missions.maps.robots.block.${useBlock}`, useBlock === 'oldBridge' ? { version: USE_NAV_MAP_SCHEMA } : undefined)
    : null
  const idle = phase.kind === 'idle' || phase.kind === 'done'
  // A question asked from outside (the checklist's Send to robot / Use this
  // map): opened here, once per ask, and only where the row would offer it.
  const [askedNonce, setAskedNonce] = useState<number | null>(null)
  if (ask && ask.nonce !== askedNonce) {
    setAskedNonce(ask.nonce)
    const offered = ask.act === 'use' ? offerUse : offerSend && block === null
    if (offered && idle) setPhase({ kind: 'confirming', act: ask.act })
  }
  // An open question closes when what it asks is no longer on offer: the
  // person lost `configure`, or the robot went offline, into E-Stop, onto a
  // mission or a walk. Asking again starts from the button and its reason.
  if (phase.kind === 'confirming' && !(phase.act === 'use' ? offerUse : offerSend && block === null)) {
    setPhase({ kind: 'idle' })
  }

  // Why the row offers what it does, or nothing: behind the row's info button,
  // not a paragraph under every row (operator, 2026-11-26: "too texty").
  const sendWhy = phase.kind !== 'sending' && offerSend && blockText ? blockText : null
  const useWhy = phase.kind !== 'sending' ? useBlockText : null
  const why = sendWhy ?? useWhy ?? whyNoSend
  const whyKind = sendWhy ? 'block' : useWhy ? 'useBlock' : 'role'
  // Placed: on this version, and the robot's position is localisation's on it.
  const placed = state === 'same' ? robotOnFloor(robot, map, floorIndex) : null

  return (
    <li data-robot={robot.robot_id} data-match={state} style={{
      display: 'grid', gap: space[2], padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.sm, scrollMarginTop: space[4],
      background: phase.kind === 'confirming' ? color.amberBg : color.hover,
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
        {match === 'otherMap' && otherName && (
          <span style={{ fontSize: font.size.sm, color: color.t3 }}>{t('missions.maps.robots.otherMap', { map: otherName })}</span>
        )}
        <span style={{ flex: 1 }} />
        {why && (
          <IconButton size="sm" icon={Info} label={why} data-why={whyKind} data-use-block={whyKind === 'useBlock' ? useBlock ?? undefined : undefined}
            aria-expanded={showWhy} onClick={() => setShowWhy((v) => !v)} />
        )}
        {placed === false && phase.kind === 'idle' && (
          <Button size="sm" icon={Crosshair} onClick={setPosition}>{t('missions.maps.robots.setPosition')}</Button>
        )}
        {offerSend && idle && (
          <Button ref={sendButton} size="sm" icon={Send} disabled={block !== null} title={blockText ?? undefined}
            onClick={() => setPhase({ kind: 'confirming', act: 'send' })}>
            {t('missions.maps.robots.send')}
          </Button>
        )}
        {offerUse && idle && (
          <Button ref={useButton} size="sm" icon={MapPinned} onClick={() => setPhase({ kind: 'confirming', act: 'use' })}>
            {t('missions.maps.robots.use')}
          </Button>
        )}
      </div>
      {why && showWhy && <p data-why-text="" style={{ ...note, color: color.t3 }}>{why}</p>}
      {phase.kind === 'confirming' && (
        // Named by its answer ("Send", "Use this map"), described by what it does.
        <InlineAlertDialog key={phase.act} labelledBy={`${askId}-go`} describedBy={`${askId}-text`}
          returnFocus={phase.act === 'use' ? useButton : sendButton} onClose={() => setPhase({ kind: 'idle' })}
          style={{ display: 'flex', alignItems: 'center', gap: space[2], flexWrap: 'wrap' }}>
          <span id={`${askId}-text`} style={{ fontSize: font.size.sm, color: color.t1, flex: '1 1 220px', lineHeight: 1.5 }}>
            {t(phase.act === 'use' ? 'missions.maps.robots.useConfirm' : 'missions.maps.robots.confirm', { robot: robot.name })}
          </span>
          <Button id={`${askId}-go`} size="sm" variant="primary" disabled={(phase.act === 'use' ? useBlock : block) !== null}
            onClick={() => void send(phase.act)}>
            {t(phase.act === 'use' ? 'missions.maps.robots.confirmUse' : 'missions.maps.robots.confirmSend')}
          </Button>
          <Button size="sm" data-autofocus onClick={() => setPhase({ kind: 'idle' })}>{t('missions.maps.robots.cancel')}</Button>
        </InlineAlertDialog>
      )}
      {phase.kind === 'sending' && (
        <p role="status" style={note}>{t(phase.act === 'use' ? 'missions.maps.robots.using' : 'missions.maps.robots.sending')}</p>
      )}
      {phase.kind === 'done' && (
        <OutcomeLine outcome={phase.outcome} act={phase.act} onSetPosition={setPosition} />
      )}
    </li>
  )
}

function OutcomeLine({ outcome, act, onSetPosition }: { outcome: SyncOutcome; act: Act; onSetPosition: () => void }) {
  const { t } = useTranslation()
  const line: React.CSSProperties = { display: 'flex', alignItems: 'flex-start', gap: space[2], fontSize: font.size.sm, lineHeight: 1.5 }
  const dot = (c: string) => <span aria-hidden style={{ width: 6, height: 6, marginTop: 7, borderRadius: radius.full, background: c, flexShrink: 0 }} />
  if (outcome.ok) {
    return (
      <div role="status" style={{ display: 'grid', gap: space[1] }}>
        <span style={{ ...line, color: color.t1 }}>{dot(color.green)}{t(act === 'use' ? 'missions.maps.robots.used' : 'missions.maps.robots.sent')}</span>
        {outcome.relocalise && <span style={{ ...line, color: color.amber }}>{dot(color.amber)}{t('missions.maps.robots.relocalise')}</span>}
        {/* Use this map always leaves the robot unplaced: Set position is the next step. */}
        {act === 'use' && (
          <div><Button size="sm" icon={Crosshair} onClick={onSetPosition}>{t('missions.maps.robots.setPosition')}</Button></div>
        )}
      </div>
    )
  }
  return (
    <div role="alert" style={{ display: 'grid', gap: space[1], padding: `${space[1]}px ${space[2]}px`, borderRadius: radius.sm, background: color.redBg }}>
      <span style={{ ...line, color: color.red }}>{dot(color.red)}{t(act === 'use' ? 'missions.maps.robots.useFailed' : 'missions.maps.robots.failed', { reason: outcome.reason })}</span>
      {outcome.detail && <span style={{ fontSize: font.size.xs, color: color.t2, lineHeight: 1.5, wordBreak: 'break-word' }}>{outcome.detail}</span>}
    </div>
  )
}
