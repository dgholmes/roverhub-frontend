import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Crosshair, Send } from 'lucide-react'
import { hashForSiteWorkspace } from '@/app/routes'
import { Badge, Button, type Tone } from '@/components/kit'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { color, font, radius, space } from '@/design-system/tokens'
import { useAuthStore } from '@/lib/auth/authStore'
import { useTouchShell } from '@/lib/useTouchShell'
import { robotsForSite } from '@/org/siteRobots'
import { useCan } from '@/org/useCan'
import { useSessionStore } from '@/store/useSessionStore'
import type { RobotState } from '@/types'
import type { SiteMap } from '@/types/maps'
import { errorText } from './mapPipeline'
import { actionable, blockText, putPlan, type Act, type PutPlan, type PutState } from './putPlan'
import { sendMapToRobot, sendUseNavMap, syncOutcomeOf, type SyncOutcome } from './robotMaps'
import { useProviderRobots } from './useProviderRobots'

/** After "Sent", the robot's next registration (every heartbeat, ~5 s) brings
 *  its new hash. Until then, or this long, it is not offered again. */
export const SENT_HOLD_MS = 30_000

const STATE_TONE: Record<PutState | 'held', Tone> = {
  upToDate: 'green', update: 'amber', switch: 'blue', offline: 'neutral', busy: 'neutral', cannot: 'red',
  unknown: 'neutral', held: 'green',
}
const STATE_DOT: Record<PutState | 'held', string> = {
  upToDate: color.green, update: color.amber, switch: color.blue, offline: color.t4, busy: color.t3, cannot: color.red,
  unknown: color.t3, held: color.green,
}

/** Why this person may not put a map on a robot, or null when they may
 *  (`configure`). An owner/admin only has to turn Engineer tools on (it is off
 *  after every sign-in). */
export function usePutRoleReason(): string | null {
  const { t } = useTranslation()
  const canConfigure = useCan('configure')
  const canSwitchOn = useAuthStore((s) => s.status === 'signedIn' && s.user?.can_use_engineer_tools === true)
  return canConfigure ? null : t(canSwitchOn ? 'missions.maps.robots.needsEngineerTools' : 'missions.maps.robots.needsEngineer')
}

const floorHashOf = (map: SiteMap, floorIndex: number) => map.floors.find((f) => f.index === floorIndex)?.content_hash ?? null

/**
 * The primary "Put on robots…" (2026-11-26: "send to robot brings out the
 * robot list and we select which robots to send … at the bottom so it is
 * noticeable"). Off, with the reason under it, for someone without
 * `configure`, at a site with no robot, or on a floor with no version.
 */
export function PutOnRobotsButton({ map, floorIndex, onOpen }: { map: SiteMap; floorIndex: number; onOpen: () => void }) {
  const { t } = useTranslation()
  const all = useProviderRobots()
  const count = useMemo(() => robotsForSite(all, map.site_id).length, [all, map.site_id])
  const role = usePutRoleReason()
  const why = role ?? (count === 0 ? t('missions.maps.robots.put.noRobots')
    : !floorHashOf(map, floorIndex) ? t('missions.maps.robots.put.noFloorHash') : null)
  return (
    <div data-put-on-robots-action={why ? 'off' : 'on'} style={{ display: 'grid', gap: space[1] }}>
      {/* The reason is on the wrapper too: a disabled button gets no hover in every browser. */}
      <span title={why ?? undefined} style={{ display: 'grid' }}>
        <Button variant="primary" icon={Send} disabled={why !== null} aria-haspopup="dialog"
          title={why ?? t('missions.maps.robots.put.openHint')} onClick={onOpen} style={{ width: '100%', justifyContent: 'center' }}>
          {t('missions.maps.robots.put.open')}
        </Button>
      </span>
      {why && <p data-put-why="" style={{ margin: 0, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }}>{why}</p>}
    </div>
  )
}

type Result =
  | { phase: 'sending'; act: Act }
  | { phase: 'done'; act: Act; outcome: SyncOutcome }

interface Row { robot: RobotState; plan: PutPlan; key: string }

/**
 * The chooser: the site's robots as a checklist, each with what putting this
 * floor on it would do -- Up to date, Will be updated (SYNC_MAP), Will switch
 * to this map (USE_NAV_MAP), or Offline / Busy / Can't take this map with the
 * reason, off. Those that need it are ticked (only `preselect` when given: the
 * Setup checklist's step for one robot). "Put on N robots" sends each its own
 * command, with the same params and guards the per-row buttons had, then shows
 * each robot's answer; failures stay. A full-width sheet on a narrow screen.
 *
 * `session` changes on every opening, which starts the ticks afresh. Keep it
 * mounted while closed: a sent robot stays held for SENT_HOLD_MS, so it is not
 * offered again before its registration brings the new version.
 */
export function PutOnRobotsDialog({ map, floorIndex, maps, open, session, preselect = null, onClose }: {
  map: SiteMap
  floorIndex: number
  /** The site's maps, to name the one a robot is set up for instead. */
  maps: SiteMap[]
  open: boolean
  session: number
  preselect?: string | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { narrow } = useTouchShell()
  const all = useProviderRobots()
  const robots = useMemo(() => robotsForSite(all, map.site_id), [all, map.site_id])
  const canConfigure = useCan('configure')
  const role = usePutRoleReason()
  const floorHash = floorHashOf(map, floorIndex)
  const floor = map.floors.find((f) => f.index === floorIndex)
  const listId = useId()

  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [results, setResults] = useState<Record<string, Result>>({})
  // `robot@map/floor/hash` of what was sent: a new version is a new question.
  const [held, setHeld] = useState<Record<string, true>>({})
  const [initFor, setInitFor] = useState<number | null>(null)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  useEffect(() => {
    if (Object.keys(held).length === 0) return
    const id = setTimeout(() => setHeld({}), SENT_HOLD_MS)
    return () => clearTimeout(id)
  }, [held])

  const rows: Row[] = robots.map((robot) => ({
    robot, plan: putPlan(robot, map.map_id, floorHash), key: `${robot.robot_id}@${map.map_id}/${floorIndex}/${floorHash ?? ''}`,
  }))
  const sending = Object.values(results).some((r) => r.phase === 'sending')
  const selectable = (r: Row) => canConfigure && actionable(r.plan) && !held[r.key] && results[r.robot.robot_id]?.phase !== 'sending'
  const needing = rows.filter(selectable)
  const chosen = needing.filter((r) => selected.has(r.robot.robot_id))

  // A new opening: tick what needs it (or only the robot asked for), and put
  // away the answers of the last one -- unless a send is still on its way.
  if (open && initFor !== session) {
    setInitFor(session)
    setSelected(new Set(needing.filter((r) => preselect === null || r.robot.robot_id === preselect).map((r) => r.robot.robot_id)))
    if (!sending) setResults({})
  }

  const toggle = (id: string, on: boolean) => setSelected((s) => {
    const next = new Set(s)
    if (on) next.add(id)
    else next.delete(id)
    return next
  })

  const put = async () => {
    if (!floorHash || chosen.length === 0) return
    const going = chosen.map((r) => ({ ...r, act: r.plan.act as Act }))
    setSelected(new Set())
    setResults((all) => ({ ...all, ...Object.fromEntries(going.map((r) => [r.robot.robot_id, { phase: 'sending', act: r.act } as Result])) }))
    const params = { map_id: map.map_id, floor_index: floorIndex, map_hash: floorHash }
    await Promise.all(going.map(async ({ robot, act, key }) => {
      let outcome: SyncOutcome
      try {
        outcome = syncOutcomeOf(t, await (act === 'use' ? sendUseNavMap : sendMapToRobot)(robot.robot_id, params))
      } catch (e) {
        outcome = { ok: false, reason: errorText(e), detail: null }
      }
      if (!mounted.current) return
      setResults((all) => ({ ...all, [robot.robot_id]: { phase: 'done', act, outcome } }))
      if (outcome.ok) setHeld((h) => ({ ...h, [key]: true }))
    }))
  }

  const setPosition = (robotId: string) => {
    useSessionStore.getState().setSelectedRobot(robotId)
    onClose()
    window.location.hash = hashForSiteWorkspace(map.site_id, 'LiveOps')
  }

  const anyResult = Object.keys(results).length > 0
  const switching = chosen.some((r) => r.plan.act === 'use')
  const small: React.CSSProperties = { margin: 0, fontSize: font.size.sm, color: color.t3, lineHeight: 1.5 }
  // Narrow, a sheet along the bottom edge, full width; else the usual dialog.
  const sheet = narrow
    ? 'left-0 right-0 top-auto bottom-0 max-w-none translate-x-0 translate-y-0 rounded-t-xl rounded-b-none sm:rounded-b-none'
    : undefined

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next && !sending) onClose() }}>
      <DialogContent data-put-on-robots={map.map_id} data-sheet={narrow ? 'true' : undefined} className={sheet} style={{
        background: color.elevated, border: 'none', color: color.t1, maxHeight: narrow ? '85vh' : '80vh',
        display: 'flex', flexDirection: 'column', gap: space[3], padding: space[5],
      }}>
        <DialogHeader>
          <DialogTitle style={{ color: color.t1 }}>{t('missions.maps.robots.put.title', { map: map.name })}</DialogTitle>
          <DialogDescription style={{ color: color.t2 }}>
            {t('missions.maps.robots.put.body', {
              floor: floor?.label ?? t('liveops.map.floorN', { index: floorIndex }), hash: (floorHash ?? '').slice(0, 12),
            })}
          </DialogDescription>
        </DialogHeader>

        <div style={{ display: 'flex', gap: space[2], flexWrap: 'wrap' }}>
          <Button size="sm" variant="ghost" disabled={needing.length === 0 || sending}
            onClick={() => setSelected(new Set(needing.map((r) => r.robot.robot_id)))}>
            {t('missions.maps.robots.put.selectNeeding')}
          </Button>
          <Button size="sm" variant="ghost" disabled={chosen.length === 0 || sending} onClick={() => setSelected(new Set())}>
            {t('missions.maps.robots.put.clear')}
          </Button>
        </div>

        {rows.length === 0 ? <p style={small}>{t('missions.maps.robots.put.noRobots')}</p> : (
          <ul id={listId} aria-label={t('missions.maps.robots.put.listAria')} style={{
            listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: space[1], overflow: 'auto', minHeight: 0,
          }}>
            {rows.map((r) => {
              const id = r.robot.robot_id
              const state: PutState | 'held' = held[r.key] && r.plan.state !== 'upToDate' ? 'held' : r.plan.state
              const can = selectable(r)
              const checked = can && selected.has(id)
              const navMap = r.robot.bridge?.nav_map_id ?? null
              const otherName = r.plan.row === 'otherMap' && navMap ? maps.find((m) => m.map_id === navMap)?.name ?? navMap : null
              const reason = state === 'held' ? t('missions.maps.robots.put.stateTitle.held')
                : r.plan.block ? blockText(t, r.plan.block, r.plan.act)
                  : r.plan.act !== null && role ? role
                    : state === 'unknown' ? t(floorHash ? 'missions.maps.robots.matchTitle.unknown' : 'missions.maps.robots.put.noFloorHash')
                      : null
              const result = results[id]
              return (
                <li key={id} data-robot={id} data-put-state={state} data-act={r.plan.act ?? undefined} style={{
                  display: 'grid', gap: space[1], padding: `${space[2]}px ${space[3]}px`, borderRadius: radius.sm,
                  background: checked ? color.selected : color.hover,
                }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: space[2], minHeight: 28, flexWrap: 'wrap', cursor: can ? 'pointer' : 'default' }}>
                    <input type="checkbox" checked={checked} disabled={!can} onChange={(e) => toggle(id, e.target.checked)}
                      style={{ width: 16, height: 16, margin: 0, accentColor: color.accentSolid, flexShrink: 0 }} />
                    <span aria-hidden style={{ width: 8, height: 8, borderRadius: radius.full, background: STATE_DOT[state], flexShrink: 0 }} />
                    <span style={{ fontSize: font.size.md, fontWeight: font.weight.bold, color: can || state === 'upToDate' ? color.t1 : color.t2, minWidth: 0 }}>
                      {r.robot.name}
                    </span>
                    {otherName && <span style={{ fontSize: font.size.sm, color: color.t3 }}>{t('missions.maps.robots.otherMap', { map: otherName })}</span>}
                    <span style={{ flex: 1 }} />
                    <Badge tone={STATE_TONE[state]} title={state === 'upToDate' ? t('missions.maps.robots.put.stateTitle.upToDate') : reason ?? undefined}>
                      {t(`missions.maps.robots.put.state.${state}`)}
                    </Badge>
                  </label>
                  {reason && !result && <p data-put-reason="" style={{ ...small, paddingLeft: 24 }}>{reason}</p>}
                  {result?.phase === 'sending' && (
                    <p role="status" style={{ ...small, color: color.t2, paddingLeft: 24 }}>
                      {t(result.act === 'use' ? 'missions.maps.robots.using' : 'missions.maps.robots.sending')}
                    </p>
                  )}
                  {result?.phase === 'done' && (
                    <div data-put-result={result.outcome.ok ? 'ok' : result.outcome.refused ? 'refused' : 'failed'} style={{ paddingLeft: 24 }}>
                      <OutcomeLine outcome={result.outcome} act={result.act} onSetPosition={() => setPosition(id)} />
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {switching && <p style={small}>{t('missions.maps.robots.put.switchNote')}</p>}
        {role && <p style={small}>{role}</p>}

        <DialogFooter style={{ gap: space[2] }}>
          <Button disabled={sending} onClick={onClose}>
            {t(anyResult ? 'missions.maps.robots.put.close' : 'missions.maps.robots.put.cancel')}
          </Button>
          <Button variant="primary" icon={Send} data-put-go="" aria-controls={rows.length ? listId : undefined}
            disabled={sending || chosen.length === 0 || !floorHash} onClick={() => void put()}>
            {sending ? t('missions.maps.robots.put.working')
              : chosen.length === 0 ? t('missions.maps.robots.put.goNone')
                : t('missions.maps.robots.put.go', { count: chosen.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** The button and its chooser together, for a page with nowhere else to hold
 *  the chooser open (the survey's finishing screen). */
export function PutOnRobots({ map, floorIndex, maps }: { map: SiteMap; floorIndex: number; maps: SiteMap[] }) {
  const [session, setSession] = useState(0)
  const [open, setOpen] = useState(false)
  return (
    <>
      <PutOnRobotsButton map={map} floorIndex={floorIndex} onOpen={() => { setSession((s) => s + 1); setOpen(true) }} />
      <PutOnRobotsDialog map={map} floorIndex={floorIndex} maps={maps} open={open} session={session} onClose={() => setOpen(false)} />
    </>
  )
}

/** One robot's answer: sent (and, after a switch, Set position), or why not. */
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
  const text = outcome.refused ? t('missions.maps.robots.put.refused', { reason: outcome.reason })
    : t(act === 'use' ? 'missions.maps.robots.useFailed' : 'missions.maps.robots.failed', { reason: outcome.reason })
  return (
    <div role="alert" style={{ display: 'grid', gap: space[1], padding: `${space[1]}px ${space[2]}px`, borderRadius: radius.sm, background: color.redBg }}>
      <span style={{ ...line, color: color.red }}>{dot(color.red)}{text}</span>
      {outcome.detail && <span style={{ fontSize: font.size.xs, color: color.t2, lineHeight: 1.5, wordBreak: 'break-word' }}>{outcome.detail}</span>}
    </div>
  )
}
