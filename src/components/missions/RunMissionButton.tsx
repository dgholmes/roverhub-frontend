import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Play } from 'lucide-react'
import { color, font, radius, shadow, space } from '@/design-system/tokens'
import { Badge, Button, InlineAlertDialog, type Tone } from '@/components/kit'
import { AVAILABILITY_ORDER, type AvailabilityStatus } from '@/missions/robotAvailability'
import { defaultRunRobot, runMissionNowAndOpen, runRobotBlock } from '@/missions/startMissionRun'
import { useSessionStore } from '@/store/useSessionStore'
import type { MissionLibraryEntry, MissionTask, RobotState } from '@/types'
import { AVAILABILITY_DOT, availabilityText, useRobotAvailability } from './RobotPicker'
import { useFirstRunConfirm } from './FirstRunConfirm'

const BADGE_TONE: Record<AvailabilityStatus, Tone> = {
  available: 'green', onMission: 'blue', inUse: 'blue', attention: 'amber', offline: 'neutral',
}

/**
 * Run a mission on a robot now, from the library, with no task: the primary
 * action of the preview. Opens a chooser above the button -- one row per site
 * robot, with its availability, the likeliest robot ticked -- and Start posts
 * the run (runMissionNowAndOpen), which opens LiveOps on success. A refusal
 * stays in the chooser, in red, so it can be read and another robot tried.
 * Robots that would only be refused (offline, busy, critically unwell, a wheel
 * robot for a route, a battery under 15%) are listed but cannot be picked.
 */
export function RunMissionButton({ siteId, mission, robots, tasks }: {
  siteId: string
  mission: MissionLibraryEntry
  /** The site's robots (useSiteRobots). */
  robots: RobotState[]
  /** The site's tasks, to default to the robot this mission's tasks use. */
  tasks: readonly MissionTask[]
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [starting, setStarting] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  // Outside the chooser: the chooser's Escape handling must not swallow the dialog's.
  const firstRun = useFirstRunConfirm()

  // A run that is starting cannot be walked away from: its answer is the next thing to read.
  const close = () => { if (!starting) setOpen(false) }

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!starting && wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [open, starting])

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-flex' }}>
      {open && (
        <RunChooser
          siteId={siteId} mission={mission} robots={robots} tasks={tasks}
          starting={starting} setStarting={setStarting} confirmFirstRun={firstRun.confirm}
          onClose={close} onStarted={() => setOpen(false)} returnFocus={triggerRef}
        />
      )}
      <Button
        ref={triggerRef} variant="primary" icon={Play} disabled={starting}
        aria-haspopup="dialog" aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        {starting ? t('missions.library.run.starting') : t('missions.library.run.button')}
      </Button>
      {firstRun.dialog}
    </div>
  )
}

function RunChooser({ siteId, mission, robots, tasks, starting, setStarting, confirmFirstRun, onClose, onStarted, returnFocus }: {
  siteId: string
  mission: MissionLibraryEntry
  robots: RobotState[]
  tasks: readonly MissionTask[]
  starting: boolean
  setStarting: (v: boolean) => void
  /** Asks before an airborne move's first run on the robot (FirstRunConfirm); true to go on. */
  confirmFirstRun: ReturnType<typeof useFirstRunConfirm>['confirm']
  onClose: () => void
  onStarted: () => void
  returnFocus: React.RefObject<HTMLElement | null>
}) {
  const { t } = useTranslation()
  const name = useId()
  const titleId = useId()
  const availability = useRobotAvailability(robots)
  const selectedRobotId = useSessionStore((s) => s.selectedRobotId)
  const rows = useMemo(() => robots
    .map((r) => {
      const a = availability.get(r.robot_id)!
      return { robot: r, availability: a, block: runRobotBlock(r, a, mission) }
    })
    .sort((x, y) => AVAILABILITY_ORDER.indexOf(x.availability.status) - AVAILABILITY_ORDER.indexOf(y.availability.status)),
  [robots, availability, mission])
  // Ticked once, when the chooser opens: a robot changing state underneath
  // should not move the operator's pick.
  const [picked, setPicked] = useState<string | null>(() => {
    const id = defaultRunRobot(mission, tasks, robots, selectedRobotId)
    return rows.some((r) => r.robot.robot_id === id && r.block === null) ? id : null
  })
  const [refusal, setRefusal] = useState<string | null>(null)
  const chosen = rows.some((r) => r.robot.robot_id === picked && r.block === null) ? picked : null

  async function start() {
    if (!chosen || starting) return
    setStarting(true)
    setRefusal(null)
    try {
      const robotName = robots.find((r) => r.robot_id === chosen)?.name ?? chosen
      if (!(await confirmFirstRun(mission, chosen, robotName))) return
      const result = await runMissionNowAndOpen(siteId, mission, chosen)
      if (result.ok) onStarted()
      else setRefusal(result.reason)
    } catch (e) {
      setRefusal(e instanceof Error ? e.message : String(e))
    } finally {
      setStarting(false)
    }
  }

  return (
    <InlineAlertDialog
      as="form" labelledBy={titleId} onClose={onClose} returnFocus={returnFocus}
      onSubmit={(e) => { e.preventDefault(); void start() }}
      style={{
        position: 'absolute', right: 0, bottom: `calc(100% + ${space[2]}px)`, zIndex: 600,
        width: 340, maxWidth: 'calc(100vw - 32px)', boxSizing: 'border-box',
        display: 'grid', gap: space[2], padding: space[3], borderRadius: radius.lg,
        background: color.surface, boxShadow: shadow.lg, fontFamily: font.family,
      }}
    >
      <span id={titleId} style={{ fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {t('missions.library.run.title', { name: mission.name })}
      </span>
      {rows.length === 0
        ? <p style={{ margin: 0, fontSize: font.size.sm, color: color.t3 }}>{t('missions.library.run.noRobots')}</p>
        : (
          <div role="radiogroup" aria-labelledby={titleId} style={{ display: 'grid', gap: space[1], maxHeight: 280, overflowY: 'auto' }}>
            {rows.map(({ robot, availability: a, block }) => {
              const on = robot.robot_id === chosen
              const why = block === 'wheelRobot' || block === 'batteryLow' ? t(`missions.library.run.off.${block}`) : null
              return (
                <label
                  key={robot.robot_id} data-robot-row={robot.robot_id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: space[2], padding: `${space[2]}px ${space[3]}px`,
                    borderRadius: radius.sm, background: on ? color.accentDim : color.card,
                    cursor: block ? 'default' : 'pointer', opacity: block ? 0.55 : 1,
                  }}
                >
                  <input
                    type="radio" name={name} value={robot.robot_id} checked={on} disabled={block !== null}
                    onChange={() => { if (!starting) setPicked(robot.robot_id) }} data-autofocus={on || undefined}
                    style={{ accentColor: color.accent, margin: 0 }}
                  />
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: AVAILABILITY_DOT[a.status] }} />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: font.size.md, color: color.t1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {robot.name}
                    </span>
                    {why && <span style={{ display: 'block', fontSize: font.size.sm, color: color.t3 }}>{why}</span>}
                  </span>
                  <Badge tone={BADGE_TONE[a.status]} style={{ flexShrink: 0, maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {availabilityText(a, t)}
                  </Badge>
                </label>
              )
            })}
          </div>
        )}
      {refusal && <p role="alert" style={{ margin: 0, fontSize: font.size.sm, color: color.red }}>{refusal}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: space[2], flexWrap: 'wrap' }}>
        <Button size="sm" onClick={onClose} aria-disabled={starting || undefined} data-autofocus={!chosen || undefined}>
          {t('missions.library.run.cancel')}
        </Button>
        <Button size="sm" variant="primary" type="submit" icon={Play} disabled={!chosen} aria-disabled={starting || undefined}>
          {starting ? t('missions.library.run.starting') : t('missions.library.run.start')}
        </Button>
      </div>
    </InlineAlertDialog>
  )
}
