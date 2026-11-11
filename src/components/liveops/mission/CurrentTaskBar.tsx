import { useOperatorName } from '@/lib/auth/useAccount'
import { useEffect, useState } from 'react'
import { Anchor, OctagonX, Pause, Play, Repeat, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge, Button } from '@/components/kit'
import { getCommandAvailability } from '@/liveops/commandPolicy'
import { partitionCommandButtons } from '@/liveops/commandOverflow'
import { nextWaypointInfo } from '@/liveops/waypointGeometry'
import type { RobotRunView } from '@/liveops/robotRun'
import { formatClock, taskBarModel, type TaskBarModel } from '@/liveops/taskBar'
import { hashForSiteRun } from '@/app/routes'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { missionProgress } from '@/types'
import type { CommandType, Mission, RobotState } from '@/types'
import { ActionButton } from './ActionButton'
import { EStopButton } from '../command/EStopButton'
import { ControlToggleButton } from '../command/ControlToggleButton'
import { SpeakButton } from '../command/SpeakButton'
import { LedButton } from '../command/LedButton'
import { PostureButtons } from '../command/PostureButtons'
import { ObstacleAvoidanceToggle } from '../command/ObstacleAvoidanceToggle'
import { CommandOverflowMenu } from '../command/CommandOverflowMenu'
import { legConfigLabelKey, legConfigOf, switchLegBodyKey, switchLegLabelKey } from '@/liveops/legConfig'

/** Labels are `command.taskBar.buttons.<type>`, looked up at render.
 *
 * No SNAPSHOT: it was here from 2026-10-23 and removed 2026-10-28, because the
 * video's own capture rail (hero/CaptureRail.tsx) already takes one, right where
 * the operator is looking. Two buttons for one action cost row width. */
const BUTTONS: { type: 'PAUSE' | 'RETURN' | 'DOCK'; icon: React.ElementType }[] = [
  { type: 'PAUSE', icon: Pause },
  // RESUME left on 2026-11-11 (schema 0.0.16): it is wired now, with one
  // meaning -- Retry a run the robot paused as blocked -- and appears only as
  // that, in the run's own controls below.
  { type: 'RETURN', icon: RotateCcw },
  { type: 'DOCK', icon: Anchor },
]

/** Command types demoted into the "..." menu instead of the row.
 *
 * All three are undispatchable on this build, so they were costing row width
 * that working controls needed. The edge does run missions now
 * (`mission_executor.py`, START_MISSION/STOP_MISSION), but none of these three is
 * in `WIRED_COMMAND_TYPES`: an edge run is paused by Take control and ended by
 * Stop mission, and there is no return or dock. The real provider would hand
 * them to the mock for a simulated success, so commandPolicy disables them
 * against a real backend, and during any run.
 *
 * SNAPSHOT was listed here too, for want of camera plumbing. It became wired on
 * 2026-08-13, sat on the row from 2026-10-23, and left the bar on 2026-10-28
 * for the capture rail (see BUTTONS).
 *
 * That made them the obvious demotion: the row keeps only controls an operator
 * can actually use, which is what stopped Speak from being pushed off the end
 * (see src/liveops/commandOverflow.ts for the full history).
 *
 * **Remove an entry here the moment its command becomes wired** -- a working
 * command belongs on the row, not buried in a menu.
 */
const OVERFLOW_COMMANDS = new Set<CommandType>([
  'PAUSE', 'RETURN', 'DOCK',
])

/**
 * Restores the original CurrentTask bar layout (task info · ETA · next
 * waypoint · action buttons) as a single data-driven, command-wired bar —
 * folds in what used to be the separate MissionCard + CommandBar split.
 *
 * The button row (Take Control/Pause/Resume/.../E-Stop) always renders
 * regardless of whether a mission exists — only the mission-info portion is
 * conditional. Command bar and E-Stop must never collapse just because a
 * robot happens to have no active mission (docs/05-ui-ux.md §3).
 */
/** Re-render once a second while `on`, so a running mission's elapsed time moves. */
function useNow(on: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!on) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [on])
  return now
}

/** The robot's edge mission run, in the same layout as the legacy mission slot:
 * name and tag on the first line, a detail line, then the progress bar. The bar
 * shows only against a trustworthy estimate; otherwise elapsed time alone. */
function RunSlot({ model, siteId, runId, onDismiss }: {
  model: TaskBarModel; siteId?: string; runId: string; onDismiss?: () => void
}) {
  const { t } = useTranslation()
  const p = model.progress
  const pct = p?.estimateS ? Math.min(100, Math.round((p.elapsedS / p.estimateS) * 100)) : null
  const elapsed = p
    ? (p.estimateS
      ? t('command.taskBar.run.elapsedOf', { elapsed: formatClock(p.elapsedS), estimate: formatClock(p.estimateS) })
      : t('command.taskBar.run.elapsed', { elapsed: formatClock(p.elapsedS) }))
    : null
  const line = [model.detail, elapsed].filter(Boolean).join(' · ')
  return (
    <div className="rh-cmdbar__mission" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], minWidth: 0 }}>
        <span style={{
          fontSize: font.size.xl, fontWeight: font.weight.semibold, color: color.t1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
        }} title={model.title}>
          {model.title}
        </span>
        {model.tag && <Badge tone={model.tagTone} dot>{model.tag}</Badge>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], minWidth: 0 }}>
        <span style={{
          fontSize: font.size.sm, color: color.t2, fontVariantNumeric: 'tabular-nums',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
        }} title={line}>
          {line}
        </span>
        {model.buttons.includes('viewRun') && siteId && (
          <a href={hashForSiteRun(siteId, runId)} style={{ fontSize: font.size.sm, color: color.accent, flexShrink: 0 }}>
            {t('command.taskBar.run.viewRun')}
          </a>
        )}
        {model.buttons.includes('dismiss') && onDismiss && (
          <Button size="sm" onClick={onDismiss} style={{ flexShrink: 0 }}>{t('command.taskBar.run.dismiss')}</Button>
        )}
      </div>
      {pct !== null && (
        <div
          role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
          aria-label={t('command.taskBar.run.progressAria')}
          style={{ height: 3, background: color.border, borderRadius: radius.full, overflow: 'hidden' }}
        >
          <div style={{ width: `${pct}%`, height: '100%', background: color.accentSolid, borderRadius: radius.full }} />
        </div>
      )}
    </div>
  )
}

export function CurrentTaskBar({ robot, mission, run = null, siteId, onDismissRun }: {
  robot: RobotState
  mission?: Mission
  /** The robot's edge mission run (useRobotRun). Drives the left slot and the run buttons. */
  run?: RobotRunView
  siteId?: string
  onDismissRun?: () => void
}) {
  const { t } = useTranslation()
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)
  const operatorName = useOperatorName()
  const [changeModeConfirm, setChangeModeConfirm] = useState(false)
  const legConfig = legConfigOf(robot)
  const switchLegLabel = t(switchLegLabelKey(legConfig))
  const [stopConfirm, setStopConfirm] = useState(false)
  const now = useNow(run?.phase === 'running')
  const starting = useLiveOpsStore((s) => s.startingRuns[robot.robot_id] !== undefined)
  const model = taskBarModel(run, robot, now, starting)
  const avail = (type: CommandType) => getCommandAvailability(robot, type, run)
  // Newest-first, so the first match is the most recent attempt for this robot.
  const latestEstopCommand = useLiveOpsStore((s) =>
    s.activeCommands.find((c) => c.type === 'ESTOP' && c.robot_id === robot.robot_id))
  const { inline: inlineButtons, overflow: overflowButtons } =
    partitionCommandButtons(
      BUTTONS.map((b) => ({ ...b, label: t(`command.taskBar.buttons.${b.type}`) })),
      OVERFLOW_COMMANDS,
    )

  const missionInfo = run && model.slot !== 'none' && model.slot !== 'manual' ? (
    <RunSlot model={model} siteId={siteId} runId={run.runId} onDismiss={onDismissRun} />
  ) : mission ? (() => {
    const { pct } = missionProgress(mission)
    const activeWp = mission.waypoints[mission.current_waypoint_index]
    const next = nextWaypointInfo(robot, mission)
    // Two lines instead of three stat columns: the ETA and next-waypoint
    // figures were 22px numbers in their own boxes, which is where the bar's
    // width went. They read just as well inline, in tabular figures.
    return (
      <div className="rh-cmdbar__mission" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: space[2], minWidth: 0 }}>
          <span style={{
            fontSize: font.size.xl, fontWeight: font.weight.semibold, color: color.t1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
          }} title={mission.name}>
            {mission.name}
          </span>
          <Badge>{t(`command.taskBar.missionType.${mission.type}`)}</Badge>
        </div>
        <div style={{
          fontSize: font.size.sm, color: color.t2, fontVariantNumeric: 'tabular-nums',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {t('command.taskBar.waypoint', { current: mission.current_waypoint_index + 1, total: mission.waypoints.length })}
          {activeWp?.label ? ` · ${activeWp.label}` : ''}
          {mission.eta_min != null ? ` · ${t('command.taskBar.eta', { minutes: mission.eta_min })}` : ''}
          {next ? ` · ${t('command.taskBar.next', { distance: Math.round(next.distance_m), compass: next.compass })}` : ''}
        </div>
        <div
          role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
          aria-label={t('command.taskBar.progressAria')}
          style={{ height: 3, background: color.border, borderRadius: radius.full, overflow: 'hidden' }}
        >
          <div style={{ width: `${pct}%`, height: '100%', background: color.accentSolid, borderRadius: radius.full }} />
        </div>
      </div>
    )
  })() : (
    <div className="rh-cmdbar__mission" style={{ color: color.t2, fontSize: font.size.md }}>
      {model.title}
    </div>
  )

  return (
    // Height follows content (min 64px). It was a fixed 100px with a wrapping
    // button row inside, so at laptop widths the second row of buttons painted
    // over the status bar below instead of pushing it down.
    <div className="rh-cmdbar" style={{
      minHeight: 64, flexShrink: 0,
      background: color.surface, borderTop: `1px solid ${color.border}`,
      padding: `${space[2]}px ${space[4]}px`,
    }}>
    <div className="rh-cmdbar__row" style={{ minHeight: 48 }}>
      {missionInfo}


      {/* Command group; the E-Stop below is anchored separately and never
          shrinks. No button in here can be hidden by width pressure: the three
          undispatchable commands live in the "..." menu (OVERFLOW_COMMANDS),
          and if what remains still cannot fit, the row wraps rather than
          clipping or scrolling out of view.

          Both earlier layouts lost a control silently. One non-wrapping row
          needing ~1340px inside an `overflow: hidden` ancestor clipped from the
          right and took the E-Stop with it (~9px visible at 1280px, gone at
          1024px). Anchoring the E-Stop and making this group scroll
          horizontally fixed that and moved it -- Speak became the last child of
          the scroll group, so Speak disappeared instead, with no affordance
          showing the row scrolled. docs/audit/2026-08-12-ui-ux-audit.md A-01,
          and src/liveops/commandOverflow.ts. */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: space[2] - 2, alignItems: 'center',
        minWidth: 0, flex: 1,
      }}>
        {/* The control group comes from taskBarModel: the plain Take/Release
            toggle, or -- while a run is paused under your control -- Release &
            resume in its place, plus Stop mission whenever a run is live. */}
        {(model.buttons.includes('takeControl') || model.buttons.includes('release')) && (
          <ControlToggleButton
            active={model.buttons.includes('release')}
            takeAvailability={avail('TAKE_CONTROL')}
            releaseAvailability={avail('RELEASE_CONTROL')}
            onTake={() => dispatchCommand(robot.robot_id, 'TAKE_CONTROL', t('command.control.takeCommand'), { operator: operatorName })}
            onRelease={() => dispatchCommand(robot.robot_id, 'RELEASE_CONTROL', t('command.control.releaseCommand'))}
          />
        )}
        {model.buttons.includes('releaseResume') && (
          <ActionButton
            icon={Play}
            tone="blue"
            label={t('command.taskBar.run.releaseResume')}
            availability={avail('RELEASE_CONTROL')}
            onClick={() => dispatchCommand(robot.robot_id, 'RELEASE_CONTROL', t('command.taskBar.run.releaseResumeCommand'), { resume_run: true })}
          />
        )}
        {/* Retry a run the robot paused as blocked: RESUME {run_id}, which the
            bridge accepts only while nobody holds control (taskBarModel
            offers it only then). Take control stays beside it. */}
        {model.buttons.includes('retry') && run && (
          <ActionButton
            icon={Play}
            tone="blue"
            label={t('command.taskBar.run.retry')}
            availability={avail('RESUME')}
            onClick={() => dispatchCommand(robot.robot_id, 'RESUME', t('command.taskBar.run.retryCommand'), { run_id: run.runId })}
          />
        )}
        {model.buttons.includes('stopMission') && (
          <ActionButton
            icon={OctagonX}
            label={t('command.taskBar.run.stopMission')}
            availability={avail('STOP_MISSION')}
            onClick={() => setStopConfirm(true)}
          />
        )}
        <PostureButtons
          robot={robot}
          run={run}
          onSetState={(state, label) => dispatchCommand(robot.robot_id, 'SET_STATE', label, { state })}
        />
        {/* On the row, not in More: the operator wants it one click away
            (2026-11-06), even though it makes the row wrap sooner. */}
        <ActionButton
          icon={Repeat}
          label={switchLegLabel}
          availability={avail('CHANGE_MODE')}
          onClick={() => setChangeModeConfirm(true)}
        />
        {inlineButtons.map(({ type, label, icon }) => (
          <ActionButton
            key={type}
            icon={icon}
            label={label}
            availability={avail(type)}
            onClick={() => dispatchCommand(robot.robot_id, type, label)}
          />
        ))}
        <ObstacleAvoidanceToggle
          robot={robot}
          onToggle={(enabled) => dispatchCommand(
            robot.robot_id, 'SET_OBSTACLE_AVOIDANCE',
            enabled ? t('command.avoidance.enableCommand') : t('command.avoidance.disableCommand'),
            { enabled },
          )}
        />
        <LedButton
          availability={avail('LED_SIGNAL')}
          onToggle={(params, label) => dispatchCommand(robot.robot_id, 'LED_SIGNAL', label, params)}
        />
        <SpeakButton
          availability={avail('SPEAK')}
          stopAvailability={avail('STOP_SPEAK')}
          robotId={robot.robot_id}
          onPlay={(clip) => dispatchCommand(robot.robot_id, 'SPEAK', t('command.speak.playCommand', { label: clip.label }), { clip_id: clip.clipId, volume: clip.volume })}
          onStop={() => dispatchCommand(robot.robot_id, 'STOP_SPEAK', t('command.speak.stopAudio'))}
        />
        {/* Last in the row deliberately: this is the one control that loses
            nothing by sitting at the end, because its contents stay reachable
            through the menu no matter how narrow the window gets. */}
        <CommandOverflowMenu
          entries={overflowButtons.map(({ type, label, icon }) => ({
            key: type,
            label,
            icon,
            availability: avail(type),
            onClick: () => dispatchCommand(robot.robot_id, type, label),
          }))}
        />
      </div>

      {/* Anchored, never shrinks, never scrolls — see the note above. */}
      <div style={{
        display: 'flex', alignItems: 'center', flexShrink: 0,
        marginLeft: 'auto', paddingLeft: space[4], alignSelf: 'stretch',
      }}>
        <EStopButton
          state={robot.abstract_state}
          engageCommand={latestEstopCommand}
          estopAvailability={getCommandAvailability(robot, 'ESTOP')}
          resetAvailability={getCommandAvailability(robot, 'RESET_ESTOP')}
          onEngage={() => dispatchCommand(robot.robot_id, 'ESTOP', t('command.estop.engageCommand'))}
          onRelease={() => dispatchCommand(robot.robot_id, 'RESET_ESTOP', t('command.estop.releaseCommand'))}
        />
      </div>
    </div>

      <Dialog open={changeModeConfirm} onOpenChange={setChangeModeConfirm}>
        <DialogContent style={{ background: color.elevated, border: `1px solid ${color.border}`, color: color.t1 }}>
          <DialogHeader>
            <DialogTitle>{t('command.taskBar.switchLegTitle')}</DialogTitle>
            <DialogDescription style={{ color: color.t2 }}>
              {t(switchLegBodyKey(legConfig), {
                current: t(legConfigLabelKey(legConfig)),
                target: t(legConfigLabelKey(legConfig === 'normal' ? 'x' : 'normal')),
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter style={{ gap: space[2] }}>
            <Button onClick={() => setChangeModeConfirm(false)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              onClick={() => {
                dispatchCommand(robot.robot_id, 'CHANGE_MODE', switchLegLabel)
                setChangeModeConfirm(false)
              }}
            >
              {switchLegLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Same pattern as Switch leg config: a stopped run cannot be resumed. */}
      <Dialog open={stopConfirm} onOpenChange={setStopConfirm}>
        <DialogContent style={{ background: color.elevated, border: `1px solid ${color.border}`, color: color.t1 }}>
          <DialogHeader>
            <DialogTitle>{t('command.taskBar.run.stopTitle')}</DialogTitle>
            <DialogDescription style={{ color: color.t2 }}>
              {t('command.taskBar.run.stopBody')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter style={{ gap: space[2] }}>
            <Button onClick={() => setStopConfirm(false)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (run && (run.phase === 'running' || run.phase === 'paused')) {
                  dispatchCommand(robot.robot_id, 'STOP_MISSION', t('command.taskBar.run.stopMission'), { run_id: run.runId })
                }
                setStopConfirm(false)
              }}
            >
              {t('command.taskBar.run.stopMission')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
