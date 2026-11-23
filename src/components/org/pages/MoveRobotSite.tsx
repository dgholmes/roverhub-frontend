import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MoveRight } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/kit'
import { navMapSwitchBlock, USE_NAV_MAP_SCHEMA } from '@/components/maps/robotMaps'
import { color, font, radius, space } from '@/design-system/tokens'
import { setRobotSite } from '@/org/robotSite'
import type { OrgSite } from '@/org/sites'
import { useCanAt } from '@/org/useCan'
import type { RobotState } from '@/types'
import { Field, inputStyle } from '../parts'

type Phase =
  | { kind: 'choosing' }
  | { kind: 'moving' }
  | { kind: 'moved'; site: string }
  | { kind: 'failed'; reason: string }

/**
 * Org › Devices, a robot's row: **Move to site…** (SET_SITE, schema 0.0.29,
 * map ready spec 4.11). A robot's site used to be SITE_ID in its bridge's
 * .env, fixed by hand. For a person who may `configure` the robot's site:
 * pick another of the organisation's sites -- the ones this console knows
 * (mergeSites: the session's and those robots report) -- confirm, and the
 * bridge writes the choice, forgets its map and restarts under the new site.
 * The robot then shows there with no map, and Use this map loads one.
 *
 * Not offered while the robot is offline, in E-Stop, on a mission or walking,
 * or on a bridge older than 0.0.29 -- the same blockers as Use this map
 * (robotMaps.navMapSwitchBlock); the row says which. The backend checks the
 * person may configure both sites and the site exists; the bridge refuses
 * anything else that is not idle, and the dialog says why in plain words.
 */
export function MoveSiteAction({ robot, sites }: { robot: RobotState; sites: OrgSite[] }) {
  const { t } = useTranslation()
  const canAt = useCanAt('configure')
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState('')
  const [phase, setPhase] = useState<Phase>({ kind: 'choosing' })
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  if (!canAt(robot.site_id)) return null
  const block = navMapSwitchBlock(robot)
  const blockText = block
    ? t(`devices.moveSite.block.${block}`, block === 'oldBridge' ? { version: USE_NAV_MAP_SCHEMA } : undefined)
    : null
  const others = sites.filter((s) => s.id !== robot.site_id)
  const nameOf = (id: string) => sites.find((s) => s.id === id)?.name ?? id
  const allowed = target !== '' && canAt(target)

  const begin = () => {
    setTarget('')
    setPhase({ kind: 'choosing' })
    setOpen(true)
  }
  const move = async () => {
    if (!allowed || block !== null) return
    const site = target
    setPhase({ kind: 'moving' })
    const outcome = await setRobotSite(robot.robot_id, site)
    if (!mounted.current) return
    setPhase(outcome.ok ? { kind: 'moved', site } : { kind: 'failed', reason: outcome.error ?? '' })
  }

  const note: React.CSSProperties = { margin: 0, fontSize: font.size.sm, lineHeight: 1.5 }
  const dot = (c: string) => <span aria-hidden style={{ width: 6, height: 6, marginTop: 7, borderRadius: radius.full, background: c, flexShrink: 0 }} />

  return (
    <>
      <div style={{ display: 'grid', gap: space[1], justifyItems: 'start' }}>
        <Button size="sm" icon={MoveRight} disabled={block !== null} title={blockText ?? undefined} onClick={begin}>
          {t('devices.moveSite.action')}
        </Button>
        {blockText && <span style={{ ...note, color: color.t3, whiteSpace: 'normal', maxWidth: 220 }}>{blockText}</span>}
      </div>

      <Dialog open={open} onOpenChange={(next) => { if (phase.kind !== 'moving') setOpen(next) }}>
        <DialogContent style={{ background: color.elevated, border: 'none', color: color.t1 }}>
          <DialogHeader>
            <DialogTitle style={{ color: color.t1 }}>{t('devices.moveSite.title', { robot: robot.name })}</DialogTitle>
            <DialogDescription style={{ color: color.t2 }}>
              {t('devices.moveSite.body', { robot: robot.name, site: nameOf(robot.site_id) })}
            </DialogDescription>
          </DialogHeader>

          {phase.kind === 'moved' ? (
            <p role="status" style={{ ...note, display: 'flex', gap: space[2], color: color.t1 }}>
              {dot(color.green)}{t('devices.moveSite.moved', { robot: robot.name, site: nameOf(phase.site) })}
            </p>
          ) : (
            <div style={{ display: 'grid', gap: space[3] }}>
              {others.length === 0 ? (
                <p style={{ ...note, color: color.t2 }}>{t('devices.moveSite.noOther')}</p>
              ) : (
                <Field label={t('devices.moveSite.site')}>
                  <select data-move-site style={inputStyle} value={target} disabled={phase.kind === 'moving'}
                    onChange={(e) => { setTarget(e.target.value); setPhase({ kind: 'choosing' }) }}>
                    <option value="">{t('devices.moveSite.pick')}</option>
                    {others.map((s) => (
                      <option key={s.id} value={s.id} disabled={!canAt(s.id)}>
                        {canAt(s.id) ? s.name : t('devices.moveSite.noRights', { site: s.name })}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {blockText && <p style={{ ...note, color: color.t3 }}>{blockText}</p>}
              {phase.kind === 'moving' && <p role="status" style={{ ...note, color: color.t2 }}>{t('devices.moveSite.moving')}</p>}
              {phase.kind === 'failed' && (
                <p role="alert" style={{
                  ...note, display: 'flex', gap: space[2], color: color.red, padding: `${space[1]}px ${space[2]}px`,
                  borderRadius: radius.sm, background: color.redBg,
                }}>
                  {dot(color.red)}{t('devices.moveSite.failed', { reason: phase.reason || t('devices.moveSite.noReason') })}
                </p>
              )}
            </div>
          )}

          <DialogFooter style={{ gap: 8 }}>
            {phase.kind === 'moved' ? (
              <Button onClick={() => setOpen(false)}>{t('devices.moveSite.close')}</Button>
            ) : (
              <>
                <Button disabled={phase.kind === 'moving'} onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
                <Button variant="primary" disabled={!allowed || block !== null || phase.kind === 'moving'}
                  onClick={() => void move()}>
                  {t('devices.moveSite.confirm')}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
