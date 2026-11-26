import { useOperatorName } from '@/lib/auth/useAccount'
import { useEffect, useState } from 'react'
import { Anchor, OctagonX, Pause, Play, Repeat } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { color, font, radius, space } from '@/design-system/tokens'
import { Badge, Button } from '@/components/kit'
import { getCommandAvailability } from '@/liveops/commandPolicy'
import { UNWIRED_COMMANDS, deckEntries, type DeckEntry, type DeckKind, type UnwiredCommand } from '@/liveops/commandDeck'
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
import { SpeedControl } from '../command/SpeedControl'
import { SpeakButton } from '../command/SpeakButton'
import { LedButton } from '../command/LedButton'
import { PostureButtons } from '../command/PostureButtons'
import { ObstacleAvoidanceToggle } from '../command/ObstacleAvoidanceToggle'
import { CommandOverflowMenu } from '../command/CommandOverflowMenu'
import { DetectionButton } from '../command/DetectionButton'
import { ResumeButton } from '../command/ResumeButton'
import { ReturnHomeButton } from '../command/ReturnHomeButton'
import { legConfigLabelKey, legConfigOf, switchLegBodyKey, switchLegLabelKey } from '@/liveops/legConfig'
import { isNavOwner, useControlHolderNames } from '@/liveops/controlOwner'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'
// Survey mode (schema 0.0.23): Start survey / Open survey in More.
import { useSurveyMenu } from '@/components/survey/SurveyLiveOps'

/** Icons for the plain one-command entries (`kind: 'command'`). Labels are
 * `command.taskBar.buttons.<type>`, looked up at render.
 *
 * Which types those are, and why each is still behind the "..." menu, lives in
 * `commandDeck.ts`'s UNWIRED_COMMANDS -- the touch dock needs the same answer,
 * so the list cannot stay here.
 *
 * No SNAPSHOT: it was here from 2026-10-23 and removed 2026-10-28, because the
 * video's own capture rail (hero/CaptureRail.tsx) already takes one, right where
 * the operator is looking. Two buttons for one action cost row width. */
const COMMAND_ICONS: Record<UnwiredCommand, React.ElementType> = {
  PAUSE: Pause,
  DOCK: Anchor,
}

/** Narrows a deck entry's type to one this bar can draw a plain button for.
 * `kind: 'command'` entries only ever come from UNWIRED_COMMANDS, so this is
 * total in practice; a type that becomes wired leaves that list and gains a
 * kind of its own, which the deck test then requires a renderer for. */
const isUnwired = (type: CommandType): type is UnwiredCommand =>
  (UNWIRED_COMMANDS as readonly CommandType[]).includes(type)

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

/** The left slot: the edge run, else the mock's demo mission, else a one-line
 * status. Its own component, behind its own boundary, so a bad run or mission
 * value takes this slot down and not the E-Stop beside it. */
function TaskSlot({ robot, mission, run, siteId, onDismissRun }: {
  robot: RobotState
  mission?: Mission
  run: RobotRunView
  siteId?: string
  onDismissRun?: () => void
}) {
  const { t } = useTranslation()
  const now = useNow(run?.phase === 'running')
  const starting = useLiveOpsStore((s) => s.startingRuns[robot.robot_id] !== undefined)
  const model = taskBarModel(run, robot, now, starting)

  if (run && model.slot !== 'none' && model.slot !== 'manual') {
    return <RunSlot model={model} siteId={siteId} runId={run.runId} onDismiss={onDismissRun} />
  }
  if (!mission) {
    return (
      <div className="rh-cmdbar__mission" style={{ color: color.t2, fontSize: font.size.md }}>
        {model.title}
      </div>
    )
  }
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
}

/* ── deck-controls:begin ─────────────────────────────────────────────────────
 *
 * Every operator control this bar renders is declared in
 * `src/liveops/commandDeck.ts` and drawn here, from the one `switch (entry.kind)`
 * below. The touch dock renders the same declaration, so a control added to one
 * shell cannot go missing from the other -- the design's anti-goal #2.
 *
 * Three controls are deliberately outside this region, each for a reason named
 * in `commandDeck.test.ts`: the E-Stop (anchored, never gated by ownership, and
 * drawn by each shell's own chrome), SpeedControl (a local setting, not a
 * command) and CommandOverflowMenu (the presentation of the overflow tier).
 *
 * `commandDeck.test.ts` reads this file, so: put a new control's renderer in
 * this region behind a new `case`, and leave the confirmation dialogs with the
 * component that owns their state -- the deck declares `kind`, nothing more.
 */

/** The Take control / Release toggle, wired. `active` is Release. */
function ControlToggle({ robot, run, active }: { robot: RobotState; run: RobotRunView; active: boolean }) {
  const { t } = useTranslation()
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)
  const operatorName = useOperatorName()
  return (
    <ControlToggleButton
      active={active}
      takeAvailability={getCommandAvailability(robot, 'TAKE_CONTROL', run)}
      releaseAvailability={getCommandAvailability(robot, 'RELEASE_CONTROL', run)}
      onTake={() => dispatchCommand(robot.robot_id, 'TAKE_CONTROL', t('command.control.takeCommand'), { operator: operatorName })}
      onRelease={() => dispatchCommand(robot.robot_id, 'RELEASE_CONTROL', t('command.control.releaseCommand'))}
    />
  )
}

/** What a deck entry needs beyond itself: the robot and run every control is
 * about, the model the control toggle reads its direction from, and the two
 * openers for the confirmations that stay with their owning component. */
interface DeckContext {
  robot: RobotState
  run: RobotRunView
  model: TaskBarModel
  /** Opens the leg-switch confirmation (the dialog lives in RobotButtons). */
  onLegSwitch: () => void
  legSwitchLabel: string
  /** Opens the Stop mission confirmation (the dialog lives in RunButtons). */
  onStopMission: () => void
}

/** One deck entry, drawn. The only place a `DeckKind` becomes a control. */
function DeckControl({ entry, ctx }: { entry: DeckEntry; ctx: DeckContext }) {
  const { t } = useTranslation()
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)
  const { robot, run, model } = ctx
  const avail = (type: CommandType) => getCommandAvailability(robot, type, run)

  switch (entry.kind) {
    case 'control':
      return <ControlToggle robot={robot} run={run} active={model.buttons.includes('release')} />

    case 'releaseResume':
      return (
        <ActionButton
          icon={Play}
          tone="blue"
          label={t('command.taskBar.run.releaseResume')}
          availability={avail('RELEASE_CONTROL')}
          onClick={() => dispatchCommand(robot.robot_id, 'RELEASE_CONTROL', t('command.taskBar.run.releaseResumeCommand'), { resume_run: true })}
        />
      )

    // Retry a run the robot paused as blocked, or Resume one an E-Stop paused
    // (0.0.33): RESUME {run_id}, which the bridge accepts only while nobody
    // holds control. Take control stays beside it.
    case 'retry':
      return <ResumeButton robot={robot} run={run} as={model.retryAs} />

    // Return home (RETURN, 0.0.33), or its Cancel while the robot walks home.
    case 'returnHome':
      return <ReturnHomeButton robot={robot} run={run} />

    case 'stopMission':
      return (
        <ActionButton
          icon={OctagonX}
          label={t('command.taskBar.run.stopMission')}
          availability={avail('STOP_MISSION')}
          onClick={ctx.onStopMission}
        />
      )

    case 'posture':
      return (
        <PostureButtons
          robot={robot}
          run={run}
          actions={entry.postureActions}
          onSetState={(state, label) => dispatchCommand(robot.robot_id, 'SET_STATE', label, { state })}
        />
      )

    case 'legSwitch':
      return (
        <ActionButton
          icon={Repeat}
          label={ctx.legSwitchLabel}
          availability={avail('CHANGE_MODE')}
          onClick={ctx.onLegSwitch}
        />
      )

    case 'avoidance':
      return (
        <ObstacleAvoidanceToggle
          robot={robot}
          onToggle={(enabled) => dispatchCommand(
            robot.robot_id, 'SET_OBSTACLE_AVOIDANCE',
            enabled ? t('command.avoidance.enableCommand') : t('command.avoidance.disableCommand'),
            { enabled },
          )}
        />
      )

    case 'detection':
      return (
        <DetectionButton
          robot={robot}
          run={run}
          onSend={(params, label) => dispatchCommand(robot.robot_id, 'SET_DETECTION', label, { ...params })}
        />
      )

    case 'led':
      return (
        <LedButton
          availability={avail('LED_SIGNAL')}
          onToggle={(params, label) => dispatchCommand(robot.robot_id, 'LED_SIGNAL', label, params)}
        />
      )

    case 'speak':
      return (
        <SpeakButton
          availability={avail('SPEAK')}
          stopAvailability={avail('STOP_SPEAK')}
          robotId={robot.robot_id}
          onPlay={(clip) => dispatchCommand(robot.robot_id, 'SPEAK', t('command.speak.playCommand', { label: clip.label }), { clip_id: clip.clipId, volume: clip.volume })}
          onStop={() => dispatchCommand(robot.robot_id, 'STOP_SPEAK', t('command.speak.stopAudio'))}
        />
      )

    // A plain one-command button. Every such entry is in the overflow tier on
    // this build (commandDeck's UNWIRED_COMMANDS), so this draws nothing today
    // -- it is what a type becoming wired turns into, on the row, rather than
    // the type silently staying in a menu.
    case 'command': {
      if (!entry.type || !isUnwired(entry.type)) return null
      const type = entry.type
      const label = t(`command.taskBar.buttons.${type}`)
      return (
        <ActionButton
          icon={COMMAND_ICONS[type]}
          label={label}
          availability={avail(type)}
          onClick={() => dispatchCommand(robot.robot_id, type, label)}
        />
      )
    }
  }
}

/* ── deck-controls:end ───────────────────────────────────────────────────── */

/** Draws the entries of `kinds` that are on the row, in deck order. */
function DeckRow({ entries, kinds, ctx }: { entries: DeckEntry[]; kinds: ReadonlySet<DeckKind>; ctx: DeckContext }) {
  return (
    <>
      {entries
        .filter((e) => kinds.has(e.kind) && e.tier === 'primary')
        .map((entry) => <DeckControl key={entry.key} entry={entry} ctx={ctx} />)}
    </>
  )
}

/** The control group comes from taskBarModel: the plain Take/Release toggle,
 * or -- while a run is paused under your control -- Release & resume in its
 * place (RunButtons). Computed here, inside the boundary, not by the bar. */
function ModelControlToggle({ robot, run }: { robot: RobotState; run: RobotRunView }) {
  const model = taskBarModel(run, robot)
  // The toggle opens no dialog, so the two openers are never reached from here.
  const ctx: DeckContext = { robot, run, model, onLegSwitch: NO_DIALOG, legSwitchLabel: '', onStopMission: NO_DIALOG }
  return <DeckRow entries={deckEntries(model, robot, 'wide')} kinds={CONTROL_KINDS} ctx={ctx} />
}

/** Stands in for an opener no kind in the group can reach. */
const NO_DIALOG = () => {}

/** Which kinds each error-bounded group of the row draws. Together they cover
 * every DeckKind: a kind in none of them would be declared and never rendered,
 * which `commandDeck.test.ts` fails on. */
const CONTROL_KINDS: ReadonlySet<DeckKind> = new Set<DeckKind>(['control'])
const RUN_KINDS: ReadonlySet<DeckKind> = new Set<DeckKind>(['releaseResume', 'retry', 'stopMission', 'returnHome'])
const ROBOT_KINDS: ReadonlySet<DeckKind> = new Set<DeckKind>(['posture', 'legSwitch', 'avoidance', 'detection', 'led', 'speak', 'command'])

/** What stands in for ModelControlToggle when it fails: the toggle read from
 * the robot's state alone, so an operator can still take or hand back control.
 * It can offer Take control where the full model would not (another operator
 * holds a paused run); the bridge refuses that (REJECTED_NOT_CONTROL_OWNER). */
function PlainControlToggle({ robot, run }: { robot: RobotState; run: RobotRunView }) {
  const inManualControl = robot.abstract_state === 'MANUAL' || robot.abstract_state === 'ASSISTED'
  return <ControlToggle robot={robot} run={run} active={inManualControl && !isNavOwner(robot.control_owner)} />
}

/** Release & resume, Retry / Resume, Stop mission and Return home, with Stop's confirmation. */
function RunButtons({ robot, run }: { robot: RobotState; run: RobotRunView }) {
  const { t } = useTranslation()
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)
  const [stopConfirm, setStopConfirm] = useState(false)
  const model = taskBarModel(run, robot)
  const ctx: DeckContext = {
    robot, run, model, onLegSwitch: NO_DIALOG, legSwitchLabel: '',
    onStopMission: () => setStopConfirm(true),
  }
  return (
    <>
      <DeckRow entries={deckEntries(model, robot, 'wide')} kinds={RUN_KINDS} ctx={ctx} />

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
    </>
  )
}

/** Posture, leg switch, the fixed buttons, avoidance, LED, Speak and More. */
function RobotButtons({ robot, run }: { robot: RobotState; run: RobotRunView }) {
  const { t } = useTranslation()
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)
  const [changeModeConfirm, setChangeModeConfirm] = useState(false)
  const legConfig = legConfigOf(robot)
  const switchLegLabel = t(switchLegLabelKey(legConfig))
  const avail = (type: CommandType) => getCommandAvailability(robot, type, run)
  const survey = useSurveyMenu(robot, run)
  const model = taskBarModel(run, robot)
  const entries = deckEntries(model, robot, 'wide')
  const ctx: DeckContext = {
    robot, run, model, legSwitchLabel: switchLegLabel,
    onLegSwitch: () => setChangeModeConfirm(true),
    onStopMission: NO_DIALOG,
  }
  // The menu is drawn from the overflow tier rather than a list of its own, so
  // a control demoted by width and one demoted because it is undispatchable
  // arrive by the same route. Only one-command entries can be listed in a menu
  // line, which on this build is exactly the undispatchable three.
  const overflowCommands = entries
    .filter((e) => e.tier === 'overflow' && e.kind === 'command')
    .map((e) => ({ key: e.key, type: e.type }))
    .filter((e): e is { key: string; type: UnwiredCommand } => e.type !== undefined && isUnwired(e.type))
  return (
    <>
      <DeckRow entries={entries} kinds={ROBOT_KINDS} ctx={ctx} />
      {/* Last in the row deliberately: this is the one control that loses
          nothing by sitting at the end, because its contents stay reachable
          through the menu no matter how narrow the window gets. */}
      <CommandOverflowMenu
        entries={[...overflowCommands.map(({ key, type }) => {
          const label = t(`command.taskBar.buttons.${type}`)
          return {
            key,
            label,
            icon: COMMAND_ICONS[type],
            availability: avail(type),
            onClick: () => dispatchCommand(robot.robot_id, type, label),
          }
        }), ...(survey.entry ? [survey.entry] : [])]}
      />
      {survey.dialog}

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
    </>
  )
}

/** The slot's fallback takes the slot's place in the row (kit.css .rh-cmdbar__mission). */
const SLOT_FALLBACK: React.CSSProperties = { flex: '0 1 360px', minWidth: 220 }

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
  // The task bar and Retry name whoever holds control; this re-renders the
  // bar, children included, when a name arrives.
  useControlHolderNames([robot.control_owner, run?.owner])
  // Newest-first, so the first match is the most recent attempt for this robot.
  const latestEstopCommand = useLiveOpsStore((s) =>
    s.activeCommands.find((c) => c.type === 'ESTOP' && c.robot_id === robot.robot_id))
  // A new robot or a new run is a fresh try for every part below.
  const resetKeys = [robot.robot_id, run?.runId, run?.phase]

  // Everything in this bar except the E-Stop sits behind an error boundary of
  // its own, and this component computes nothing that can throw beyond what
  // the E-Stop itself needs: taskBarModel runs inside the bounded children. A
  // bad run or mission value used to take the whole bar down, E-Stop included
  // (docs/audit/2026-11-10-system-direction-audit.md §5.5). The boundaries add
  // no DOM, so the row lays out exactly as before while nothing has failed.
  return (
    // Height follows content (min 64px). It was a fixed 100px with a wrapping
    // button row inside, so at laptop widths the second row of buttons painted
    // over the status bar below instead of pushing it down.
    // data-card-bound: the cards its buttons open (BarCard) clear the whole bar,
    // not just their own button, so a wrapped row is never covered.
    <div className="rh-cmdbar" data-card-bound="bottom" style={{
      minHeight: 64, flexShrink: 0,
      background: color.surface, borderTop: `1px solid ${color.border}`,
      padding: `${space[2]}px ${space[4]}px`,
    }}>
    <div className="rh-cmdbar__row" style={{ minHeight: 48 }}>
      <ErrorBoundary area="LiveOps task slot" variant="strip" resetKeys={resetKeys} fallbackStyle={SLOT_FALLBACK}>
        <TaskSlot robot={robot} mission={mission} run={run} siteId={siteId} onDismissRun={onDismissRun} />
      </ErrorBoundary>


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
        <ErrorBoundary
          area="LiveOps control toggle" variant="strip" resetKeys={resetKeys}
          // Control must stay reachable: the plain toggle stands in, in a
          // boundary of its own so even it failing cannot reach the E-Stop.
          fallbackExtra={(
            <ErrorBoundary area="LiveOps control toggle (stand-in)" variant="strip">
              <PlainControlToggle robot={robot} run={run} />
            </ErrorBoundary>
          )}
        >
          <ModelControlToggle robot={robot} run={run} />
        </ErrorBoundary>
        {/* Beside Take control, and shown whether or not it is: a local
            setting, chosen before or while driving. */}
        <ErrorBoundary area="LiveOps speed control" variant="strip" resetKeys={resetKeys}>
          <SpeedControl robotId={robot.robot_id} />
        </ErrorBoundary>
        <ErrorBoundary area="LiveOps run buttons" variant="strip" resetKeys={resetKeys}>
          <RunButtons robot={robot} run={run} />
        </ErrorBoundary>
        <ErrorBoundary area="LiveOps command buttons" variant="strip" resetKeys={resetKeys}>
          <RobotButtons robot={robot} run={run} />
        </ErrorBoundary>
      </div>

      {/* Anchored, never shrinks, never scrolls — see the note above. Outside
          every boundary on purpose. */}
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
    </div>
  )
}
