import { useEffect, useState } from 'react'
import { Anchor, MoreHorizontal, OctagonX, Pause, Play, Repeat, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Badge, Button } from '@/components/kit'
import { color, font, glass, radius, space } from '@/design-system/tokens'
import { ActionButton, commandButtonStyle } from '@/components/liveops/mission/ActionButton'
import { ControlToggleButton } from '@/components/liveops/command/ControlToggleButton'
import { EStopButton } from '@/components/liveops/command/EStopButton'
import { DetectionButton } from '@/components/liveops/command/DetectionButton'
import { LedButton } from '@/components/liveops/command/LedButton'
import { ObstacleAvoidanceToggle } from '@/components/liveops/command/ObstacleAvoidanceToggle'
import { PostureButtons } from '@/components/liveops/command/PostureButtons'
import { SpeakButton } from '@/components/liveops/command/SpeakButton'
import { useOperatorName } from '@/lib/auth/useAccount'
import { UNWIRED_COMMANDS, deckEntries, type DeckEntry, type UnwiredCommand } from '@/liveops/commandDeck'
import { getCommandAvailability } from '@/liveops/commandPolicy'
import { legConfigLabelKey, legConfigOf, switchLegBodyKey, switchLegLabelKey } from '@/liveops/legConfig'
import type { Orientation } from '@/lib/touchShell'
import type { RobotRunView } from '@/liveops/robotRun'
import { formatClock, taskBarModel, type TaskBarModel } from '@/liveops/taskBar'
import { useLiveOpsStore } from '@/store/useLiveOpsStore'
import { missionProgress } from '@/types'
import type { CommandType, Mission, RobotState } from '@/types'
import { TOUCH_CONTROL_HEIGHT, TOUCH_TARGET_CSS } from './TouchTopStrip'

/**
 * The touch shell's persistent bottom dock: the operator controls, the "..."
 * sheet for what width demoted, and the E-Stop anchored at the right.
 *
 * It renders `liveops/commandDeck.ts` -- the same declaration the desktop
 * command bar renders -- so a control added to one shell cannot go missing
 * from the other (design anti-goal #2). `CurrentTaskBar.tsx` is the worked
 * example; this file is its counterpart, with its own `deck-controls` region
 * and its own two confirmations.
 *
 * The dock never collapses, and there is no control here for hiding the chrome
 * above it: LiveOps on touch opens as the live view and the strip's back
 * chevron is the way out (design §6.2). The E-Stop stays mounted throughout,
 * because the one state in which a stop control may not be on screen does not
 * exist.
 */

/**
 * Dock height: 64 px on a tablet, 56 px on a phone.
 *
 * It was 72/64 around 48/44 px controls, which the operator read as too tall
 * twice (2026-11-25) -- a dock that heavy takes a band off the picture the
 * whole shell exists to show, and on a phone the picture is the scarce
 * resource. 40 px controls in a 56 px dock still clear the WCAG 2.2 AA
 * target size comfortably.
 *
 * ⚠️ The E-Stop inside keeps its own 48 px: it is the one control in here
 * that should be the tallest thing in the row, and it sizes itself.
 */
/** The phone dock's stop: a floor, not a width -- `EStopButton` shrink-wraps
 * its own label above it (CORNER_ESTOP_SIZE says why that matters). 72 px is
 * what the driving corner already uses, and it is thumb-sized. */
export const PHONE_ESTOP_MIN_WIDTH = 72

export function touchDockHeight(big: boolean): number {
  return big ? 64 : 56
}

/** Icons for the plain one-command entries, as in `CurrentTaskBar`. The labels
 * are `command.taskBar.buttons.<type>`. */
const COMMAND_ICONS: Record<UnwiredCommand, React.ElementType> = {
  PAUSE: Pause,
  RETURN: RotateCcw,
  DOCK: Anchor,
}

const isUnwired = (type: CommandType): type is UnwiredCommand =>
  (UNWIRED_COMMANDS as readonly CommandType[]).includes(type)

/* ── deck-controls:begin ─────────────────────────────────────────────────────
 *
 * Every operator control this dock renders is declared in
 * `src/liveops/commandDeck.ts` and drawn here, from the one `switch (entry.kind)`
 * below -- the same arrangement as `CurrentTaskBar.tsx`'s region of the same
 * name. `TouchLiveOps.test.tsx` reads this region and fails when a `DeckKind`
 * has no `case`, so a control added to the deck cannot reach the desk and miss
 * the operator's hands.
 *
 * Outside the region, each for the reason `commandDeck.test.ts` records: the
 * E-Stop (anchored, never gated by control ownership, drawn by each shell's own
 * chrome), SpeedControl (a local setting, and on touch it belongs to the drive
 * strip -- Task 13) and the overflow sheet (the presentation of a tier, not a
 * control). Both confirmations stay with this component, which owns their state.
 */

/** What a deck entry needs beyond itself -- the touch counterpart of
 * `CurrentTaskBar`'s `DeckContext`, with the same two dialog openers. */
interface TouchDeckContext {
  robot: RobotState
  run: RobotRunView
  model: TaskBarModel
  /** Opens the leg-switch confirmation (the dialog lives in TouchDock). */
  onLegSwitch: () => void
  legSwitchLabel: string
  /** Opens the Stop mission confirmation (the dialog lives in TouchDock). */
  onStopMission: () => void
}

/** One deck entry, drawn. The only place a `DeckKind` becomes a control here. */
function TouchDeckControl({ entry, ctx }: { entry: DeckEntry; ctx: TouchDeckContext }) {
  const { t } = useTranslation()
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)
  const operatorName = useOperatorName()
  const { robot, run, model } = ctx
  const avail = (type: CommandType) => getCommandAvailability(robot, type, run)

  switch (entry.kind) {
    case 'control':
      return (
        <ControlToggleButton
          active={model.buttons.includes('release')}
          takeAvailability={avail('TAKE_CONTROL')}
          releaseAvailability={avail('RELEASE_CONTROL')}
          onTake={() => dispatchCommand(robot.robot_id, 'TAKE_CONTROL', t('command.control.takeCommand'), { operator: operatorName })}
          onRelease={() => dispatchCommand(robot.robot_id, 'RELEASE_CONTROL', t('command.control.releaseCommand'))}
        />
      )

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

    case 'retry':
      if (!run) return null
      return (
        <ActionButton
          icon={Play}
          tone="blue"
          label={t('command.taskBar.run.retry')}
          availability={avail('RESUME')}
          onClick={() => dispatchCommand(robot.robot_id, 'RESUME', t('command.taskBar.run.retryCommand'), { run_id: run.runId })}
        />
      )

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

/** The "..." sheet. Unlike the desktop's `CommandOverflowMenu`, which lists
 * one-command rows, this draws the demoted controls themselves: at phone width
 * the overflow tier holds Speak, LED, avoidance, the leg switch and Stop
 * mission, none of which is a plain command button. */
function OverflowSheet({ entries, ctx, onClose }: {
  entries: DeckEntry[]; ctx: TouchDeckContext; onClose: () => void
}) {
  return (
    <div
      data-touch-more=""
      role="menu"
      style={{
        position: 'absolute', bottom: '100%', zIndex: 60,
        // Centred and only as wide as it needs to be. Spanning the dock made
        // a menu of nine buttons look like a second page over the view
        // (operator, 2026-11-25). The cap is what makes it wrap at a sensible
        // measure: a shrink-to-fit box would resolve to its one-line
        // max-content width and fill the screen again.
        left: '50%', transform: 'translateX(-50%)',
        width: `min(calc(100vw - ${space[4] * 2}px), 320px)`,
        marginBottom: space[2], padding: space[3],
        // Centred, each control at its own width. A stretch grid gave every
        // one the same cell and made short labels look padded out; these are
        // buttons, not table rows (operator, 2026-11-25). Each keeps its icon
        // AND its word, which is the whole point of sending them here rather
        // than shrinking them on the dock.
        display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: space[2],
        // Glass, like the readings band and the map's tool group: it floats
        // on the picture, so it dims what is behind it rather than replacing
        // it. The scrim is what keeps the labels legible over a bright frame
        // (docs/audit/2026-08-12-ui-ux-audit.md A-16).
        ...glass.overlay, border: 'none', boxShadow: 'var(--rh-shadow-md)',
        borderRadius: radius.md,
      }}
      onClick={onClose}
    >
      {entries.map((entry) => <TouchDeckControl key={entry.key} entry={entry} ctx={ctx} />)}
    </div>
  )
}

/**
 * What the robot is doing, at the left-hand end of the dock -- the touch
 * counterpart of the desktop command bar's mission slot (`CurrentTaskBar`'s
 * `rh-cmdbar__mission`), which the touch shell had no equivalent of at all
 * (operator, 2026-11-25).
 *
 * ⚠️ **Tablet only, and that is arithmetic.** A phone's dock is 390 px and
 * already holds three controls and the stop; a mission title in front of
 * them would push the controls off their own bar. On a phone the map's run
 * card keeps the job, which is why `TouchWatchLayout` still draws it.
 *
 * The same `taskBarModel` the desktop bar reads, so the two cannot disagree
 * about what the robot is doing. One line, ellipsized: the progress bar and
 * the run's own links stay on the map's card, which has the room for them.
 */
function TouchDockMission({ robot, mission, run }: {
  robot: RobotState
  mission?: Mission
  run: RobotRunView
}) {
  const { t } = useTranslation()
  const now = useNow(run?.phase === 'running')
  const model = taskBarModel(run, robot, now)
  const hasRun = model.slot !== 'none' && model.slot !== 'manual'
  // No run, but a mission under way: the same fallback the desktop bar
  // makes, and the common case -- a robot walking a route has a mission and
  // no edge run behind it. 'manual' is what the strip and the deck already
  // say, so it stays blank rather than repeating them.
  if (!hasRun && (!mission || model.slot === 'manual')) return null

  const title = hasRun ? model.title : mission!.name
  const tag = hasRun ? model.tag : t(`command.taskBar.missionType.${mission!.type}`)
  const elapsed = model.progress ? formatClock(model.progress.elapsedS) : null
  const detail = hasRun
    ? [model.detail, elapsed].filter(Boolean).join(' \u00b7 ')
    : t('command.taskBar.waypoint', {
      current: mission!.current_waypoint_index + 1,
      total: mission!.waypoints.length,
    })
  const pct = hasRun
    ? (model.progress?.estimateS
      ? Math.min(100, Math.round((model.progress.elapsedS / model.progress.estimateS) * 100))
      : null)
    : missionProgress(mission!).pct

  return (
    <div
      data-touch-dock-mission=""
      style={{
        display: 'flex', flexDirection: 'column', gap: 1, minWidth: 0,
        maxWidth: 220, flexShrink: 0, marginRight: space[1],
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: space[2], minWidth: 0 }}>
        <span
          title={title}
          style={{
            fontSize: font.size.md, fontWeight: font.weight.semibold, color: color.t1,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0,
          }}
        >
          {title}
        </span>
        {tag && (hasRun ? <Badge tone={model.tagTone} dot>{tag}</Badge> : <Badge>{tag}</Badge>)}
      </div>
      {detail && (
        <span
          style={{
            fontSize: font.size.sm, color: color.t2, fontVariantNumeric: 'tabular-nums',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}
        >
          {detail}
        </span>
      )}
      {pct !== null && (
        <div
          role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}
          aria-label={t('command.taskBar.progressAria')}
          style={{ height: 3, background: color.border, borderRadius: radius.full, overflow: 'hidden' }}
        >
          <div style={{ width: `${pct}%`, height: '100%', background: color.accentSolid, borderRadius: radius.full }} />
        </div>
      )}
    </div>
  )
}

/** Re-render once a second while a run is going, so the elapsed time moves. */
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

export function TouchDock({ robot, mission, run, big, orientation, driving }: {
  robot: RobotState
  mission?: Mission
  run: RobotRunView
  big: boolean
  /** Which way round the device is. The deck tiers on the row's width, and
   * a phone in landscape has as much of it as a tablet. */
  orientation: Orientation
  /** True while the operator holds control. The corner stop is mounted then,
   * so this dock gives up its own rather than showing a second one, and its
   * set narrows to leave room beside the sticks (design §7.2.5). */
  driving: boolean
}) {
  const { t } = useTranslation()
  const dispatchCommand = useLiveOpsStore((s) => s.dispatchCommand)
  const latestEstopCommand = useLiveOpsStore((s) =>
    s.activeCommands.find((c) => c.type === 'ESTOP' && c.robot_id === robot.robot_id))
  const [more, setMore] = useState(false)
  const [stopConfirm, setStopConfirm] = useState(false)
  const [legConfirm, setLegConfirm] = useState(false)

  const h = touchDockHeight(big)
  const legConfig = legConfigOf(robot)
  const switchLegLabel = t(switchLegLabelKey(legConfig))
  const model = taskBarModel(run, robot)
  // Width, not device: a tablet dock has the room the desktop bar has.
  // Driving narrows the set whatever the screen: the sticks own the bottom
  // corners, so only the few controls an operator reaches for mid-drive stay
  // out of the overflow sheet.
  // The ROW's width, not the device's. A phone in landscape has 844 px of
  // dock and takes the full set, exactly as it did before the phone split
  // (operator, 2026-11-25); only portrait on a phone is actually narrow.
  // Driving is narrow at every size on purpose: the sticks own the width.
  const wideRow = (big || orientation === 'landscape') && !driving
  const entries = deckEntries(model, robot, wideRow ? 'wide' : 'narrow')
  const ctx: TouchDeckContext = {
    robot, run, model,
    legSwitchLabel: switchLegLabel,
    onLegSwitch: () => setLegConfirm(true),
    onStopMission: () => setStopConfirm(true),
  }
  const primary = entries.filter((e) => e.tier === 'primary')
  const overflow = entries.filter((e) => e.tier === 'overflow')

  return (
    <div
      data-touch-dock=""
      className="rh-touchdeck"
      style={{
        ['--rh-touch-target' as string]: `${TOUCH_CONTROL_HEIGHT}px`,
        position: 'relative', flexShrink: 0, height: h,
        display: 'flex', alignItems: 'center',
        // 6 px on a phone, measured: with the stop at 105 and three controls
        // the row came to 395 of 390, and the deck scrolled by five pixels.
        // The chrome is where that comes from, not the controls.
        gap: big ? space[2] : 6,
        padding: `0 ${big ? space[4] : space[2]}px`,
        background: color.surface, borderTop: `1px solid ${color.border}`,
      } as React.CSSProperties}
    >
      <style>{TOUCH_TARGET_CSS}</style>

      {/* The left-hand end: what the robot is doing. Tablet only -- see the
          component's own note. */}
      {big && <TouchDockMission robot={robot} mission={mission} run={run} />}

      {/* The controls. Scrolls rather than wrapping: the dock's height is
          fixed, so a wrapped row would be clipped instead of pushing anything
          down -- the failure mode docs/audit/2026-08-12-ui-ux-audit.md A-01
          describes for the desktop bar. */}
      <div
        data-touch-deck=""
        style={{
          flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: space[2],
          flexWrap: 'nowrap', overflowX: 'auto', overflowY: 'hidden',
          WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none',
        } as React.CSSProperties}
      >
        {primary.map((entry) => <TouchDeckControl key={entry.key} entry={entry} ctx={ctx} />)}
      </div>

      {/* Outside the scroller, and never squeezed. It was the last child of
          the scrolling row, so on a phone it was the control that got cut --
          and it is the one that must not be, because it is how everything
          the row could not fit is reached at all (operator, 2026-11-25). */}
      {overflow.length > 0 && (
        <button
          type="button"
          onClick={() => setMore((o) => !o)}
          aria-expanded={more}
          aria-haspopup="menu"
          title={t('command.overflow.moreTitle', { count: overflow.length })}
          style={{
            ...commandButtonStyle(), cursor: 'pointer', flexShrink: 0,
            background: more ? color.cardHover : color.card,
          }}
        >
          <MoreHorizontal size={16} strokeWidth={1.75} aria-hidden />
          <span>{t('command.overflow.more')}</span>
        </button>
      )}

      {more && <OverflowSheet entries={overflow} ctx={ctx} onClose={() => setMore(false)} />}

      {/* Anchored at the end, never shrinks, never scrolls, never gated by
          control ownership -- and mounted in every state of this shell,
          immersive included, EXCEPT while driving, when `TouchLiveOps` mounts
          the corner stop instead. `driving` is the same `operatorHoldsControl`
          predicate that mounts that one, read once in the shell, so the two
          cannot disagree and leave no stop on screen. */}
      {!driving && (
      <div
        style={{
          display: 'flex', alignItems: 'center', flexShrink: 0, paddingLeft: space[2],
          // A phone's stop is the square the driving corner already uses:
          // the desktop bar's 148 px is 38% of a 390 px row, and it was
          // taking that width from the controls beside it. The box is a
          // floor, so the label still decides the rest.
          ...(big
            ? { alignSelf: 'stretch' }
            : { minWidth: PHONE_ESTOP_MIN_WIDTH, height: TOUCH_CONTROL_HEIGHT }),
        }}
      >
        <EStopButton
          fill={!big}
          state={robot.abstract_state}
          engageCommand={latestEstopCommand}
          estopAvailability={getCommandAvailability(robot, 'ESTOP')}
          resetAvailability={getCommandAvailability(robot, 'RESET_ESTOP')}
          onEngage={() => dispatchCommand(robot.robot_id, 'ESTOP', t('command.estop.engageCommand'))}
          onRelease={() => dispatchCommand(robot.robot_id, 'RESET_ESTOP', t('command.estop.releaseCommand'))}
        />
      </div>
      )}

      {/* A stopped run cannot be resumed -- same confirmation as the desktop bar. */}
      <Dialog open={stopConfirm} onOpenChange={setStopConfirm}>
        <DialogContent style={{ background: color.elevated, border: `1px solid ${color.border}`, color: color.t1 }}>
          <DialogHeader>
            <DialogTitle>{t('command.taskBar.run.stopTitle')}</DialogTitle>
            <DialogDescription style={{ color: color.t2 }}>{t('command.taskBar.run.stopBody')}</DialogDescription>
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

      {/* CHANGE_MODE is a blind toggle on the SDK side; while the reading is
          'unknown' the body copy says so rather than naming a target. */}
      <Dialog open={legConfirm} onOpenChange={setLegConfirm}>
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
            <Button onClick={() => setLegConfirm(false)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              onClick={() => {
                dispatchCommand(robot.robot_id, 'CHANGE_MODE', switchLegLabel)
                setLegConfirm(false)
              }}
            >
              {switchLegLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
